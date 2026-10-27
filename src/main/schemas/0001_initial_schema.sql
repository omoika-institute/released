-- Initial OMOIKA local schema

-- Streams provide ordering and tenant/category scoping
CREATE TABLE IF NOT EXISTS event_streams (
  stream_id         TEXT PRIMARY KEY,
  category          TEXT NOT NULL,
  key               TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, key)
);

-- Append-only events
CREATE TABLE IF NOT EXISTS events (
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id         TEXT NOT NULL REFERENCES event_streams(stream_id),
  version           INTEGER NOT NULL,
  event_type        TEXT NOT NULL,
  payload           TEXT NOT NULL,
  valid_from        TEXT NOT NULL,
  valid_to          TEXT,
  recorded_at       TEXT NOT NULL DEFAULT (datetime('now')),
  causation_id      TEXT,
  correlation_id    TEXT,
  actor_id          TEXT NOT NULL,
  UNIQUE (stream_id, version)
);

CREATE INDEX IF NOT EXISTS events_stream_id_version_idx
  ON events (stream_id, version DESC);

-- Projection checkpoints (high-water marks)
CREATE TABLE IF NOT EXISTS event_checkpoints (
  projection_name   TEXT PRIMARY KEY,
  last_seq          INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Worker jobs (status validated at application level - Turso doesn't support CHECK constraints)
-- Valid status values: 'enqueued', 'leased', 'running', 'failed', 'completed', 'canceled', 'dead'
CREATE TABLE IF NOT EXISTS jobs (
  job_id         TEXT PRIMARY KEY,
  payload        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'enqueued',
  priority       INTEGER NOT NULL DEFAULT 100,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  lease_owner    TEXT,
  lease_until    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  scheduled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  started_at     TEXT,
  finished_at    TEXT,
  backoff_until  TEXT
);

-- For structured outputs/binaries
CREATE TABLE IF NOT EXISTS artifacts (
  artifact_id   TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs(job_id),
  media_type    TEXT NOT NULL DEFAULT 'application/json',
  bytes         BLOB,
  uri           TEXT,
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cases are the reference to a specific set entities and their relationships
CREATE TABLE IF NOT EXISTS cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid          TEXT UNIQUE DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  label         TEXT NOT NULL,
  description   TEXT NOT NULL,
  ctime         TEXT DEFAULT (datetime('now')),
  mtime         TEXT DEFAULT (datetime('now')),
  org           TEXT NOT NULL,
  owner_id      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_org_id_idx ON cases (org);

-- Current entity state
CREATE TABLE IF NOT EXISTS entities_current (
  entity_id     TEXT NOT NULL,
  graph_id      TEXT NOT NULL REFERENCES cases(uuid),
  doc           TEXT NOT NULL,
  valid_from    TEXT NOT NULL,
  valid_to      TEXT,
  sys_from      TEXT NOT NULL,
  sys_to        TEXT,
  PRIMARY KEY (graph_id, entity_id)
);

-- Edge materialization
CREATE TABLE IF NOT EXISTS edges_current (
  edge_id     TEXT PRIMARY KEY,
  src_id      TEXT NOT NULL,
  dst_id      TEXT NOT NULL,
  graph_id    TEXT NOT NULL REFERENCES cases(uuid),
  props       TEXT NOT NULL DEFAULT '{}',
  valid_from  TEXT NOT NULL,
  valid_to    TEXT,
  sys_from    TEXT NOT NULL,
  sys_to      TEXT
);

-- Fast path indexes for materialized reads and deletions
CREATE INDEX IF NOT EXISTS entities_current_graph_open_idx ON entities_current (graph_id) WHERE sys_to IS NULL;
CREATE INDEX IF NOT EXISTS edges_current_graph_open_idx ON edges_current (graph_id) WHERE sys_to IS NULL;
CREATE INDEX IF NOT EXISTS edges_current_src_open_idx ON edges_current (src_id) WHERE sys_to IS NULL;
CREATE INDEX IF NOT EXISTS edges_current_dst_open_idx ON edges_current (dst_id) WHERE sys_to IS NULL;
CREATE INDEX IF NOT EXISTS edges_current_src_dst_open_idx ON edges_current(src_id, dst_id);

CREATE TABLE IF NOT EXISTS favorite_cases (
  case_id   INTEGER NOT NULL,
  owner_id  TEXT NOT NULL,
  PRIMARY KEY (owner_id, case_id)
);
CREATE INDEX IF NOT EXISTS favorite_cases_owner_id_idx ON favorite_cases (owner_id);

-- Entity script source code
CREATE TABLE IF NOT EXISTS entities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  author      TEXT NOT NULL,
  code        TEXT NOT NULL,
  org         TEXT NOT NULL,
  ctime       TEXT DEFAULT (datetime('now')),
  mtime       TEXT DEFAULT (datetime('now')),
  owner_id    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entities_owner_id_idx ON entities (owner_id);
CREATE INDEX IF NOT EXISTS entities_shared_with_org_id_idx ON entities (org);

CREATE TABLE IF NOT EXISTS favorite_entities (
  entity_id INTEGER NOT NULL,
  owner_id  TEXT NOT NULL,
  PRIMARY KEY (owner_id, entity_id)
);
CREATE INDEX IF NOT EXISTS favorite_entities_owner_id_idx ON favorite_entities (owner_id);

-- Attachments uploaded for entities
CREATE TABLE IF NOT EXISTS entity_attachments (
  attachment_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  graph_id      TEXT NOT NULL REFERENCES cases(uuid),
  entity_id     TEXT NOT NULL,
  owner_id      TEXT NOT NULL,
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size          INTEGER NOT NULL,
  bytes         BLOB,
  uri           TEXT,
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS entity_attachments_entity_idx
  ON entity_attachments (graph_id, entity_id, created_at DESC);

-- Database metadata table for internal tracking
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
