-- Replace full context snapshot storage with metrics-only context telemetry.

DROP TABLE IF EXISTS agent_context_snapshots;

CREATE TABLE IF NOT EXISTS agent_context_metrics (
  metric_id             TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  round                 INTEGER NOT NULL,
  created_at            TEXT NOT NULL,
  approx_token_count    INTEGER NOT NULL,
  message_count         INTEGER NOT NULL,
  tool_count            INTEGER NOT NULL,
  system_prompt_chars   INTEGER NOT NULL,
  tool_schema_chars     INTEGER NOT NULL,
  diff_json             TEXT
);

CREATE INDEX IF NOT EXISTS agent_context_metrics_session_idx
  ON agent_context_metrics (session_id, round ASC);
