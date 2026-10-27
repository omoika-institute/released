/**
 * Projector Module
 *
 * Background process that materializes events into entities_current and edges_current tables.
 */
import { Database } from "@tursodatabase/database";
import {
  getCheckpoint,
  setCheckpoint,
  getEventsAfter,
  getStream,
} from "./events";
import type { EventRecord } from "../../types/database";

const PROJECTION_NAME = "graph_materializer";
const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 10;

let projectorRunning = false;
let projectorStop = false;
let projectorLoopPromise: Promise<void> | null = null;
let wakeProjectorSleep: (() => void) | null = null;

function getEventDiagnostic(event: EventRecord): Record<string, unknown> {
  return {
    seq: event.seq,
    stream_id: event.stream_id,
    event_type: event.event_type,
    payload_id:
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>).id
        : undefined,
  };
}

async function graphExists(db: Database, graphId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM cases WHERE uuid = ? LIMIT 1`)
    .get(graphId);
  return Boolean(row);
}

/**
 * Starts the projector background process.
 * This continuously polls for new events and projects them.
 */
export async function startProjector(db: Database): Promise<void> {
  if (projectorRunning) {
    console.warn("Projector already running");
    return;
  }

  projectorRunning = true;
  projectorStop = false;
  console.log(`Projector '${PROJECTION_NAME}' started`);

  const loop = runProjectorLoop(db);
  projectorLoopPromise = loop;

  loop
    .catch((error) => {
      console.error("Projector crashed:", error);
    })
    .finally(() => {
      if (projectorLoopPromise === loop) {
        projectorLoopPromise = null;
      }
      projectorRunning = false;
    });
}

/**
 * Stops the projector background process.
 */
export async function stopProjector(): Promise<void> {
  console.log("Stopping projector...");
  projectorStop = true;
  wakeProjectorSleep?.();

  if (!projectorLoopPromise) return;

  try {
    await projectorLoopPromise;
  } catch {
    // The loop logs its own failures; callers only need shutdown completion.
  }
}

/**
 * Main projector loop - continuously processes events.
 */
async function runProjectorLoop(db: Database): Promise<void> {
  let lastSeq = await getCheckpoint(db, PROJECTION_NAME);

  while (!projectorStop) {
    try {
      const events = await getEventsAfter(db, lastSeq, BATCH_SIZE);

      if (events.length === 0) {
        // No new events, wait before polling again
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Process events in batch
      for (const event of events) {
        try {
          await applyEvent(db, event);
          lastSeq = event.seq;
          // CRITICAL: Yield to event loop after each event
          // Turso uses sync better-sqlite3, must yield to prevent blocking
          await new Promise((resolve) => setImmediate(resolve));
        } catch (error) {
          console.error("Projector failed to apply event:", {
            ...getEventDiagnostic(event),
            error,
          });
          // Back off to avoid hot loop on poison pill
          await sleep(2000);
          break;
        }
      }

      // Save checkpoint after processing batch
      await setCheckpoint(db, PROJECTION_NAME, lastSeq);
    } catch (error) {
      if (!projectorStop) {
        console.error("Projector loop failed:", error);
      }
      await sleep(1000);
    }
  }

  projectorRunning = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let wake: () => void = () => {};
    const timeout = setTimeout(() => {
      if (wakeProjectorSleep === wake) {
        wakeProjectorSleep = null;
      }
      resolve();
    }, ms);

    wake = () => {
      clearTimeout(timeout);
      if (wakeProjectorSleep === wake) {
        wakeProjectorSleep = null;
      }
      resolve();
    };
    wakeProjectorSleep = wake;
  });
}

/**
 * Applies a single event to the materialized views.
 */
export async function applyEvent(
  db: Database,
  event: EventRecord
): Promise<void> {
  // Get stream info to determine category and graph UUID
  const stream = await getStream(db, event.stream_id);
  if (!stream) {
    console.error(`Stream not found: ${event.stream_id}`);
    return;
  }

  const graphId = stream.key; // UUID of the graph
  const category = stream.category;

  if (category === "entity") {
    if (!(await graphExists(db, graphId))) {
      console.warn("Skipping entity event for missing graph:", {
        ...getEventDiagnostic(event),
        graph_id: graphId,
      });
      return;
    }
    await applyEntityEvent(db, event, graphId);
  } else if (category === "edge") {
    if (!(await graphExists(db, graphId))) {
      console.warn("Skipping edge event for missing graph:", {
        ...getEventDiagnostic(event),
        graph_id: graphId,
      });
      return;
    }
    await applyEdgeEvent(db, event, graphId);
  }
}

/**
 * Applies entity events (create, update, delete).
 */
async function applyEntityEvent(
  db: Database,
  event: EventRecord,
  graphId: string
): Promise<void> {
  const entityId = event.payload.id;
  if (!entityId) {
    console.error("Entity event missing id:", event.payload);
    return;
  }

  switch (event.event_type) {
    case "create":
      await handleEntityCreate(db, graphId, entityId, event);
      break;
    case "update":
      await handleEntityUpdate(db, graphId, entityId, event);
      break;
    case "delete":
      await handleEntityDelete(db, graphId, entityId, event);
      break;
  }
}

/**
 * Handles entity create events.
 */
async function handleEntityCreate(
  db: Database,
  graphId: string,
  entityId: string,
  event: EventRecord
): Promise<void> {
  // Normalize the document structure
  let doc = { ...event.payload };

  // Ensure label and entity_type are at top level
  if (doc.data && doc.data.label) {
    doc.label = doc.data.label;
  }
  if (doc.data && doc.data.entity_type) {
    doc.entity_type = doc.data.entity_type;
  }

  // Ensure data.label mirrors entity_type
  const entityType = doc.entity_type || doc.label;
  if (entityType) {
    if (!doc.data) doc.data = {};
    doc.data.label = entityType;
  }

  const now = new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO entities_current (entity_id, graph_id, doc, valid_from, valid_to, sys_from, sys_to)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT (graph_id, entity_id) DO UPDATE SET
        graph_id = excluded.graph_id,
        doc = excluded.doc,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        sys_from = ?,
        sys_to = NULL
    `
    )
    .run(
      entityId,
      graphId,
      JSON.stringify(doc),
      event.valid_from,
      event.valid_to,
      now,
      now
    );
}

/**
 * Handles entity update events.
 */
async function handleEntityUpdate(
  db: Database,
  graphId: string,
  entityId: string,
  event: EventRecord
): Promise<void> {
  // Load current document
  const current = await db
    .prepare(
      `SELECT doc FROM entities_current WHERE entity_id = ? AND graph_id = ? AND sys_to IS NULL`
    )
    .get(entityId, graphId);

  if (!current) {
    // Entity doesn't exist, skip update
    return;
  }

  let doc = JSON.parse(current.doc as string);
  // Merge updates into current doc
  for (const [key, value] of Object.entries(event.payload)) {
    if (key === "id") continue; // Don't update id

    if (
      key === "data" &&
      typeof value === "object" &&
      typeof doc.data === "object"
    ) {
      // Deep merge data object
      doc.data = { ...doc.data, ...value };
    } else if (key === "position" && typeof value === "object" && value) {
      const positionValue = value as Record<string, unknown>;
      const position =
        typeof doc.position === "object" && doc.position ? doc.position : {};
      const nextPosition = { ...position };
      if (typeof positionValue.x === "number") nextPosition.x = positionValue.x;
      if (typeof positionValue.y === "number") nextPosition.y = positionValue.y;
      doc.position = nextPosition;
    } else if (key === "x" || key === "y") {
      const position =
        typeof doc.position === "object" && doc.position ? doc.position : {};
      const nextPosition = { ...position };
      if (key === "x" && typeof value === "number") nextPosition.x = value;
      if (key === "y" && typeof value === "number") nextPosition.y = value;
      doc.position = nextPosition;
    } else {
      doc[key] = value;
    }
  }

  // Normalize label/entity_type
  if (doc.data && doc.data.label) {
    doc.label = doc.data.label;
  }
  if (doc.data && doc.data.entity_type) {
    doc.entity_type = doc.data.entity_type;
  }

  // Ensure data.label mirrors entity_type
  const entityType = doc.entity_type || doc.label;
  if (entityType && doc.data) {
    doc.data.label = entityType;
  }

  const now = new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO entities_current (entity_id, graph_id, doc, valid_from, valid_to, sys_from, sys_to)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT (graph_id, entity_id) DO UPDATE SET
        graph_id = excluded.graph_id,
        doc = excluded.doc,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        sys_from = ?,
        sys_to = NULL
    `
    )
    .run(
      entityId,
      graphId,
      JSON.stringify(doc),
      event.valid_from,
      event.valid_to,
      now,
      now
    );
}

/**
 * Handles entity delete events.
 */
async function handleEntityDelete(
  db: Database,
  graphId: string,
  entityId: string,
  event: EventRecord
): Promise<void> {
  const now = new Date().toISOString();

  // Mark entity as deleted
  await db
    .prepare(
      `
      UPDATE entities_current
      SET sys_to = ?, valid_to = COALESCE(valid_to, ?)
      WHERE entity_id = ? AND graph_id = ? AND sys_to IS NULL
    `
    )
    .run(now, now, entityId, graphId);

  // Also mark incident edges as deleted
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
 * Applies edge events (create, update, delete).
 */
async function applyEdgeEvent(
  db: Database,
  event: EventRecord,
  graphId: string
): Promise<void> {
  const edgeId = event.payload.id;
  if (!edgeId) {
    console.error("Edge event missing id:", event.payload);
    return;
  }

  switch (event.event_type) {
    case "create":
      await handleEdgeCreate(db, graphId, edgeId, event);
      break;
    case "update":
      await handleEdgeUpdate(db, graphId, edgeId, event);
      break;
    case "delete":
      await handleEdgeDelete(db, graphId, edgeId, event);
      break;
  }
}

/**
 * Handles edge create events.
 */
async function handleEdgeCreate(
  db: Database,
  graphId: string,
  edgeId: string,
  event: EventRecord
): Promise<void> {
  const source = event.payload.source;
  const target = event.payload.target;

  if (!source || !target) {
    console.error("Edge event missing source/target:", event.payload);
    return;
  }

  const props = event.payload.data || {};
  const now = new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO edges_current (edge_id, src_id, dst_id, graph_id, props, valid_from, valid_to, sys_from, sys_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT (edge_id) DO UPDATE SET
        src_id = excluded.src_id,
        dst_id = excluded.dst_id,
        graph_id = excluded.graph_id,
        props = excluded.props,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        sys_from = ?,
        sys_to = NULL
    `
    )
    .run(
      edgeId,
      source,
      target,
      graphId,
      JSON.stringify(props),
      event.valid_from,
      event.valid_to,
      now,
      now
    );
}

/**
 * Handles edge update events.
 */
async function handleEdgeUpdate(
  db: Database,
  graphId: string,
  edgeId: string,
  event: EventRecord
): Promise<void> {
  // Load current edge
  const current = await db
    .prepare(
      `SELECT src_id, dst_id, props FROM edges_current WHERE edge_id = ? AND graph_id = ? AND sys_to IS NULL`
    )
    .get(edgeId, graphId);

  if (!current) {
    return; // Edge doesn't exist
  }

  let srcId = current.src_id as string;
  let dstId = current.dst_id as string;
  let props = JSON.parse(current.props as string);

  // Merge updates
  if (event.payload.source) srcId = event.payload.source;
  if (event.payload.target) dstId = event.payload.target;
  if (event.payload.data) {
    props = { ...props, ...event.payload.data };
  }

  const now = new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO edges_current (edge_id, src_id, dst_id, graph_id, props, valid_from, valid_to, sys_from, sys_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT (edge_id) DO UPDATE SET
        src_id = excluded.src_id,
        dst_id = excluded.dst_id,
        graph_id = excluded.graph_id,
        props = excluded.props,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        sys_from = ?,
        sys_to = NULL
    `
    )
    .run(
      edgeId,
      srcId,
      dstId,
      graphId,
      JSON.stringify(props),
      event.valid_from,
      event.valid_to,
      now,
      now
    );
}

/**
 * Handles edge delete events.
 */
async function handleEdgeDelete(
  db: Database,
  graphId: string,
  edgeId: string,
  event: EventRecord
): Promise<void> {
  const now = new Date().toISOString();

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
