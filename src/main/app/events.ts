/**
 * Event Store Module
 *
 * Provides event sourcing primitives for the OMOIKA graph system.
 */
import { Database } from "@tursodatabase/database";
import { randomUUID } from "node:crypto";
import type { EventStream, EventRecord, AppendEvent } from "@/preload";

const appendQueues = new Map<string, Promise<void>>();

/**
 * Ensures a stream exists for the given category and key.
 * Returns the stream_id.
 */
export async function ensureStream(
  db: Database,
  category: string,
  key: string
): Promise<EventStream> {
  const streamId = `${category}:${key}`;

  let existing;
  try {
    existing = await db
      .prepare(
        `SELECT stream_id, category, key FROM event_streams WHERE stream_id = ?`
      )
      .all(streamId);
  } catch (error) {
    throw error;
  }

  if (existing.length > 0) {
    const row = existing[0];
    return {
      stream_id: row.stream_id as string,
      category: row.category as string,
      key: row.key as string,
    };
  }

  try {
    await db
      .prepare(
        `INSERT INTO event_streams (stream_id, category, key) VALUES (?, ?, ?)`
      )
      .run(streamId, category, key);
  } catch (error) {
    throw error;
  }

  return { stream_id: streamId, category, key };
}

/**
 * Get stream by stream_id
 */
export async function getStream(
  db: Database,
  streamId: string
): Promise<EventStream | null> {
  const result = await db
    .prepare(
      `SELECT stream_id, category, key FROM event_streams WHERE stream_id = ?`
    )
    .all(streamId);

  if (result.length === 0) return null;

  const row = result[0];
  return {
    stream_id: row.stream_id as string,
    category: row.category as string,
    key: row.key as string,
  };
}

async function appendEventUnlocked(
  db: Database,
  event: AppendEvent
): Promise<EventRecord> {
  // 1. Ensure stream exists
  let stream;
  try {
    stream = await ensureStream(db, event.category, event.key);
  } catch (error) {
    throw error;
  }

  const isUniqueVersionError = (error: unknown) => {
    const message = String((error as Error)?.message || error || "");
    return (
      message.includes("UNIQUE constraint failed") &&
      message.includes("events") &&
      message.includes("stream_id") &&
      message.includes("version")
    );
  };

  // 2. Get current version for stream
  let currentVersion;
  try {
    const versionResult = await db
      .prepare(
        `SELECT COALESCE(MAX(version), 0) as current_version FROM events WHERE stream_id = ?`
      )
      .get(stream.stream_id);
    currentVersion = Number(versionResult?.current_version || 0);
  } catch (error) {
    throw error;
  }

  // 3. Check optimistic concurrency
  if (
    event.expected_version !== undefined &&
    event.expected_version !== null &&
    event.expected_version !== currentVersion
  ) {
    throw new Error(
      `Concurrency conflict: expected version ${event.expected_version}, but current is ${currentVersion}`
    );
  }

  // 4. Insert event (retry on concurrent version conflicts)
  const correlationId = event.correlation_id || randomUUID();
  const causationId = event.causation_id || null;
  const maxRetries = 5;

  let seq;
  let recordedAt;
  let nextVersion = currentVersion + 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const now = new Date().toISOString();
    try {
      await db
        .prepare(
          `
          INSERT INTO events (
            stream_id, version, event_type, payload,
            valid_from, valid_to, correlation_id, causation_id, actor_id, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          stream.stream_id,
          nextVersion,
          event.event_type,
          JSON.stringify(event.payload),
          event.valid_from,
          event.valid_to || null,
          correlationId,
          causationId,
          event.actor_id,
          now
        );

      // Get the sequence number from the inserted row
      const seqResult = await db
        .prepare(`SELECT seq FROM events WHERE stream_id = ? AND version = ?`)
        .get(stream.stream_id, nextVersion);

      if (!seqResult || !seqResult.seq) {
        throw new Error("Failed to retrieve sequence number after insert");
      }

      seq = Number(seqResult.seq);
      recordedAt = now;
      break;
    } catch (error) {
      if (
        event.expected_version !== undefined &&
        event.expected_version !== null
      ) {
        throw error;
      }
      if (attempt < maxRetries - 1 && isUniqueVersionError(error)) {
        const versionResult = await db
          .prepare(
            `SELECT COALESCE(MAX(version), 0) as current_version FROM events WHERE stream_id = ?`
          )
          .get(stream.stream_id);
        currentVersion = Number(versionResult?.current_version || 0);
        nextVersion = currentVersion + 1;
        continue;
      }
      throw error;
    }
  }

  if (seq === undefined) {
    throw new Error("Failed to append event after retries");
  }
  const eventRecord = {
    seq,
    stream_id: stream.stream_id,
    version: nextVersion,
    event_type: event.event_type,
    payload: event.payload,
    valid_from: event.valid_from,
    valid_to: event.valid_to || null,
    correlation_id: correlationId,
    causation_id: causationId,
    actor_id: event.actor_id,
    created_at: recordedAt,
  };

  return eventRecord;
}

/**
 * Appends an event to the event store.
 * Handles optimistic concurrency control via expected_version.
 *
 * Event versions are scoped to a stream. Renderer graph operations can arrive
 * concurrently for the same graph stream, so append work is serialized per
 * stream before reading MAX(version). Without this, concurrent writers can
 * legitimately pick the same next version and trip the unique index.
 */
export async function appendEvent(
  db: Database,
  event: AppendEvent
): Promise<EventRecord> {
  const streamId = `${event.category}:${event.key}`;
  const previous = appendQueues.get(streamId) ?? Promise.resolve();
  let current: Promise<EventRecord>;

  current = previous
    .catch(() => undefined)
    .then(() => appendEventUnlocked(db, event));

  const drain = current.then(
    () => undefined,
    () => undefined
  );
  appendQueues.set(streamId, drain);

  try {
    return await current;
  } finally {
    if (appendQueues.get(streamId) === drain) {
      appendQueues.delete(streamId);
    }
  }
}

/**
 * Retrieves events after a given sequence number.
 * Used by projector to poll for new events.
 */
export async function getEventsAfter(
  db: Database,
  afterSeq: number,
  limit: number = 500
): Promise<EventRecord[]> {
  const result = await db
    .prepare(
      `
      SELECT
        seq, stream_id, version, event_type, payload,
        valid_from, valid_to, correlation_id, causation_id, actor_id, recorded_at
      FROM events
      WHERE seq > ?
      ORDER BY seq ASC
      LIMIT ?
    `
    )
    .all(afterSeq, limit);

  return result.map((row) => ({
    seq: Number(row.seq),
    stream_id: row.stream_id as string,
    version: Number(row.version),
    event_type: row.event_type as string,
    payload: JSON.parse(row.payload as string),
    valid_from: row.valid_from as string,
    valid_to: (row.valid_to as string) || null,
    correlation_id: (row.correlation_id as string) || null,
    causation_id: (row.causation_id as string) || null,
    actor_id: row.actor_id as string,
    created_at: row.recorded_at as string,
  }));
}

/**
 * Retrieves events for a specific stream after a given version.
 * Used for reading event history for a particular entity/graph.
 */
export async function getEventsForStream(
  db: Database,
  streamId: string,
  afterVersion: number = 0,
  limit: number = 1000
): Promise<EventRecord[]> {
  const result = await db
    .prepare(
      `
      SELECT
        seq, stream_id, version, event_type, payload,
        valid_from, valid_to, correlation_id, causation_id, actor_id, recorded_at
      FROM events
      WHERE stream_id = ? AND version > ?
      ORDER BY version ASC
      LIMIT ?
    `
    )
    .all(streamId, afterVersion, limit);

  return result.map((row) => ({
    seq: Number(row.seq),
    stream_id: row.stream_id as string,
    version: Number(row.version),
    event_type: row.event_type as string,
    payload: JSON.parse(row.payload as string),
    valid_from: row.valid_from as string,
    valid_to: (row.valid_to as string) || null,
    correlation_id: (row.correlation_id as string) || null,
    causation_id: (row.causation_id as string) || null,
    actor_id: row.actor_id as string,
    created_at: row.recorded_at as string,
  }));
}

/**
 * Gets the checkpoint for a projection (last processed sequence number).
 */
export async function getCheckpoint(
  db: Database,
  projectionName: string
): Promise<number> {
  const result = await db
    .prepare(`SELECT last_seq FROM event_checkpoints WHERE projection_name = ?`)
    .get(projectionName);

  if (!result) {
    return 0;
  }

  return Number(result.last_seq);
}

/**
 * Sets the checkpoint for a projection.
 */
export async function setCheckpoint(
  db: Database,
  projectionName: string,
  seq: number
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `
      INSERT INTO event_checkpoints (projection_name, last_seq, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (projection_name) DO UPDATE SET
        last_seq = excluded.last_seq,
        updated_at = excluded.updated_at
    `
    )
    .run(projectionName, seq, now);
}

/**
 * Appends a job event (for transform progress tracking).
 */
export async function appendJobEvent(
  db: Database,
  jobId: string,
  payload: Record<string, any>,
  actorId: string
): Promise<EventRecord> {
  return appendEvent(db, {
    category: "job",
    key: jobId,
    event_type: "job:event",
    payload,
    valid_from: new Date().toISOString(),
    actor_id: actorId,
  });
}

/**
 * Gets job events for a specific job after a given version.
 */
export async function getJobEvents(
  db: Database,
  jobId: string,
  afterVersion: number = 0
): Promise<EventRecord[]> {
  const streamId = `job:${jobId}`;
  return getEventsForStream(db, streamId, afterVersion);
}
