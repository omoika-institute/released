import type { Database } from "@tursodatabase/database";
import type {
  AosintWorkflowEvent,
  RunOsintWorkflowPayload,
  RunOsintWorkflowResult,
} from "../../lib/aosint/agentTypes";

export type AgentSessionStatus = "running" | "completed" | "failed" | "canceled";

export interface AgentSessionSummary {
  session_id: string;
  case_id: string | null;
  target: string;
  workflow: string;
  provider: string;
  model: string;
  status: AgentSessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  final_answer: string | null;
  error: string | null;
  event_count: number;
  snapshot_count: number;
  tool_call_count: number;
  tool_error_count: number;
  total_tool_duration_ms: number;
  max_round: number;
  max_context_tokens: number;
}

export interface AgentSessionEventRow {
  id: number;
  session_id: string;
  event_type: string;
  round: number | null;
  tool_name: string | null;
  tool_call_id: string | null;
  ok: number | null;
  duration_ms: number | null;
  created_at: string;
  payload: unknown;
}

export interface AgentContextMetricRow {
  metric_id: string;
  session_id: string;
  round: number;
  created_at: string;
  approx_token_count: number;
  message_count: number;
  tool_count: number;
  system_prompt_chars: number;
  tool_schema_chars: number;
  diff: unknown;
}

export interface AgentSessionDetails {
  session: AgentSessionSummary & {
    report: unknown;
    metadata: unknown;
  };
  events: AgentSessionEventRow[];
  snapshots: [];
  snapshotMetrics: AgentContextMetricRow[];
}

export interface AgentSessionStats {
  totalSessions: number;
  runningSessions: number;
  failedSessions: number;
  completedSessions: number;
  totalEvents: number;
  totalSnapshots: number;
  totalToolCalls: number;
  totalToolErrors: number;
  totalCapturedEntities: number;
  captureToolCalls: number;
  entityCaptureSessions: number;
  averageDurationMs: number;
  averageContextTokens: number;
  recentByDay: Array<{ day: string; sessions: number; failures: number }>;
  toolUsage: Array<{ toolName: string; calls: number; failures: number; totalDurationMs: number; capturedEntities: number }>;
  contextSeries: Array<{ sessionId: string; target: string; startedAt: string; maxContextTokens: number; snapshotCount: number }>;
  entityCaptureSeries: Array<{
    sessionId: string;
    target: string;
    startedAt: string;
    toolCalls: number;
    toolErrors: number;
    capturedEntities: number;
    durationMs: number;
  }>;
}

function jsonStringify(value: unknown) {
  return JSON.stringify(value ?? null);
}

function jsonParse(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function eventRound(event: AosintWorkflowEvent) {
  return "round" in event && typeof event.round === "number" ? event.round : null;
}

function eventToolName(event: AosintWorkflowEvent) {
  return "toolName" in event ? event.toolName : null;
}

function eventToolCallId(event: AosintWorkflowEvent) {
  if ("toolCallId" in event) return event.toolCallId;
  if (event.type === "llm_message") {
    return event.message.tool_call_id ?? null;
  }
  return null;
}

function eventOk(event: AosintWorkflowEvent) {
  return "ok" in event ? (event.ok ? 1 : 0) : null;
}

function eventDurationMs(event: AosintWorkflowEvent) {
  return "durationMs" in event && typeof event.durationMs === "number"
    ? event.durationMs
    : null;
}

function eventPayloadForStorage(event: AosintWorkflowEvent) {
  if (event.type !== "context_snapshot") return event;

  return {
    ...event,
    snapshot: {
      id: event.snapshot.id,
      caseId: event.snapshot.caseId,
      round: event.snapshot.round,
      model: event.snapshot.model,
      createdAt: event.snapshot.createdAt,
      metrics: event.snapshot.metrics,
      diff: event.snapshot.diff,
      storage: "metrics_only",
      deprecatedFullSnapshot: true,
    },
  };
}

function isCanceledError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("canceled");
}

function mapSummary(row: any): AgentSessionSummary {
  return {
    session_id: String(row.session_id),
    case_id: row.case_id ?? null,
    target: String(row.target ?? ""),
    workflow: String(row.workflow ?? ""),
    provider: String(row.provider ?? ""),
    model: String(row.model ?? ""),
    status: String(row.status ?? "failed") as AgentSessionStatus,
    started_at: String(row.started_at ?? ""),
    ended_at: row.ended_at ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    final_answer: row.final_answer ?? null,
    error: row.error ?? null,
    event_count: Number(row.event_count ?? 0),
    snapshot_count: Number(row.snapshot_count ?? 0),
    tool_call_count: Number(row.tool_call_count ?? 0),
    tool_error_count: Number(row.tool_error_count ?? 0),
    total_tool_duration_ms: Number(row.total_tool_duration_ms ?? 0),
    max_round: Number(row.max_round ?? 0),
    max_context_tokens: Number(row.max_context_tokens ?? 0),
  };
}

export async function createAgentSession(
  db: Database,
  params: {
    sessionId: string;
    payload: RunOsintWorkflowPayload;
    provider: string;
    model: string;
    startedAt: string;
  }
) {
  await db
    .prepare(
      `INSERT INTO agent_sessions (
        session_id, case_id, target, workflow, provider, model, status,
        started_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.sessionId,
      params.payload.caseId ?? null,
      params.payload.target,
      params.payload.workflow ?? "recon",
      params.provider,
      params.model,
      "running",
      params.startedAt,
      jsonStringify({
        traceFormat: "event_sourced_v1",
        contextSnapshots: {
          status: "deprecated",
          storage: "metrics_only",
          reason:
            "Full model context is derived from llm_message/tool events; snapshot rows are retained only for metrics and legacy dashboards.",
        },
        browserMode: params.payload.browserMode ?? "background",
        hasCustomPrompt: Boolean(params.payload.prompt?.trim()),
        generateReport: params.payload.generateReport !== false,
        harness: params.payload.harness
          ? {
              templateId:
                params.payload.harness.templateId ??
                params.payload.customWorkflow?.id ??
                null,
              templateVersion:
                params.payload.harness.templateVersion ??
                params.payload.customWorkflow?.version ??
                null,
              templateVersionLabel:
                params.payload.harness.templateVersionLabel ??
                params.payload.customWorkflow?.versionLabel ??
                null,
              sourceCaseId: params.payload.harness.caseId ?? null,
              sourceCaseLabel: params.payload.harness.caseLabel ?? null,
              seedEntities: params.payload.harness.seedEntities,
              nodes: params.payload.harness.nodes,
              edges: params.payload.harness.edges,
              permissionMode: params.payload.harness.permissionMode,
              runtimeSettings: params.payload.harness.runtimeSettings ?? {
                provider: params.provider,
                model: params.model,
                browserMode: params.payload.browserMode ?? "background",
                temperature: params.payload.temperature ?? null,
                maxTurns: params.payload.maxTurns ?? null,
                contextLength: params.payload.contextLength ?? null,
                maxTokens: params.payload.maxTokens ?? null,
                enabledRuntimeTools: params.payload.enabledRuntimeTools ?? [],
              },
              customWorkflow: params.payload.customWorkflow ?? null,
            }
          : null,
      })
    );
}

export async function recordAgentSessionEvent(
  db: Database,
  sessionId: string,
  event: AosintWorkflowEvent
) {
  const createdAt =
    event.type === "context_snapshot" ? event.snapshot.createdAt : new Date().toISOString();
  const round = eventRound(event);
  const durationMs = eventDurationMs(event);

  await db
    .prepare(
      `INSERT INTO agent_session_events (
        session_id, event_type, round, tool_name, tool_call_id, ok,
        duration_ms, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sessionId,
      event.type,
      round,
      eventToolName(event),
      eventToolCallId(event),
      eventOk(event),
      durationMs,
      createdAt,
      jsonStringify(eventPayloadForStorage(event))
    );

  if (event.type === "context_snapshot") {
    const snapshot = event.snapshot;
    await db
      .prepare(
        `INSERT OR REPLACE INTO agent_context_metrics (
          metric_id, session_id, round, created_at, approx_token_count,
          message_count, tool_count, system_prompt_chars, tool_schema_chars,
          diff_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        sessionId,
        snapshot.round,
        snapshot.createdAt,
        snapshot.metrics.approxTokenCount,
        snapshot.metrics.messageCount,
        snapshot.metrics.toolCount,
        snapshot.metrics.systemPromptChars,
        snapshot.metrics.toolSchemaChars,
        jsonStringify(snapshot.diff ?? null)
      );
  }

  await db
    .prepare(
      `UPDATE agent_sessions
       SET case_id = COALESCE(case_id, ?),
           event_count = event_count + 1,
           snapshot_count = snapshot_count + ?,
           tool_call_count = tool_call_count + ?,
           tool_error_count = tool_error_count + ?,
           total_tool_duration_ms = total_tool_duration_ms + ?,
           max_round = MAX(max_round, ?),
           max_context_tokens = MAX(max_context_tokens, ?)
       WHERE session_id = ?`
    )
    .run(
      event.caseId || null,
      event.type === "context_snapshot" ? 1 : 0,
      event.type === "tool_call" ? 1 : 0,
      event.type === "tool_result" && !event.ok ? 1 : 0,
      durationMs ?? 0,
      round ?? 0,
      event.type === "context_snapshot" ? event.snapshot.metrics.approxTokenCount : 0,
      sessionId
    );
}

export async function finishAgentSession(
  db: Database,
  params: {
    sessionId: string;
    startedAtMs: number;
    result?: RunOsintWorkflowResult;
    error?: unknown;
  }
) {
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - params.startedAtMs;
  const status: AgentSessionStatus = params.error
    ? isCanceledError(params.error)
      ? "canceled"
      : "failed"
    : "completed";
  const errorMessage = params.error
    ? params.error instanceof Error
      ? params.error.message
      : String(params.error)
    : null;

  await db
    .prepare(
      `UPDATE agent_sessions
       SET status = ?, ended_at = ?, duration_ms = ?, final_answer = ?,
           report_json = ?, error = ?, case_id = COALESCE(?, case_id)
       WHERE session_id = ?`
    )
    .run(
      status,
      endedAt,
      durationMs,
      params.result?.finalAnswer ?? null,
      jsonStringify(params.result?.report ?? null),
      errorMessage,
      params.result?.caseContext.caseId ?? null,
      params.sessionId
    );
}

export async function listAgentSessions(
  db: Database,
  payload: { skip?: number; limit?: number; caseId?: string } = {}
): Promise<AgentSessionSummary[]> {
  const limit = Math.min(Math.max(payload.limit ?? 50, 1), 200);
  const skip = Math.max(payload.skip ?? 0, 0);
  const caseId = payload.caseId?.trim();
  const rows = caseId
    ? await db
        .prepare(
          `SELECT *
           FROM agent_sessions
           WHERE case_id = ?
           ORDER BY started_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(caseId, limit, skip)
    : await db
        .prepare(
          `SELECT *
           FROM agent_sessions
           ORDER BY started_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(limit, skip);
  return rows.map(mapSummary);
}

export async function getAgentSessionDetails(
  db: Database,
  sessionId: string
): Promise<AgentSessionDetails | null> {
  const row = await db
    .prepare(`SELECT * FROM agent_sessions WHERE session_id = ?`)
    .get(sessionId);
  if (!row) return null;

  const eventRows = await db
    .prepare(
      `SELECT *
       FROM agent_session_events
       WHERE session_id = ?
       ORDER BY id ASC`
    )
    .all(sessionId);
  const metricRows = await db
    .prepare(
      `SELECT *
       FROM agent_context_metrics
       WHERE session_id = ?
       ORDER BY round ASC`
    )
    .all(sessionId);

  return {
    session: {
      ...mapSummary(row),
      report: jsonParse((row as any).report_json),
      metadata: jsonParse((row as any).metadata_json),
    },
    events: eventRows.map((event: any) => ({
      id: Number(event.id),
      session_id: String(event.session_id),
      event_type: String(event.event_type),
      round: event.round == null ? null : Number(event.round),
      tool_name: event.tool_name ?? null,
      tool_call_id: event.tool_call_id ?? null,
      ok: event.ok == null ? null : Number(event.ok),
      duration_ms: event.duration_ms == null ? null : Number(event.duration_ms),
      created_at: String(event.created_at),
      payload: jsonParse(event.payload_json),
    })),
    snapshots: [],
    snapshotMetrics: metricRows.map((metric: any) => ({
      metric_id: String(metric.metric_id),
      session_id: String(metric.session_id),
      round: Number(metric.round),
      created_at: String(metric.created_at),
      approx_token_count: Number(metric.approx_token_count ?? 0),
      message_count: Number(metric.message_count ?? 0),
      tool_count: Number(metric.tool_count ?? 0),
      system_prompt_chars: Number(metric.system_prompt_chars ?? 0),
      tool_schema_chars: Number(metric.tool_schema_chars ?? 0),
      diff: jsonParse(metric.diff_json),
    })),
  };
}

export async function getAgentSessionStats(
  db: Database,
  payload: { caseId?: string } = {}
): Promise<AgentSessionStats> {
  const caseId = payload.caseId?.trim();
  const where = caseId ? "WHERE case_id = ?" : "";
  const totalsSql = `SELECT
        COUNT(*) AS total_sessions,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_sessions,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
        SUM(event_count) AS total_events,
        SUM(snapshot_count) AS total_snapshots,
        SUM(tool_call_count) AS total_tool_calls,
        SUM(tool_error_count) AS total_tool_errors,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS average_duration_ms,
        AVG(CASE WHEN max_context_tokens > 0 THEN max_context_tokens END) AS average_context_tokens
       FROM agent_sessions
       ${where}`;
  const totals = (caseId
    ? await db.prepare(totalsSql).get(caseId)
    : await db.prepare(totalsSql).get()) as any;

  const recentByDaySql = `SELECT substr(started_at, 1, 10) AS day,
              COUNT(*) AS sessions,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures
       FROM agent_sessions
       ${where}
       GROUP BY day
       ORDER BY day DESC
       LIMIT 14`;
  const recentByDay = (caseId
    ? await db.prepare(recentByDaySql).all(caseId)
    : await db.prepare(recentByDaySql).all()) as any[];

  const toolUsageSql = `SELECT e.tool_name,
          COUNT(*) AS calls,
          SUM(CASE WHEN e.ok = 0 THEN 1 ELSE 0 END) AS failures,
          SUM(COALESCE(e.duration_ms, 0)) AS total_duration_ms,
          SUM(CASE
            WHEN e.tool_name = 'add_unverified_entity_to_graph' AND e.ok = 1
            THEN 1 ELSE 0
          END) AS captured_entities
       FROM agent_session_events e
       JOIN agent_sessions s ON s.session_id = e.session_id
       WHERE e.event_type = 'tool_result'
         AND e.tool_name IS NOT NULL
         ${caseId ? "AND s.case_id = ?" : ""}
       GROUP BY e.tool_name
       ORDER BY calls DESC
       LIMIT 12`;
  const toolUsage = (caseId
    ? await db.prepare(toolUsageSql).all(caseId)
    : await db.prepare(toolUsageSql).all()) as any[];

  const contextSeriesSql = `SELECT session_id, target, started_at, max_context_tokens, snapshot_count
       FROM agent_sessions
       WHERE snapshot_count > 0
       ${caseId ? "AND case_id = ?" : ""}
       ORDER BY started_at DESC
       LIMIT 20`;
  const contextSeries = (caseId
    ? await db.prepare(contextSeriesSql).all(caseId)
    : await db.prepare(contextSeriesSql).all()) as any[];

  const captureTotalsSql = `SELECT
        COUNT(*) AS capture_tool_calls,
        SUM(CASE WHEN e.ok = 1 THEN 1 ELSE 0 END) AS total_captured_entities,
        COUNT(DISTINCT CASE WHEN e.ok = 1 THEN e.session_id END) AS entity_capture_sessions
       FROM agent_session_events e
       JOIN agent_sessions s ON s.session_id = e.session_id
       WHERE e.event_type = 'tool_result'
         AND e.tool_name = 'add_unverified_entity_to_graph'
         ${caseId ? "AND s.case_id = ?" : ""}`;
  const captureTotals = (caseId
    ? await db.prepare(captureTotalsSql).get(caseId)
    : await db.prepare(captureTotalsSql).get()) as any;

  const entityCaptureSeriesSql = `SELECT
        s.session_id,
        s.target,
        s.started_at,
        s.tool_call_count,
        s.tool_error_count,
        COALESCE(SUM(CASE
          WHEN e.tool_name = 'add_unverified_entity_to_graph' AND e.ok = 1
          THEN 1 ELSE 0
        END), 0) AS captured_entities,
        COALESCE(s.duration_ms, 0) AS duration_ms
       FROM agent_sessions s
       LEFT JOIN agent_session_events e
         ON e.session_id = s.session_id
        AND e.event_type = 'tool_result'
       ${caseId ? "WHERE s.case_id = ?" : ""}
       GROUP BY s.session_id
       HAVING captured_entities > 0 OR s.tool_call_count > 0
       ORDER BY s.started_at DESC
       LIMIT 20`;
  const entityCaptureSeries = (caseId
    ? await db.prepare(entityCaptureSeriesSql).all(caseId)
    : await db.prepare(entityCaptureSeriesSql).all()) as any[];

  return {
    totalSessions: Number(totals?.total_sessions ?? 0),
    runningSessions: Number(totals?.running_sessions ?? 0),
    failedSessions: Number(totals?.failed_sessions ?? 0),
    completedSessions: Number(totals?.completed_sessions ?? 0),
    totalEvents: Number(totals?.total_events ?? 0),
    totalSnapshots: Number(totals?.total_snapshots ?? 0),
    totalToolCalls: Number(totals?.total_tool_calls ?? 0),
    totalToolErrors: Number(totals?.total_tool_errors ?? 0),
    totalCapturedEntities: Number(captureTotals?.total_captured_entities ?? 0),
    captureToolCalls: Number(captureTotals?.capture_tool_calls ?? 0),
    entityCaptureSessions: Number(captureTotals?.entity_capture_sessions ?? 0),
    averageDurationMs: Number(totals?.average_duration_ms ?? 0),
    averageContextTokens: Number(totals?.average_context_tokens ?? 0),
    recentByDay: recentByDay.reverse().map((row) => ({
      day: String(row.day),
      sessions: Number(row.sessions ?? 0),
      failures: Number(row.failures ?? 0),
    })),
    toolUsage: toolUsage.map((row) => ({
      toolName: String(row.tool_name),
      calls: Number(row.calls ?? 0),
      failures: Number(row.failures ?? 0),
      totalDurationMs: Number(row.total_duration_ms ?? 0),
      capturedEntities: Number(row.captured_entities ?? 0),
    })),
    contextSeries: contextSeries.reverse().map((row) => ({
      sessionId: String(row.session_id),
      target: String(row.target ?? ""),
      startedAt: String(row.started_at ?? ""),
      maxContextTokens: Number(row.max_context_tokens ?? 0),
      snapshotCount: Number(row.snapshot_count ?? 0),
    })),
    entityCaptureSeries: entityCaptureSeries.reverse().map((row) => ({
      sessionId: String(row.session_id),
      target: String(row.target ?? ""),
      startedAt: String(row.started_at ?? ""),
      toolCalls: Number(row.tool_call_count ?? 0),
      toolErrors: Number(row.tool_error_count ?? 0),
      capturedEntities: Number(row.captured_entities ?? 0),
      durationMs: Number(row.duration_ms ?? 0),
    })),
  };
}
