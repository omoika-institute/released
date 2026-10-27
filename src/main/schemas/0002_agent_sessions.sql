-- Persist agent observability runs and replay snapshots.

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id                 TEXT PRIMARY KEY,
  case_id                    TEXT,
  target                     TEXT NOT NULL,
  workflow                   TEXT NOT NULL,
  provider                   TEXT NOT NULL,
  model                      TEXT NOT NULL,
  status                     TEXT NOT NULL,
  started_at                 TEXT NOT NULL,
  ended_at                   TEXT,
  duration_ms                INTEGER,
  final_answer               TEXT,
  report_json                TEXT,
  error                      TEXT,
  event_count                INTEGER NOT NULL DEFAULT 0,
  snapshot_count             INTEGER NOT NULL DEFAULT 0,
  tool_call_count            INTEGER NOT NULL DEFAULT 0,
  tool_error_count           INTEGER NOT NULL DEFAULT 0,
  total_tool_duration_ms     INTEGER NOT NULL DEFAULT 0,
  max_round                  INTEGER NOT NULL DEFAULT 0,
  max_context_tokens         INTEGER NOT NULL DEFAULT 0,
  metadata_json              TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_sessions_started_at_idx
  ON agent_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS agent_sessions_case_id_idx
  ON agent_sessions (case_id, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_session_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  event_type     TEXT NOT NULL,
  round          INTEGER,
  tool_name      TEXT,
  tool_call_id   TEXT,
  ok             INTEGER,
  duration_ms    INTEGER,
  created_at     TEXT NOT NULL,
  payload_json   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_session_events_session_idx
  ON agent_session_events (session_id, id ASC);

CREATE INDEX IF NOT EXISTS agent_session_events_type_idx
  ON agent_session_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_context_snapshots (
  snapshot_id           TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  round                 INTEGER NOT NULL,
  created_at            TEXT NOT NULL,
  approx_token_count    INTEGER NOT NULL,
  message_count         INTEGER NOT NULL,
  tool_count            INTEGER NOT NULL,
  system_prompt_chars   INTEGER NOT NULL,
  tool_schema_chars     INTEGER NOT NULL,
  diff_json             TEXT,
  snapshot_json         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_context_snapshots_session_idx
  ON agent_context_snapshots (session_id, round ASC);
