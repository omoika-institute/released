/**
 * Graph Handlers Module
 *
 * IPC handlers for graph operations (entities, edges, transforms).
 */

import { Database } from "@tursodatabase/database";
import { randomUUID } from "node:crypto";
import { appendEvent } from "./events";
import { applyEvent } from "./projector";
import { enqueueJob, executeTransformJob } from "./jobs";
import type { GraphState, GraphEntity, GraphEdge } from "../../types/database";
import type {
  CreateEntityPayload,
  UpdateEntityPayload,
  DeleteEntityPayload,
  CreateEdgePayload,
  UpdateEdgePayload,
  DeleteEdgePayload,
  TransformPayload,
  RemoteGraphOperation,
} from "../ipc/graph";
import { BrowserWindow } from "electron";

const DEFAULT_ACTOR_ID = "local-user";
const UNVERIFIED_NODE_TYPE = "unverifiedNodeType";

type TransformRuntimeConfig = {
  venvPath?: string;
  pluginsPath?: string | string[];
  pythonPath?: string;
  pluginSettings?: Record<string, Record<string, string>>;
};

function resolveReactFlowNodeType(data: Record<string, any> = {}) {
  const rawType = typeof data.__nodeType === "string" ? data.__nodeType : "";
  if (rawType === UNVERIFIED_NODE_TYPE) {
    const resolutionStatus =
      typeof data.__resolutionStatus === "string"
        ? data.__resolutionStatus
        : "";
    const resolutionProvenance =
      data.agent_resolution_provenance &&
      typeof data.agent_resolution_provenance === "object" &&
      !Array.isArray(data.agent_resolution_provenance)
        ? data.agent_resolution_provenance
        : null;

    // Entity updates are projected as deep data merges. When an unverified
    // agent node is resolved, the old __nodeType can remain in the materialized
    // row even though the resolved blueprint data has replaced the node data.
    if (resolutionStatus === "resolved" || resolutionProvenance) {
      return "view";
    }

    return UNVERIFIED_NODE_TYPE;
  }
  return "view";
}

async function assertGraphExists(db: Database, graphId: string): Promise<void> {
  const row = await db
    .prepare(`SELECT 1 FROM cases WHERE uuid = ? LIMIT 1`)
    .get(graphId);

  if (!row) {
    throw new Error(`Case not found for graph operation: ${graphId}`);
  }
}

/**
 * Loads the current graph state (materialized entities and edges).
 */
export async function handleLoadGraph(
  db: Database,
  graphId: string
): Promise<GraphState> {
  // Query materialized entities
  const entitiesResult = await db
    .prepare(
      `
      SELECT doc, sys_from FROM entities_current
      WHERE graph_id = ? AND sys_to IS NULL
      ORDER BY sys_from ASC
    `
    )
    .all(graphId);

  // Query materialized edges
  const edgesResult = await db
    .prepare(
      `
      SELECT edge_id, src_id, dst_id, props
      FROM edges_current
      WHERE graph_id = ? AND sys_to IS NULL
      ORDER BY sys_from ASC
    `
    )
    .all(graphId);

  // Process entities
  const nodes = entitiesResult.map((row) => {
    const doc = JSON.parse(row.doc as string);
    const data = doc.data || {};
    const nodeType = resolveReactFlowNodeType(data);

    // Ensure React Flow compatible structure
    const entity: GraphEntity & { sys_from?: string; ctime?: string } = {
      id: doc.id,
      label: doc.label || "unknown",
      position: doc.position || { x: 0, y: 0 },
      data,
      type: nodeType, // React Flow node type
      sys_from: row.sys_from as string,
      ctime: row.sys_from as string,
    };

    // Surface label to data for React Flow
    if (!entity.data.label && entity.label) {
      entity.data.label = entity.label;
    }

    return entity;
  });

  // Process edges
  const edges = edgesResult.map((row) => {
    const props = JSON.parse(row.props as string);
    const edge: GraphEdge = {
      id: row.edge_id as string,
      source: row.src_id as string,
      target: row.dst_id as string,
      data: props,
      type: props.type || "sfloat",
      markerEnd: props.markerEnd || {
        type: "arrowclosed",
        color: "#535045",
        width: 16,
        height: 16,
      },
    };

    return edge;
  });

  return { nodes, edges };
}

/**
 * Creates a new entity on the graph.
 * Returns the created entity for optimistic UI update.
 */
export async function handleCreateEntity(
  db: Database,
  payload: CreateEntityPayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<GraphEntity> {
  const { graphId, entity } = payload;
  await assertGraphExists(db, graphId);

  const entityId = randomUUID();
  const entityDoc = {
    id: entityId,
    label: entity.label,
    position: { x: entity.x, y: entity.y },
    data: entity.data || {},
  };

  // Ensure data.label is set
  if (!entityDoc.data.label) {
    entityDoc.data.label = entity.label;
  }
  // Append event to event store
  let eventRecord: Awaited<ReturnType<typeof appendEvent>>;
  try {
    eventRecord = await appendEvent(db, {
      category: "entity",
      key: graphId,
      event_type: "create",
      payload: entityDoc,
      valid_from: new Date().toISOString(),
      actor_id: actorId,
    });
    await applyEvent(db, eventRecord);
  } catch (error) {
    throw error;
  }
  // Return optimistic entity for immediate UI update
  return {
    ...entityDoc,
    type: resolveReactFlowNodeType(entityDoc.data),
    sys_from: eventRecord.created_at,
    ctime: eventRecord.created_at,
  };
}

/**
 * Updates an existing entity.
 */
export async function handleUpdateEntity(
  db: Database,
  payload: UpdateEntityPayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<void> {
  const { graphId, entityId, updates } = payload;
  await assertGraphExists(db, graphId);

  const updatePayload: Record<string, any> = { id: entityId };
  updatePayload.position = {
    x: updates.x ?? 0,
    y: updates.y ?? 0,
  };
  updatePayload.data = updates.data ?? {};

  const eventRecord = await appendEvent(db, {
    category: "entity",
    key: graphId,
    event_type: "update",
    payload: updatePayload,
    valid_from: new Date().toISOString(),
    actor_id: actorId,
  });
  await applyEvent(db, eventRecord);
}

/**
 * Deletes an entity.
 */
export async function handleDeleteEntity(
  db: Database,
  payload: DeleteEntityPayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<void> {
  const { graphId, entityId } = payload;
  await assertGraphExists(db, graphId);

  const now = new Date().toISOString();

  const eventRecord = await appendEvent(db, {
    category: "entity",
    key: graphId,
    event_type: "delete",
    payload: { id: entityId },
    valid_from: now,
    actor_id: actorId,
  });
  await applyEvent(db, eventRecord);

  await db
    .prepare(
      `
      UPDATE entities_current
      SET sys_to = ?, valid_to = COALESCE(valid_to, ?)
      WHERE entity_id = ? AND graph_id = ? AND sys_to IS NULL
    `
    )
    .run(now, now, entityId, graphId);

  await db
    .prepare(
      `
      UPDATE edges_current
      SET sys_to = ?, valid_to = COALESCE(valid_to, ?)
      WHERE graph_id = ? AND sys_to IS NULL AND (src_id = ? OR dst_id = ?)
    `
    )
    .run(now, now, graphId, entityId, entityId);
}

/**
 * Creates a new edge.
 */
export async function handleCreateEdge(
  db: Database,
  payload: CreateEdgePayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<GraphEdge> {
  const { graphId, edge } = payload;
  await assertGraphExists(db, graphId);

  const edgeId = randomUUID();

  const edgeDoc = {
    id: edgeId,
    source: edge.source,
    target: edge.target,
    data: edge.data || {},
  };

  const eventRecord = await appendEvent(db, {
    category: "edge",
    key: graphId,
    event_type: "create",
    payload: edgeDoc,
    valid_from: new Date().toISOString(),
    actor_id: actorId,
  });
  await applyEvent(db, eventRecord);

  // Return optimistic edge for immediate UI update
  return {
    id: edgeId,
    source: edge.source,
    target: edge.target,
    data: edge.data || {},
    type: "sfloat",
    markerEnd: {
      type: "arrowclosed",
      color: "#535045",
      width: 16,
      height: 16,
    },
    temp_id: edge.temp_id, // Preserve for client-side replacement
  } as GraphEdge;
}

/**
 * Updates an existing edge.
 */
export async function handleUpdateEdge(
  db: Database,
  payload: UpdateEdgePayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<void> {
  const { graphId, edgeId, updates } = payload;
  await assertGraphExists(db, graphId);

  const updatePayload: Record<string, any> = { id: edgeId };

  if (updates.source) updatePayload.source = updates.source;
  if (updates.target) updatePayload.target = updates.target;
  if (updates.data) updatePayload.data = updates.data;

  const eventRecord = await appendEvent(db, {
    category: "edge",
    key: graphId,
    event_type: "update",
    payload: updatePayload,
    valid_from: new Date().toISOString(),
    actor_id: actorId,
  });
  await applyEvent(db, eventRecord);
}

/**
 * Deletes an edge.
 */
export async function handleDeleteEdge(
  db: Database,
  payload: DeleteEdgePayload,
  actorId: string = DEFAULT_ACTOR_ID
): Promise<void> {
  const { graphId, edgeId } = payload;
  await assertGraphExists(db, graphId);

  const now = new Date().toISOString();

  const eventRecord = await appendEvent(db, {
    category: "edge",
    key: graphId,
    event_type: "delete",
    payload: { id: edgeId },
    valid_from: now,
    actor_id: actorId,
  });
  await applyEvent(db, eventRecord);

  await db
    .prepare(
      `
      UPDATE edges_current
      SET sys_to = ?, valid_to = COALESCE(valid_to, ?)
      WHERE edge_id = ? AND graph_id = ? AND sys_to IS NULL
    `
    )
    .run(now, now, edgeId, graphId);
}

export async function handleApplyRemoteGraphOperation(
  db: Database,
  operation: RemoteGraphOperation,
  actorId: string = "remote-peer"
): Promise<void> {
  await assertGraphExists(db, operation.graphId);

  const appendProjectedEvent = async (
    category: "entity" | "edge",
    eventType: "create" | "update" | "delete",
    payload: Record<string, any>
  ) => {
    const eventRecord = await appendEvent(db, {
      category,
      key: operation.graphId,
      event_type: eventType,
      payload,
      valid_from: new Date().toISOString(),
      actor_id: actorId,
    });
    await applyEvent(db, eventRecord);
  };

  switch (operation.kind) {
    case "entity:create":
      await appendProjectedEvent("entity", "create", {
        id: operation.entity.id,
        label: operation.entity.label,
        position: operation.entity.position,
        data: operation.entity.data ?? {},
      });
      return;
    case "entity:update":
      const entityUpdatePayload: Record<string, any> = {
        id: operation.entityId,
      };
      if (
        operation.updates.x !== undefined ||
        operation.updates.y !== undefined
      ) {
        entityUpdatePayload.position = {};
        if (operation.updates.x !== undefined) {
          entityUpdatePayload.position.x = operation.updates.x;
        }
        if (operation.updates.y !== undefined) {
          entityUpdatePayload.position.y = operation.updates.y;
        }
      }
      if (operation.updates.data !== undefined) {
        entityUpdatePayload.data = operation.updates.data;
      }
      await appendProjectedEvent("entity", "update", entityUpdatePayload);
      return;
    case "entity:delete":
      await appendProjectedEvent("entity", "delete", { id: operation.entityId });
      return;
    case "edge:create":
      await appendProjectedEvent("edge", "create", {
        id: operation.edge.id,
        source: operation.edge.source,
        target: operation.edge.target,
        data: operation.edge.data ?? {},
      });
      return;
    case "edge:update":
      await appendProjectedEvent("edge", "update", {
        id: operation.edgeId,
        ...operation.updates,
      });
      return;
    case "edge:delete":
      await appendProjectedEvent("edge", "delete", { id: operation.edgeId });
      return;
  }
}

/**
 * Initiates a transform on an entity.
 */
export async function handleTransform(
  db: Database,
  payload: TransformPayload,
  actorId: string = DEFAULT_ACTOR_ID,
  mainWindow?: BrowserWindow,
  runtimeConfig?: TransformRuntimeConfig
): Promise<{ jobId: string }> {
  const { graphId, entity, transformLabel } = payload;
  await assertGraphExists(db, graphId);

  // Enqueue transform job
  const job = await enqueueJob(db, {
    payload: {
      action: "transform:entity",
      graph_id: graphId,
      entity: { ...entity, transform: transformLabel },
      actor_id: actorId,
    },
  });

  // Execute job immediately (async)
  executeTransformJob(
    db,
    job.job_id,
    actorId,
    mainWindow,
    runtimeConfig?.venvPath,
    runtimeConfig?.pluginsPath,
    runtimeConfig?.pythonPath,
    runtimeConfig?.pluginSettings
  ).catch((error) => {
    console.error(`Transform job ${job.job_id} failed:`, error);
  });

  return { jobId: job.job_id };
}
