/**
 * Job Manager Module
 *
 * Handles job lifecycle for transform execution.
 */
import { Database } from "@tursodatabase/database";
import { randomUUID } from "node:crypto";
import { appendEvent, appendJobEvent } from "./events";
import { buildPluginSettingsConfig, execObTransformStream } from "./cli";
import type { Job, NewJob, GraphEntity } from "../../types/database";
import { BrowserWindow } from "electron";

const DEFAULT_PRIORITY = 0;
const DEFAULT_MAX_ATTEMPTS = 3;
const LEASE_DURATION_SEC = 300; // 5 minutes
const JOB_PROCESSOR_INTERVAL_MS = 2000;
const JOB_PROCESSOR_BATCH_SIZE = 4;
let jobProcessorInterval: NodeJS.Timeout | null = null;

const sendJobEvents = (
  mainWindow: BrowserWindow | undefined,
  jobId: string,
  events: Array<{ type: string; data: Record<string, any> }>
): void => {
  if (!mainWindow || events.length === 0) return;
  mainWindow.webContents.send("job:events", { jobId, events });
};

const formatTransformError = (
  error: any
): { message: string; code?: string; details?: Record<string, any> } => {
  const baseMessage =
    typeof error?.message === "string" && error.message.trim()
      ? error.message.trim()
      : "Transform failed";
  const details =
    error?.details && typeof error.details === "object" ? error.details : undefined;
  const code = typeof error?.code === "string" ? error.code : undefined;

  if (!details) {
    return { message: baseMessage, code };
  }

  const transformPath =
    typeof details.transform_path === "string" ? details.transform_path.trim() : "";
  const sourcePath =
    typeof details.source_path === "string" ? details.source_path.trim() : "";
  const rawLineNumber = details.line_number;
  const lineNumber =
    typeof rawLineNumber === "number"
      ? rawLineNumber
      : rawLineNumber != null
        ? Number(rawLineNumber)
        : null;
  const location = sourcePath
    ? `${sourcePath}${lineNumber && Number.isFinite(lineNumber) ? `:${lineNumber}` : ""}`
    : "";

  if (
    (!transformPath || baseMessage.includes(transformPath)) &&
    (!location || baseMessage.includes(location))
  ) {
    return { message: baseMessage, code, details };
  }

  const suffix = [transformPath, location].filter(Boolean).join(" @ ");
  return {
    message: suffix ? `${baseMessage} (${suffix})` : baseMessage,
    code,
    details,
  };
};

const splitTransformResults = (
  payload: any[]
): {
  normal: any[];
  subgraphs: any[];
} => {
  const normal: any[] = [];
  const subgraphs: any[] = [];
  for (const item of payload) {
    if (item && item._type === "subgraph") {
      subgraphs.push(item);
    } else {
      normal.push(item);
    }
  }
  return { normal, subgraphs };
};

/**
 * Enqueues a new job for processing.
 */
export async function enqueueJob(db: Database, job: NewJob): Promise<Job> {
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const scheduledAt = job.scheduled_at || now;

  await db
    .prepare(
      `
      INSERT INTO jobs (
        job_id, payload, status, priority, attempts, max_attempts,
        scheduled_at, created_at
      ) VALUES (?, ?, 'enqueued', ?, 0, ?, ?, ?)
    `
    )
    .run(
      jobId,
      JSON.stringify(job.payload),
      job.priority ?? DEFAULT_PRIORITY,
      job.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      scheduledAt,
      now
    );

  return getJob(db, jobId) as Promise<Job>;
}

/**
 * Gets a job by ID.
 */
export async function getJob(db: Database, jobId: string): Promise<Job | null> {
  const row = await db
    .prepare(`SELECT * FROM jobs WHERE job_id = ?`)
    .get(jobId);

  if (!row) return null;

  return {
    job_id: row.job_id as string,
    payload: JSON.parse(row.payload as string),
    status: row.status as Job["status"],
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    lease_owner: (row.lease_owner as string) || null,
    lease_expires_at: (row.lease_until as string) || null,
    scheduled_at: row.scheduled_at as string,
    started_at: (row.started_at as string) || null,
    completed_at: (row.finished_at as string) || null,
    error_message: null, // Not in schema
    created_at: row.created_at as string,
    updated_at: row.created_at as string, // Use created_at as fallback
  };
}

/**
 * Tries to claim a job for processing.
 * Returns true if successful, false if already claimed.
 */
export async function tryClaimJob(
  db: Database,
  jobId: string,
  owner: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + LEASE_DURATION_SEC * 1000
  ).toISOString();

  const result = await db
    .prepare(
      `
      UPDATE jobs
      SET lease_owner = ?, lease_until = ?
      WHERE job_id = ? AND lease_owner IS NULL AND status = 'enqueued'
    `
    )
    .run(owner, expiresAt, jobId);

  return result.changes > 0;
}

/**
 * Marks a job as started.
 */
export async function startJob(
  db: Database,
  jobId: string,
  owner: string
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
      UPDATE jobs
      SET status = 'running', started_at = ?, attempts = attempts + 1
      WHERE job_id = ? AND lease_owner = ?
    `
    )
    .run(now, jobId, owner);
}

/**
 * Marks a job as completed.
 */
export async function completeJob(
  db: Database,
  jobId: string,
  owner: string
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
      UPDATE jobs
      SET status = 'completed', finished_at = ?, lease_owner = NULL
      WHERE job_id = ? AND lease_owner = ?
    `
    )
    .run(now, jobId, owner);
}

/**
 * Marks a job as failed.
 */
export async function failJob(
  db: Database,
  jobId: string,
  owner: string,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
      UPDATE jobs
      SET status = 'failed', finished_at = ?, lease_owner = NULL
      WHERE job_id = ? AND lease_owner = ?
    `
    )
    .run(now, jobId, owner);
}

/**
 * Executes a transform job.
 * This uses the `ob` IPC worker and streams progress events.
 */
export async function executeTransformJob(
  db: Database,
  jobId: string,
  actorId: string,
  mainWindow?: BrowserWindow,
  venv_path?: string,
  pluginsPath?: string | string[],
  pythonPath?: string,
  pluginSettings?: Record<string, Record<string, string>>
): Promise<void> {
  const job = await getJob(db, jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const OWNER = "electron-worker";

  // Try to claim the job
  const claimed = await tryClaimJob(db, jobId, OWNER);
  if (!claimed) {
    console.log(`Job ${jobId} already claimed or not enqueued`);
    return;
  }

  // Start the job
  await startJob(db, jobId, OWNER);

  sendJobEvents(mainWindow, jobId, [
    {
      type: "progress",
      data: { message: "Executing transform...", percent: 0 },
    },
  ]);

  try {
    const transformLabel =
      typeof (job.payload as any)?.entity?.transform === "string"
        ? (job.payload as any).entity.transform
        : null;
    const payloadStr = JSON.stringify(job.payload);
    let offset = 0;
    let streamedResults = false;
    let pending = Promise.resolve();

    const enqueue = (fn: () => Promise<void>) => {
      pending = pending.then(fn).catch((error) => {
        console.error(`[CLI] Stream handling failed for job ${jobId}:`, error);
      });
      return pending;
    };

    await execObTransformStream(payloadStr, {
      pluginsPath,
      venvPath: venv_path,
      pythonPath,
      cfg: buildPluginSettingsConfig(pluginSettings, transformLabel),
      onEvent: (event) => {
        if (event.event === "progress") {
          enqueue(async () => {
            const message =
              event.payload?.message ?? event.payload?.note ?? "Processing...";
            const rawPercent =
              event.payload?.percent ?? event.payload?.progress;
            const percent =
              typeof rawPercent === "number"
                ? rawPercent
                : rawPercent != null
                  ? Number(rawPercent)
                  : -1;
            const progressPayload = {
              ...event.payload,
              message,
              note: message,
              percent,
            };
            sendJobEvents(mainWindow, jobId, [
              { type: "progress", data: progressPayload },
            ]);
          });
        }

        if (event.event === "result" && Array.isArray(event.payload)) {
          streamedResults = true;
          enqueue(async () => {
            const { normal, subgraphs } = splitTransformResults(event.payload);
            const uiEntities: GraphEntity[] = [];
            const uiEdges: any[] = [];

            if (normal.length) {
              const normalResults = await persistTransformOutputs(
                db,
                job.payload.graph_id,
                jobId,
                job.payload.entity,
                normal,
                actorId,
                offset
              );
              offset += normal.length;
              uiEntities.push(...normalResults.uiEntities);
              uiEdges.push(...normalResults.uiEdges);
            }

            for (const subgraph of subgraphs) {
              const subgraphResults = await persistSubgraphOutputs(
                db,
                job.payload.graph_id,
                jobId,
                job.payload.entity,
                subgraph,
                actorId,
                offset
              );
              offset += subgraphResults.rootCount;
              uiEntities.push(...subgraphResults.uiEntities);
              uiEdges.push(...subgraphResults.uiEdges);
            }

            if (uiEntities.length || uiEdges.length) {
              await appendJobEvent(
                db,
                jobId,
                {
                  type: "result",
                  data: { entities: uiEntities, edges: uiEdges },
                },
                actorId
              );
              sendJobEvents(mainWindow, jobId, [
                {
                  type: "result",
                  data: { entities: uiEntities, edges: uiEdges },
                },
              ]);
            }
          });
        }
      },
    });

    await pending;

    await completeJob(db, jobId, OWNER);

    if (mainWindow) {
      const finalJob = await getJob(db, jobId);
      mainWindow.webContents.send("transform:completed", {
        jobId,
        job: finalJob,
        entities: [],
        edges: [],
        streamed: streamedResults,
      });
    }
  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    const errorPayload = formatTransformError(error);

    // Append error event
    await appendJobEvent(
      db,
      jobId,
      {
        type: "error",
        data: errorPayload,
      },
      actorId
    );

    // Fail the job
    await failJob(db, jobId, OWNER, errorPayload.message);

    // Notify renderer about error
    sendJobEvents(mainWindow, jobId, [
      {
        type: "error",
        data: errorPayload,
      },
    ]);
  }
}

/**
 * Persists transform outputs as entity and edge events.
 * Mirrors the Rust persist_transform_outputs logic.
 */
async function persistTransformOutputs(
  db: Database,
  graphId: string,
  jobId: string,
  sourceEntity: GraphEntity,
  outputs: any,
  actorId: string,
  offset: number = 0
): Promise<{ uiEntities: GraphEntity[]; uiEdges: any[] }> {
  const srcId = sourceEntity.id;
  const srcPos = sourceEntity.position;
  const transformLabel = (sourceEntity as any).transform || "transform";

  // Normalize outputs to array
  const items = Array.isArray(outputs) ? outputs : [outputs];

  const baseX = srcPos?.x || 0;
  const baseY = srcPos?.y || 0;
  const stepX = 460;
  const stepY = 260;

  const uiEntities: GraphEntity[] = [];
  const uiEdges: any[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = item.label || "unknown";
    const entityId = randomUUID();

    // Calculate position in grid layout (4 per row)
    const index = i + offset;
    const col = index % 4;
    const row = Math.floor(index / 4);
    const position = {
      x: baseX + (col + 1) * stepX,
      y: baseY + row * stepY,
    };

    // Remove non-data fields
    const { edge_label, label: _, ...data } = item;
    if (!data.label) data.label = label;

    // Create entity event
    const entityDoc = {
      id: entityId,
      position,
      label,
      data,
    };

    await appendEvent(db, {
      category: "entity",
      key: graphId,
      event_type: "create",
      payload: entityDoc,
      valid_from: new Date().toISOString(),
      correlation_id: jobId,
      actor_id: actorId,
    });

    // Create edge event
    const edgeId = randomUUID();
    const edgeLabel = item.edge_label || transformLabel;
    const edgeDoc = {
      id: edgeId,
      source: srcId,
      target: entityId,
      label: edgeLabel,
      data: {},
    };

    await appendEvent(db, {
      category: "edge",
      key: graphId,
      event_type: "create",
      payload: edgeDoc,
      valid_from: new Date().toISOString(),
      correlation_id: jobId,
      actor_id: actorId,
    });

    // Prepare UI entities/edges
    uiEntities.push({
      ...entityDoc,
      type: "edit",
    });

    uiEdges.push({
      id: edgeId,
      source: srcId,
      target: entityId,
      label: edgeLabel,
      data: {},
      type: "sfloat",
      markerEnd: {
        type: "arrowclosed",
        color: "#535045",
        width: 16,
        height: 16,
      },
    });
  }

  return { uiEntities, uiEdges };
}

/**
 * Persists subgraph outputs as entity and edge events.
 */
async function persistSubgraphOutputs(
  db: Database,
  graphId: string,
  jobId: string,
  sourceEntity: GraphEntity,
  subgraph: any,
  actorId: string,
  offset: number = 0
): Promise<{ uiEntities: GraphEntity[]; uiEdges: any[]; rootCount: number }> {
  const srcPos = sourceEntity.position;
  const baseX = srcPos?.x || 0;
  const baseY = srcPos?.y || 0;
  const stepX = 460;
  const stepY = 260;

  const rootEntities = Array.isArray(subgraph?.entities)
    ? subgraph.entities
    : [];
  const subgraphEdges = Array.isArray(subgraph?.edges) ? subgraph.edges : [];

  const idMap = new Map<string, string>();
  const positionMap = new Map<string, { x: number; y: number }>();
  const uiEntities: GraphEntity[] = [];
  const uiEdges: any[] = [];
  let rootCount = 0;

  const addEntityNode = async (
    entity: any,
    index: number,
    parentId?: string
  ): Promise<string> => {
    const rawData =
      entity?.data && typeof entity.data === "object" ? entity.data : entity;
    const { _children, label: rawLabel, ...rest } = rawData ?? {};
    const label = rawLabel || rawData?.label || "unknown";
    const rawIdValue = entity?.id ?? rawData?.id;
    const rawKey = rawIdValue != null ? String(rawIdValue) : undefined;
    const id = rawKey ?? randomUUID();
    if (rawKey) idMap.set(rawKey, id);

    const parentPos = parentId ? positionMap.get(parentId) : null;
    const explicitPosition =
      entity?.position && typeof entity.position === "object"
        ? entity.position
        : rawData?.position && typeof rawData.position === "object"
          ? rawData.position
          : null;
    const position = explicitPosition
      ? { x: explicitPosition.x ?? baseX, y: explicitPosition.y ?? baseY }
      : parentPos
        ? {
            x: parentPos.x + stepX,
            y: parentPos.y + stepY * (index + 1),
          }
        : {
            x: baseX + ((index % 4) + 1) * stepX,
            y: baseY + Math.floor(index / 4) * stepY,
          };

    const data = { ...(rest ?? {}) };
    if (!data.label) data.label = label;
    if (!data.id) data.id = id;

    const entityDoc = {
      id,
      position,
      label,
      data,
    };

    await appendEvent(db, {
      category: "entity",
      key: graphId,
      event_type: "create",
      payload: entityDoc,
      valid_from: new Date().toISOString(),
      correlation_id: jobId,
      actor_id: actorId,
    });

    uiEntities.push({ ...entityDoc, type: "edit" });
    positionMap.set(id, position);

    if (parentId) {
      const edgeId = randomUUID();
      const edgeDoc = {
        id: edgeId,
        source: parentId,
        target: id,
        data: { label: "contains" },
      };
      await appendEvent(db, {
        category: "edge",
        key: graphId,
        event_type: "create",
        payload: edgeDoc,
        valid_from: new Date().toISOString(),
        correlation_id: jobId,
        actor_id: actorId,
      });
      uiEdges.push({
        id: edgeId,
        source: parentId,
        target: id,
        label: "contains",
        data: { label: "contains" },
        type: "sfloat",
        markerEnd: {
          type: "arrowclosed",
          color: "#535045",
          width: 16,
          height: 16,
        },
      });
    }

    const children = Array.isArray(rawData?._children) ? rawData._children : [];
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      await addEntityNode(children[childIndex], childIndex, id);
    }

    return id;
  };

  for (let i = 0; i < rootEntities.length; i++) {
    await addEntityNode(rootEntities[i], offset + i);
    rootCount += 1;
  }

  for (const edge of subgraphEdges) {
    const sourceKey = edge?.source != null ? String(edge.source) : null;
    const targetKey = edge?.target != null ? String(edge.target) : null;
    if (!sourceKey || !targetKey) continue;
    const source = idMap.get(sourceKey) ?? sourceKey;
    const target = idMap.get(targetKey) ?? targetKey;
    const label = edge?.label || "";
    const data = { ...(edge?.properties ?? {}) };
    if (label) data.label = label;
    if (edge?.color) data.color = edge.color;
    if (edge?.style) data.style = edge.style;
    if (edge?.width) data.width = edge.width;
    if (edge?.animated) data.animated = edge.animated;

    const edgeId = randomUUID();
    const edgeDoc = {
      id: edgeId,
      source,
      target,
      data,
    };

    await appendEvent(db, {
      category: "edge",
      key: graphId,
      event_type: "create",
      payload: edgeDoc,
      valid_from: new Date().toISOString(),
      correlation_id: jobId,
      actor_id: actorId,
    });

    uiEdges.push({
      id: edgeId,
      source,
      target,
      label,
      data,
      type: "sfloat",
      markerEnd: {
        type: "arrowclosed",
        color: "#535045",
        width: 16,
        height: 16,
      },
      animated: Boolean(edge?.animated),
    });
  }

  return { uiEntities, uiEdges, rootCount };
}

/**
 * Background job processor - polls for pending jobs and executes them.
 */
export async function startJobProcessor(
  db: Database,
  mainWindow?: BrowserWindow,
  venv_path?: string,
  pluginsPath?: string | string[],
  pythonPath?: string,
  pluginSettings?: Record<string, Record<string, string>>
): Promise<void> {
  if (jobProcessorInterval) {
    console.warn("Job processor already running");
    return;
  }

  console.log("Job processor started");

  const processJobs = async () => {
    try {
      // Find jobs that are enqueued and not leased
      const result = await db
        .prepare(
          `
          SELECT job_id FROM jobs
          WHERE status = 'enqueued'
            AND (lease_owner IS NULL OR lease_until < ?)
          ORDER BY priority DESC, created_at ASC
          LIMIT ?
        `
        )
        .all(new Date().toISOString(), JOB_PROCESSOR_BATCH_SIZE);

      if (result.length > 0) {
        await Promise.allSettled(
          result.map((row) =>
            executeTransformJob(
              db,
              row.job_id as string,
              // TODO: Deprecate
              "local-user",
              mainWindow,
              venv_path,
              pluginsPath,
              pythonPath,
              pluginSettings
            )
          )
        );
      }
    } catch (error) {
      console.error("Error processing jobs:", error);
    }
  };

  // Poll every 2 seconds
  jobProcessorInterval = setInterval(processJobs, JOB_PROCESSOR_INTERVAL_MS);
}

export function stopJobProcessor(): void {
  if (!jobProcessorInterval) return;
  clearInterval(jobProcessorInterval);
  jobProcessorInterval = null;
}
