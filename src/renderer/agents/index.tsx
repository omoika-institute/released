import { Button } from "@/components/buttons/Button";
import { ChamferFrame } from "@/components/ChamferFrame";
import CodeMirrorViewer from "@/components/editor/CodeMirrorViewer";
import { Icon } from "@/components/icons";
import type { ComponentChildren } from "preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useParams } from "react-router-dom";

type AgentSessionStatus = "running" | "completed" | "failed" | "canceled";
type SessionFilter = "all" | AgentSessionStatus | "high-context";
type SortKey = "started_at" | "status" | "max_context_tokens" | "duration_ms";
type TimeRange = "all" | "24h" | "7d";
type EventFilter = "all" | "tool" | "message" | "error";
type DetailTab = "summary" | "final" | "metadata";
type DiagnosticsTab = "events" | "case-sessions";
type ChatRole = "system" | "user" | "assistant" | "tool";

interface TimelineChatMessage {
  role: ChatRole;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
}

interface AgentSessionSummary {
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

interface AgentSessionStats {
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
  toolUsage: Array<{
    toolName: string;
    calls: number;
    failures: number;
    totalDurationMs: number;
    capturedEntities: number;
  }>;
  contextSeries: Array<{
    sessionId: string;
    target: string;
    startedAt: string;
    maxContextTokens: number;
    snapshotCount: number;
  }>;
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

interface AgentSessionDetails {
  session: AgentSessionSummary & { report: unknown; metadata: unknown };
  events: Array<{
    id: number;
    event_type: string;
    round: number | null;
    tool_name: string | null;
    tool_call_id: string | null;
    ok: number | null;
    duration_ms: number | null;
    created_at: string;
    payload: any;
  }>;
  snapshotMetrics: Array<{
    metric_id: string;
    round: number;
    created_at: string;
    approx_token_count: number;
    message_count: number;
    tool_count: number;
    diff: any;
  }>;
  snapshots?: never[];
}

interface AgentsPageCacheEntry {
  sessions: AgentSessionSummary[];
  stats: AgentSessionStats;
  selectedId: string | null;
  hasMoreSessions: boolean;
}

interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

interface TimelineEventRow {
  kind: "event";
  id: string;
  event: AgentSessionDetails["events"][number];
  resultEvent?: AgentSessionDetails["events"][number];
}

type TimelineRow = TimelineEventRow;

const emptyStats: AgentSessionStats = {
  totalSessions: 0,
  runningSessions: 0,
  failedSessions: 0,
  completedSessions: 0,
  totalEvents: 0,
  totalSnapshots: 0,
  totalToolCalls: 0,
  totalToolErrors: 0,
  totalCapturedEntities: 0,
  captureToolCalls: 0,
  entityCaptureSessions: 0,
  averageDurationMs: 0,
  averageContextTokens: 0,
  recentByDay: [],
  toolUsage: [],
  contextSeries: [],
  entityCaptureSeries: [],
};

const agentsPageCache = new Map<string, AgentsPageCacheEntry>();
const sessionDetailsCache = new Map<string, AgentSessionDetails | null>();
const SESSION_PAGE_SIZE = 80;
const LOAD_MORE_THRESHOLD_PX = 360;

function normalizeStats(
  value: Partial<AgentSessionStats> | null | undefined
): AgentSessionStats {
  return {
    ...emptyStats,
    ...(value ?? {}),
    recentByDay: Array.isArray(value?.recentByDay) ? value.recentByDay : [],
    toolUsage: Array.isArray(value?.toolUsage) ? value.toolUsage : [],
    contextSeries: Array.isArray(value?.contextSeries)
      ? value.contextSeries
      : [],
    entityCaptureSeries: Array.isArray(value?.entityCaptureSeries)
      ? value.entityCaptureSeries
      : [],
  };
}

function useVirtualRows(
  count: number,
  getEstimatedSize: (index: number) => number,
  overscan = 6
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [measuredSizes, setMeasuredSizes] = useState<Map<number, number>>(
    () => new Map()
  );
  const animationFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const updateViewport = () => setViewportHeight(element.clientHeight);
    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  });

  useEffect(() => {
    setMeasuredSizes(new Map());
  }, [count, getEstimatedSize]);

  useEffect(() => {
    setScrollTop((current) => {
      const element = scrollRef.current;
      if (!element) return 0;
      return Math.min(
        current,
        Math.max(0, element.scrollHeight - element.clientHeight)
      );
    });
  }, [count]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    []
  );

  const getSize = useCallback(
    (index: number) => measuredSizes.get(index) ?? getEstimatedSize(index),
    [getEstimatedSize, measuredSizes]
  );

  const sizeOffsets = useMemo(() => {
    const offsets = new Array<number>(count + 1);
    offsets[0] = 0;
    for (let index = 0; index < count; index += 1) {
      offsets[index + 1] = offsets[index] + getSize(index);
    }
    return offsets;
  }, [count, getSize]);

  const totalSize = sizeOffsets[count] ?? 0;

  const virtualItems = useMemo<VirtualItem[]>(() => {
    const viewportBottom = scrollTop + viewportHeight;
    const items: VirtualItem[] = [];
    let firstVisible = count;
    let low = 0;
    let high = count - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if ((sizeOffsets[middle + 1] ?? 0) >= scrollTop) {
        firstVisible = middle;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }

    if (firstVisible === count) return items;

    const startIndex = Math.max(0, firstVisible - overscan);

    for (let index = startIndex; index < count; index += 1) {
      const itemOffset = sizeOffsets[index] ?? 0;
      const size = (sizeOffsets[index + 1] ?? itemOffset) - itemOffset;
      if (itemOffset > viewportBottom && index > firstVisible + overscan) {
        break;
      }
      items.push({ index, start: itemOffset, size });
    }

    return items;
  }, [count, overscan, scrollTop, sizeOffsets, viewportHeight]);

  const onScroll = useCallback((event: Event) => {
    pendingScrollTopRef.current = (
      event.currentTarget as HTMLDivElement
    ).scrollTop;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  }, []);

  const setRowSize = useCallback((index: number, size: number) => {
    setMeasuredSizes((current) => {
      if (current.get(index) === size) return current;
      const next = new Map(current);
      next.set(index, size);
      return next;
    });
  }, []);

  return {
    scrollRef,
    onScroll,
    scrollTop,
    viewportHeight,
    totalSize,
    virtualItems,
    setRowSize,
  };
}

function VirtualRow({
  item,
  setRowSize,
  children,
}: {
  item: VirtualItem;
  setRowSize: (index: number, size: number) => void;
  children: ComponentChildren;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;

    const updateSize = () => setRowSize(item.index, element.offsetHeight);
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.index, setRowSize]);

  return (
    <div
      ref={rowRef}
      className="absolute left-0 top-0 w-full"
      style={{ transform: `translateY(${item.start}px)` }}
    >
      {children}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value || 0));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDuration(value: number | null | undefined) {
  if (!value) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function compactJson(value: unknown, maxChars = 1800) {
  const text = JSON.stringify(value, null, 2) ?? "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}

function statusClasses(status: AgentSessionStatus) {
  switch (status) {
    case "completed":
      return "border-sea/40 bg-sea/12 text-sea";
    case "failed":
      return "border-red-400/45 bg-red-400/12 text-red-300";
    case "canceled":
      return "border-amber-300/45 bg-amber-300/12 text-amber-200";
    default:
      return "border-yellow-300/45 bg-yellow-300/12 text-yellow-200";
  }
}

function eventTone(eventType: string, ok: number | null) {
  if (ok === 0) return "border-red-400/35 bg-red-400/10 text-red-300";
  if (eventType.includes("snapshot") || eventType.includes("context")) {
    return "border-ink/18 bg-ink/6 text-ink";
  }
  if (eventType.includes("tool")) {
    return "border-blue-300/35 bg-blue-300/10 text-blue-200";
  }
  return "border-ink/14 bg-ink/4 text-ink-soft";
}

function eventIcon(eventType: string) {
  if (eventType.includes("snapshot") || eventType.includes("context"))
    return "braces";
  if (eventType === "llm_message") return "message";
  if (eventType.includes("tool")) return "cpu";
  if (eventType.includes("message")) return "message";
  return "activity";
}

function eventLabel(event: AgentSessionDetails["events"][number]) {
  const payload = event.payload as Record<string, any> | null;
  if (event.event_type === "llm_message") {
    return `${payload?.role ?? "message"} prompt`;
  }
  if (event.event_type === "assistant_message") return "assistant message";
  if (event.event_type === "tool_call") return event.tool_name ?? "tool call";
  if (event.event_type === "tool_result") {
    return `${event.tool_name ?? "tool"} result`;
  }
  return event.event_type.replace(/_/g, " ");
}

function eventPreview(event: AgentSessionDetails["events"][number]) {
  const payload = event.payload as Record<string, any> | null;
  if (event.event_type === "llm_message") {
    const message = payload?.message as TimelineChatMessage | undefined;
    return messageText(message ?? { role: "user", content: "" }).slice(0, 240);
  }
  if (event.event_type === "assistant_message") {
    return String(payload?.content ?? "").slice(0, 240);
  }
  if (event.event_type === "tool_call") {
    return compactJson(payload?.args ?? {}, 240);
  }
  if (event.event_type === "tool_result") {
    return String(
      payload?.ok === false
        ? (payload?.error ?? "Tool failed")
        : compactJson(payload?.result ?? {}, 240)
    ).slice(0, 240);
  }
  return compactJson(payload, 240);
}

function messageText(message: TimelineChatMessage) {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }
  if (message.tool_calls) return compactJson(message.tool_calls, 1800);
  return "(empty message)";
}

function roleClasses(role: ChatRole) {
  switch (role) {
    case "system":
      return "border-blue-300/25 bg-blue-300/8 text-blue-100";
    case "user":
      return "border-ink/16 bg-ink/6 text-ink";
    case "assistant":
      return "border-ink/14 bg-ink/5 text-ink";
    case "tool":
      return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  }
}

function SparkLine({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  const points = values.length ? values : [0, 0];
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const range = Math.max(1, max - min);
  const width = 320;
  const height = 150;
  const path = points
    .map((value, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 18) - 9;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `0,${height} ${path} ${width},${height}`;

  return (
    <svg
      className={`h-full w-full overflow-visible ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPath} className="fill-sea opacity-14" />
      <polyline
        points={path}
        fill="none"
        className="stroke-sea"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ComponentChildren;
  children: ComponentChildren;
  className?: string;
}) {
  return (
    <section
      className={`relative min-h-0 overflow-hidden rounded-md border border-ink-hard/12 bg-paper/40 shadow-lg ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#0515C212,transparent_30%)]" />
      <ChamferFrame colorClass="bg-ink-hard/20" />
      <div className="relative flex h-12 items-center justify-between px-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-soft">
          {title}
        </p>
        {action}
      </div>
      <div className="relative h-[calc(100%-3rem)]">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  status,
  tone = "sea",
  title,
  onClick,
}: {
  label: string;
  value: string;
  status: string;
  tone?: "sea" | "green" | "yellow" | "red";
  title: string;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "green"
      ? "text-green-300"
      : tone === "yellow"
        ? "text-yellow-200"
        : tone === "red"
          ? "text-red-300"
          : "text-sea";

  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative overflow-hidden rounded-md border border-ink-hard/12 bg-paper/40 p-5 text-left shadow-lg ${
        onClick ? "transition-colors hover:border-sea/35 hover:bg-sea/6" : ""
      }`}
      title={title}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#0515C212,transparent_34%)]" />
      <ChamferFrame colorClass="bg-ink-hard/20" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-soft">
          {label}
        </p>
        <span className={`font-mono text-xs ${toneClass}`}>{status}</span>
      </div>
      <p className="relative mt-4 font-mono text-5xl font-medium leading-none tracking-[-0.08em] text-ink">
        {value}
      </p>
    </Comp>
  );
}

function LoadMoreIndicator({
  isLoading,
  hasMore,
  onLoadMore,
  compact = false,
}: {
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  compact?: boolean;
}) {
  if (!isLoading && !hasMore) {
    return (
      <div
        className={`text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hard ${
          compact ? "px-3 py-2" : "px-4 py-4"
        }`}
      >
        All loaded
      </div>
    );
  }

  return (
    <div className={compact ? "px-3 py-2" : "px-4 py-4"}>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoading}
        className={`flex w-full items-center justify-center gap-3 rounded-sm border border-dashed border-ink/16 bg-[rgb(4,6,12)] font-mono text-[10px] uppercase tracking-[0.22em] text-ink transition-colors hover:border-ink/35 disabled:cursor-wait disabled:text-ink-soft disabled:hover:border-ink/16 ${
          compact ? "px-3 py-2" : "px-3 py-3"
        }`}
      >
        {isLoading && (
          <span className="h-4 w-4 rounded-full border-2 border-ink-hard/25 border-t-ink animate-spin" />
        )}
        {isLoading ? "Loading more sessions" : "Load more sessions"}
      </button>
    </div>
  );
}

export default function AgentsPage() {
  const { hid } = useParams();
  const caseId = hid?.trim() || undefined;
  const cacheKey = caseId ?? "__all__";
  const cachedPage = agentsPageCache.get(cacheKey);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>(
    cachedPage?.sessions ?? []
  );
  const [stats, setStats] = useState<AgentSessionStats>(
    normalizeStats(cachedPage?.stats)
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    cachedPage?.selectedId ?? null
  );
  const [details, setDetails] = useState<AgentSessionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedPage);
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(
    cachedPage?.hasMoreSessions ?? true
  );
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("started_at");
  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [diagnosticsTab, setDiagnosticsTab] =
    useState<DiagnosticsTab>("events");
  const [renderedDiagnosticsTab, setRenderedDiagnosticsTab] =
    useState<DiagnosticsTab>("events");
  const [isDiagnosticsContentPending, setIsDiagnosticsContentPending] =
    useState(false);
  const detailsRequestRef = useRef(0);
  const diagnosticsTimeoutRef = useRef<number | null>(null);
  const loadMoreSessionsRef = useRef(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.session_id === selectedId) ?? null,
    [selectedId, sessions]
  );

  const load = async (force = false) => {
    const cached = agentsPageCache.get(cacheKey);
    if (cached && !force) {
      setStats(normalizeStats(cached.stats));
      setSessions(cached.sessions);
      setHasMoreSessions(cached.hasMoreSessions ?? true);
      setSelectedId((current) =>
        current &&
        cached.sessions.some((session) => session.session_id === current)
          ? current
          : cached.selectedId
      );
      setIsLoading(false);
      return;
    }

    if (!cached) setIsLoading(true);
    setError(null);
    try {
      const [nextStats, nextSessions] = await Promise.all([
        window.api.agents.getStats({ caseId }) as Promise<AgentSessionStats>,
        window.api.agents.listSessions({
          skip: 0,
          limit: SESSION_PAGE_SIZE,
          caseId,
        }) as Promise<AgentSessionSummary[]>,
      ]);
      const resolvedStats = normalizeStats(nextStats);
      const resolvedSessions = nextSessions ?? [];
      const resolvedHasMoreSessions =
        resolvedSessions.length === SESSION_PAGE_SIZE;
      const resolvedSelectedId =
        selectedId &&
        resolvedSessions.some((session) => session.session_id === selectedId)
          ? selectedId
          : (resolvedSessions[0]?.session_id ?? null);

      agentsPageCache.set(cacheKey, {
        sessions: resolvedSessions,
        stats: resolvedStats,
        selectedId: resolvedSelectedId,
        hasMoreSessions: resolvedHasMoreSessions,
      });
      setStats(resolvedStats);
      setSessions(resolvedSessions);
      setHasMoreSessions(resolvedHasMoreSessions);
      setSelectedId((current) =>
        nextSessions?.some((session) => session.session_id === current)
          ? current
          : resolvedSelectedId
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreSessions = useCallback(async () => {
    if (
      isLoading ||
      isLoadingMoreSessions ||
      !hasMoreSessions ||
      loadMoreSessionsRef.current
    ) {
      return;
    }

    loadMoreSessionsRef.current = true;
    setIsLoadingMoreSessions(true);
    setError(null);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    const loadingStartedAt = performance.now();

    try {
      const nextSessions = (await window.api.agents.listSessions({
        skip: sessions.length,
        limit: SESSION_PAGE_SIZE,
        caseId,
      })) as AgentSessionSummary[];
      const incomingSessions = nextSessions ?? [];
      const incomingIds = new Set(
        sessions.map((session) => session.session_id)
      );
      const mergedSessions = [
        ...sessions,
        ...incomingSessions.filter(
          (session) => !incomingIds.has(session.session_id)
        ),
      ];
      const nextHasMoreSessions =
        incomingSessions.length === SESSION_PAGE_SIZE &&
        mergedSessions.length > sessions.length;

      setSessions(mergedSessions);
      setHasMoreSessions(nextHasMoreSessions);
      agentsPageCache.set(cacheKey, {
        sessions: mergedSessions,
        stats,
        selectedId,
        hasMoreSessions: nextHasMoreSessions,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    } finally {
      const remainingVisibleTime = 180 - (performance.now() - loadingStartedAt);
      if (remainingVisibleTime > 0) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, remainingVisibleTime)
        );
      }
      loadMoreSessionsRef.current = false;
      setIsLoadingMoreSessions(false);
    }
  }, [
    cacheKey,
    caseId,
    hasMoreSessions,
    isLoading,
    isLoadingMoreSessions,
    selectedId,
    sessions,
    stats,
  ]);

  const maybeLoadMoreSessions = useCallback(
    (element: HTMLDivElement) => {
      if (
        element.scrollHeight - element.scrollTop - element.clientHeight <=
        LOAD_MORE_THRESHOLD_PX
      ) {
        void loadMoreSessions();
      }
    },
    [loadMoreSessions]
  );

  const onSessionsTableScroll = useCallback(
    (event: Event) => {
      maybeLoadMoreSessions(event.currentTarget as HTMLDivElement);
    },
    [maybeLoadMoreSessions]
  );

  useEffect(() => {
    const cached = agentsPageCache.get(cacheKey);
    setStats(normalizeStats(cached?.stats));
    setSessions(cached?.sessions ?? []);
    setSelectedId(cached?.selectedId ?? null);
    setHasMoreSessions(cached?.hasMoreSessions ?? true);
    setIsLoadingMoreSessions(false);
    setDetails(null);
    setIsLoading(!cached);
    void load();
  }, [cacheKey]);

  useEffect(() => {
    agentsPageCache.set(cacheKey, {
      sessions,
      stats,
      selectedId,
      hasMoreSessions,
    });
  }, [cacheKey, hasMoreSessions, selectedId, sessions, stats]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }

    if (sessionDetailsCache.has(selectedId)) {
      setDetails(sessionDetailsCache.get(selectedId) ?? null);
      return;
    }

    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;
    void window.api.agents.getSession(selectedId).then((nextDetails) => {
      sessionDetailsCache.set(selectedId, nextDetails);
      if (detailsRequestRef.current === requestId) setDetails(nextDetails);
    });
  }, [selectedId]);

  useEffect(
    () => () => {
      if (diagnosticsTimeoutRef.current !== null) {
        window.clearTimeout(diagnosticsTimeoutRef.current);
      }
    },
    []
  );

  const switchDiagnosticsTab = useCallback(
    (tab: DiagnosticsTab) => {
      if (tab === diagnosticsTab) return;

      if (diagnosticsTimeoutRef.current !== null) {
        window.clearTimeout(diagnosticsTimeoutRef.current);
      }

      setDiagnosticsTab(tab);
      setIsDiagnosticsContentPending(true);

      diagnosticsTimeoutRef.current = window.setTimeout(() => {
        diagnosticsTimeoutRef.current = null;
        setRenderedDiagnosticsTab(tab);
        window.requestAnimationFrame(() => {
          setIsDiagnosticsContentPending(false);
        });
      }, 80);
    },
    [diagnosticsTab]
  );

  const highContextThreshold = Math.max(1, stats.averageContextTokens * 1.5);
  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(sessions.map((session) => session.model).filter(Boolean))
      ).sort(),
    [sessions]
  );
  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      timeRange === "24h"
        ? now - 24 * 60 * 60 * 1000
        : timeRange === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : 0;

    return [...sessions]
      .filter((session) => {
        if (filter === "all") return true;
        if (filter === "high-context") {
          return session.max_context_tokens > highContextThreshold;
        }
        return session.status === filter;
      })
      .filter((session) => {
        if (modelFilter !== "all" && session.model !== modelFilter)
          return false;
        if (cutoff && new Date(session.started_at).getTime() < cutoff)
          return false;
        if (!normalizedQuery) return true;
        return [
          session.target,
          session.workflow,
          session.provider,
          session.model,
          session.session_id,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortKey === "started_at") {
          return (
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          );
        }
        if (sortKey === "status") return a.status.localeCompare(b.status);
        return (b[sortKey] ?? 0) - (a[sortKey] ?? 0);
      });
  }, [
    filter,
    highContextThreshold,
    modelFilter,
    query,
    sessions,
    sortKey,
    timeRange,
  ]);

  const contextValues =
    stats.contextSeries.length > 1
      ? stats.contextSeries.map((item) => item.maxContextTokens)
      : [
          0,
          stats.averageContextTokens || 0,
          selectedSession?.max_context_tokens || 0,
        ].filter(Number.isFinite);
  const durationValues = sessions.map((session) => session.duration_ms ?? 0);
  const topTools = [...stats.toolUsage]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 6);
  const captureSeries = [...stats.entityCaptureSeries]
    .sort((a, b) => b.capturedEntities - a.capturedEntities)
    .slice(0, 6);
  const maxCaptureToolCalls = Math.max(
    1,
    ...captureSeries.map((item) => item.toolCalls)
  );
  const maxCapturedEntities = Math.max(
    1,
    ...captureSeries.map((item) => item.capturedEntities)
  );
  const replayEvents = useMemo(
    () => details?.events.slice(0, 120) ?? [],
    [details?.events]
  );
  const filteredReplayEvents = useMemo(() => {
    const visibleEvents = replayEvents.filter(
      (event) => event.event_type !== "context_snapshot"
    );
    return visibleEvents.filter((event) => {
      if (eventFilter === "all") return true;
      if (eventFilter === "error") return event.ok === 0;
      if (eventFilter === "tool")
        return event.event_type.includes("tool") || !!event.tool_name;
      return (
        event.event_type === "llm_message" ||
        event.event_type.includes("message")
      );
    });
  }, [eventFilter, replayEvents]);
  const timelineRows = useMemo<TimelineRow[]>(() => {
    const resultByToolCallId = new Map<
      string,
      AgentSessionDetails["events"][number]
    >();
    for (const event of filteredReplayEvents) {
      if (event.event_type === "tool_result" && event.tool_call_id) {
        resultByToolCallId.set(event.tool_call_id, event);
      }
    }

    return filteredReplayEvents
      .filter(
        (event) =>
          event.event_type !== "tool_result" ||
          !event.tool_call_id ||
          !filteredReplayEvents.some(
            (candidate) =>
              candidate.event_type === "tool_call" &&
              candidate.tool_call_id === event.tool_call_id
          )
      )
      .map((event) => ({
        kind: "event" as const,
        id:
          event.event_type === "tool_call" && event.tool_call_id
            ? `tool-${event.tool_call_id}`
            : `event-${event.id}`,
        event,
        resultEvent:
          event.event_type === "tool_call" && event.tool_call_id
            ? resultByToolCallId.get(event.tool_call_id)
            : undefined,
      }));
  }, [filteredReplayEvents]);
  const timelineVirtual = useVirtualRows(
    timelineRows.length,
    useCallback(() => 124, []),
    8
  );
  const caseSessionsVirtual = useVirtualRows(
    sessions.length,
    useCallback(() => 96, []),
    8
  );
  const onCaseSessionsScroll = useCallback(
    (event: Event) => {
      const element = event.currentTarget as HTMLDivElement;
      caseSessionsVirtual.onScroll(event);
      maybeLoadMoreSessions(element);
    },
    [caseSessionsVirtual.onScroll, maybeLoadMoreSessions]
  );
  const selectedEventValues = replayEvents.map(
    (event, index) => event.duration_ms ?? event.round ?? index + 1
  );
  const llmMessageTape = replayEvents
    .filter((event) => event.event_type === "llm_message")
    .slice(0, 10);
  const selectedDuration =
    selectedSession?.duration_ms ?? stats.averageDurationMs;
  const maxToolCalls = Math.max(1, ...topTools.map((tool) => tool.calls));
  const totalToolCalls = Math.max(1, stats.totalToolCalls);
  const errorRate =
    stats.totalToolCalls > 0
      ? (stats.totalToolErrors / stats.totalToolCalls) * 100
      : 0;
  const selectedTokenCost = selectedSession
    ? (selectedSession.max_context_tokens / 1_000_000) * 5
    : (stats.averageContextTokens / 1_000_000) * 5;
  const latencyValues = replayEvents
    .map((event) => event.duration_ms ?? 0)
    .filter((value) => value > 0);
  const p50Latency = percentile(latencyValues, 50);
  const p95Latency = percentile(latencyValues, 95);
  const sessionDurations = sessions
    .map((session) => session.duration_ms ?? 0)
    .filter((value) => value > 0);
  const p95SessionDuration = percentile(sessionDurations, 95);
  const completionRate =
    stats.totalSessions > 0
      ? (stats.completedSessions / stats.totalSessions) * 100
      : 0;
  const sessionFailureRate =
    stats.totalSessions > 0
      ? (stats.failedSessions / stats.totalSessions) * 100
      : 0;
  const eventsPerSession =
    stats.totalSessions > 0 ? stats.totalEvents / stats.totalSessions : 0;
  const capturedEntitiesPerSession =
    stats.totalSessions > 0
      ? stats.totalCapturedEntities / stats.totalSessions
      : 0;
  const toolsPerCapturedEntity =
    stats.totalCapturedEntities > 0
      ? stats.totalToolCalls / stats.totalCapturedEntities
      : 0;
  const captureYield =
    stats.totalToolCalls > 0
      ? (stats.totalCapturedEntities / stats.totalToolCalls) * 100
      : 0;
  const captureSessionRate =
    stats.totalSessions > 0
      ? (stats.entityCaptureSessions / stats.totalSessions) * 100
      : 0;
  const highContextSessions = sessions.filter(
    (session) => session.max_context_tokens > highContextThreshold
  ).length;
  const contextPeak = Math.max(0, ...contextValues);
  const contextUtilization =
    contextPeak > 0 ? (stats.averageContextTokens / contextPeak) * 100 : 0;
  const avgToolLatency =
    stats.totalToolCalls > 0
      ? stats.toolUsage.reduce((sum, tool) => sum + tool.totalDurationMs, 0) /
        stats.totalToolCalls
      : 0;
  const copyText = (value: string | null | undefined) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
  };

  return (
    <div className="relative isolate flex h-screen min-h-0 overflow-hidden bg-cod-950 pt-8 text-ink">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-size-[56px_56px] opacity-35" />
      <div className="pointer-events-none absolute inset-x-[16%] top-14 h-48 rounded-full bg-[radial-gradient(circle,rgba(39,67,149,0.24),transparent_68%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-[36%] bottom-4 h-36 rounded-full bg-ink/4 blur-3xl" />
      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="relative mx-4 mt-4 flex h-24 shrink-0 items-center justify-between overflow-hidden rounded-md border border-ink-hard/12 bg-paper/40 px-6 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#0515C212,transparent_28%)]" />
          <ChamferFrame colorClass="bg-ink-hard/20" />
          <div className="relative">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.34em] text-ink-soft">
              <span>Agent observability</span>
              <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
              <span>{caseId ? `Case ${caseId.slice(0, 8)}` : "All cases"}</span>
            </div>
            <h1 className="mt-4 pb-0 text-4xl font-medium uppercase tracking-[-0.08em] text-ink">
              Session Replay Dashboard
            </h1>
          </div>
          <div className="relative flex items-center gap-3">
            <span
              className="hidden rounded-sm border border-dashed border-ink/14 bg-paper/40 px-3 py-2 font-mono text-xs text-ink-soft lg:block"
              title="Current session query scope."
            >
              {formatNumber(stats.totalEvents)} events
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void load(true)}
              className="h-10 border-sea/30 bg-sea/10 text-sea hover:bg-sea/18"
              title="Reload agent sessions and aggregate stats from Turso."
            >
              Refresh
              <Icon icon="refresh" className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden p-6">
          {error && (
            <div className="mb-6 rounded-md border border-red-400/35 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <section className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_26rem] grid-rows-[9rem_18rem_minmax(0,1fr)] gap-6">
            <div className="col-span-2 grid grid-cols-6 gap-4">
              <KpiCard
                label="Sessions"
                value={formatNumber(stats.totalSessions)}
                status={`${formatNumber(stats.completedSessions)} completed`}
                tone="green"
                title="Total agent sessions persisted in the active scope."
                onClick={() => setFilter("all")}
              />
              <KpiCard
                label="Captured Entities"
                value={formatNumber(stats.totalCapturedEntities)}
                status={`${capturedEntitiesPerSession.toFixed(1)} / run`}
                tone="sea"
                title="Successful add_unverified_entity_to_graph results captured by agent runs."
              />
              <KpiCard
                label="Tool Calls"
                value={formatNumber(stats.totalToolCalls)}
                status={`${toolsPerCapturedEntity ? toolsPerCapturedEntity.toFixed(1) : "0"} / entity`}
                tone={stats.totalToolErrors ? "red" : "sea"}
                title="Tool invocations recorded during agent execution."
                onClick={() => {
                  setFilter(stats.totalToolErrors ? "failed" : "all");
                  setEventFilter("tool");
                }}
              />
              <KpiCard
                label="Capture Yield"
                value={formatPercent(captureYield)}
                status={`${formatNumber(stats.entityCaptureSessions)} runs`}
                tone={captureYield > 0 ? "green" : "sea"}
                title="Captured entities divided by total tool calls."
              />
              <KpiCard
                label="Max Context"
                value={formatNumber(stats.averageContextTokens)}
                status={`${formatNumber(highContextSessions)} high`}
                title="Average recorded maximum context token count."
                onClick={() => setFilter("high-context")}
              />
              <KpiCard
                label="Avg Duration"
                value={formatDuration(stats.averageDurationMs)}
                status={`${formatNumber(stats.runningSessions)} running`}
                tone={stats.runningSessions ? "yellow" : "sea"}
                title="Average completed or recorded session duration."
                onClick={() => setSortKey("duration_ms")}
              />
            </div>

            <Panel
              title="Graph capture yield"
              action={
                <span className="font-mono text-xs text-ink-soft">
                  {formatNumber(stats.totalCapturedEntities)} captured
                </span>
              }
            >
              <div className="flex h-full flex-col px-5 pb-5">
                <div className="grid grid-cols-3 gap-3 border-b border-ink/8 pb-3">
                  {[
                    [
                      "Tools / Entity",
                      toolsPerCapturedEntity
                        ? toolsPerCapturedEntity.toFixed(1)
                        : "0",
                    ],
                    ["Capture Yield", formatPercent(captureYield)],
                    ["Capture Runs", formatPercent(captureSessionRate)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-3 py-2"
                    >
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        {label}
                      </p>
                      <p className="mt-1 font-mono text-lg text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-auto pt-3">
                  {captureSeries.length ? (
                    <div className="space-y-3">
                      {captureSeries.map((item) => {
                        const toolPct =
                          (item.toolCalls / maxCaptureToolCalls) * 100;
                        const entityPct =
                          (item.capturedEntities / maxCapturedEntities) * 100;
                        const yieldPct =
                          item.toolCalls > 0
                            ? (item.capturedEntities / item.toolCalls) * 100
                            : 0;
                        return (
                          <button
                            key={item.sessionId}
                            type="button"
                            onClick={() => setSelectedId(item.sessionId)}
                            className="w-full rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-3 py-2 text-left transition-colors hover:border-sea/35 hover:bg-sea/6"
                            title={`${item.capturedEntities} captured entities from ${item.toolCalls} tool calls.`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-ink-soft">
                                {item.target || item.sessionId.slice(0, 8)}
                              </span>
                              <span className="font-mono text-sea">
                                {formatPercent(yieldPct)}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="h-1.5 rounded-sm bg-ink/8">
                                <div
                                  className="h-full rounded-sm bg-ink/35"
                                  style={{
                                    width: `${Math.max(3, toolPct)}%`,
                                  }}
                                />
                              </div>
                              <div className="h-1.5 rounded-sm bg-ink/8">
                                <div
                                  className="h-full rounded-sm bg-sea"
                                  style={{
                                    width: `${Math.max(3, entityPct)}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-soft">
                              <span>
                                {formatNumber(item.toolCalls)} tool calls
                              </span>
                              <span>
                                {formatNumber(item.capturedEntities)} entities
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-center text-sm text-ink-soft">
                      No captured graph entities recorded for this scope.
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Tool usage">
              <div className="h-full overflow-auto px-5 pb-5">
                <div className="space-y-4">
                  {topTools.length ? (
                    topTools.map((tool) => {
                      const pct = (tool.calls / totalToolCalls) * 100;
                      const failurePct = tool.calls
                        ? (tool.failures / tool.calls) * 100
                        : 0;
                      return (
                        <div
                          key={tool.toolName}
                          title={`Latency total: ${formatDuration(tool.totalDurationMs)}. Failure rate: ${formatPercent(failurePct)}.`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-ink">
                              {tool.toolName}
                            </span>
                            <span
                              className={
                                tool.failures ? "text-red-300" : "text-sea"
                              }
                            >
                              {formatPercent(pct)}
                            </span>
                          </div>
                          <div className="h-2 rounded-sm bg-ink/8">
                            <div
                              className={`h-full rounded-sm ${
                                tool.failures ? "bg-red-400" : "bg-sea"
                              }`}
                              style={{
                                width: `${Math.max(4, (tool.calls / maxToolCalls) * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-soft">
                            <span>{formatNumber(tool.calls)} calls</span>
                            <span>
                              {tool.capturedEntities
                                ? `${formatNumber(tool.capturedEntities)} entities`
                                : formatDuration(tool.totalDurationMs)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-ink-soft">
                      No tool calls recorded.
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            <Panel
              title=""
              className="row-span-2"
              action={
                <div className="flex w-full items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    {(["events", "case-sessions"] as DiagnosticsTab[]).map(
                      (tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => switchDiagnosticsTab(tab)}
                          className={`relative pb-2 font-mono text-[11px] uppercase tracking-[0.28em] transition-colors ${
                            diagnosticsTab === tab
                              ? "text-ink"
                              : "text-ink-soft hover:text-ink"
                          }`}
                        >
                          {tab === "case-sessions"
                            ? "Case sessions"
                            : "Events timeline"}
                          {diagnosticsTab === tab && (
                            <span className="absolute bottom-0 left-0 h-px w-full bg-ink" />
                          )}
                        </button>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {diagnosticsTab === "events" &&
                      (
                        ["all", "tool", "message", "error"] as EventFilter[]
                      ).map((nextFilter) => (
                        <button
                          key={nextFilter}
                          type="button"
                          onClick={() => setEventFilter(nextFilter)}
                          className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase ${
                            eventFilter === nextFilter
                              ? "bg-ink/12 text-ink"
                              : "bg-ink/4 text-ink-soft hover:text-ink"
                          }`}
                          title={`Show ${nextFilter} events.`}
                        >
                          {nextFilter}
                        </button>
                      ))}
                  </div>
                </div>
              }
            >
              <div className="relative h-full min-h-0">
                <div
                  className={`h-full overflow-auto px-4 pb-4 ${
                    isDiagnosticsContentPending ? "pointer-events-none" : ""
                  }`}
                  ref={
                    renderedDiagnosticsTab === "events"
                      ? timelineVirtual.scrollRef
                      : caseSessionsVirtual.scrollRef
                  }
                  onScroll={
                    renderedDiagnosticsTab === "events"
                      ? timelineVirtual.onScroll
                      : onCaseSessionsScroll
                  }
                  aria-hidden={isDiagnosticsContentPending}
                >
                  {renderedDiagnosticsTab === "events" ? (
                    timelineRows.length ? (
                      <div
                        className="relative"
                        style={{ height: `${timelineVirtual.totalSize}px` }}
                      >
                        {timelineVirtual.virtualItems.map((item) => {
                          const row = timelineRows[item.index];
                          if (!row) return null;

                          const { event, resultEvent } = row;
                          const payload = event.payload as Record<
                            string,
                            any
                          > | null;
                          const message =
                            event.event_type === "llm_message"
                              ? (payload?.message as
                                  | TimelineChatMessage
                                  | undefined)
                              : undefined;
                          const detailPayload =
                            event.event_type === "tool_call"
                              ? {
                                  call: {
                                    tool_call_id: event.tool_call_id,
                                    tool_name: event.tool_name,
                                    args: payload?.args ?? {},
                                  },
                                  result: resultEvent
                                    ? {
                                        ok: resultEvent.ok === 1,
                                        duration_ms: resultEvent.duration_ms,
                                        payload: resultEvent.payload,
                                      }
                                    : null,
                                }
                              : {
                                  event_type: event.event_type,
                                  round: event.round,
                                  tool_name: event.tool_name,
                                  tool_call_id: event.tool_call_id,
                                  ok: event.ok,
                                  duration_ms: event.duration_ms,
                                  created_at: event.created_at,
                                  payload: event.payload,
                                };

                          return (
                            <VirtualRow
                              key={row.id}
                              item={item}
                              setRowSize={timelineVirtual.setRowSize}
                            >
                              <div className="pb-3 pt-1">
                                <details
                                  className="relative rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)]"
                                  title={`Event type: ${event.event_type}`}
                                >
                                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                                    <span
                                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${eventTone(
                                        event.event_type,
                                        event.ok
                                      )}`}
                                    >
                                      <Icon
                                        icon={eventIcon(event.event_type)}
                                        className="h-4 w-4"
                                      />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium text-ink">
                                          {eventLabel(event)}
                                        </p>
                                        {message?.role && (
                                          <span className="rounded-sm bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-soft">
                                            {message.role}
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-1 truncate text-xs text-ink-soft">
                                        {eventPreview(event)}
                                      </p>
                                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hard">
                                        {event.round == null
                                          ? "unassigned"
                                          : `round ${event.round}`}{" "}
                                        / {formatDate(event.created_at)}
                                        {resultEvent?.duration_ms != null
                                          ? ` / ${formatDuration(resultEvent.duration_ms)}`
                                          : event.duration_ms != null
                                            ? ` / ${formatDuration(event.duration_ms)}`
                                            : ""}
                                      </p>
                                    </div>
                                    <Icon
                                      icon="chevron-down"
                                      className="mt-1 h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                                    />
                                  </summary>
                                  {message ? (
                                    <div
                                      className={`mx-4 mb-4 rounded-md border border-dashed p-3 ${roleClasses(
                                        message.role
                                      )}`}
                                    >
                                      <div className="mb-2 flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-75">
                                          {message.role}
                                          {message.name
                                            ? ` / ${message.name}`
                                            : ""}
                                        </span>
                                        {message.tool_call_id && (
                                          <span className="truncate font-mono text-[10px] opacity-55">
                                            {message.tool_call_id}
                                          </span>
                                        )}
                                      </div>
                                      <pre className="max-h-44 overflow-auto text-wrap font-mono text-[11px] leading-5">
                                        {messageText(message)}
                                      </pre>
                                    </div>
                                  ) : null}
                                  <div className="flex items-center justify-between border-t border-dashed border-ink/10 px-4 py-2">
                                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                                      {event.event_type === "tool_call"
                                        ? "Tool call and result"
                                        : "Event payload"}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyText(
                                          compactJson(detailPayload, 8000)
                                        )
                                      }
                                      className="text-xs text-ink-soft hover:text-ink"
                                    >
                                      copy json
                                    </button>
                                  </div>
                                  <CodeMirrorViewer
                                    value={compactJson(detailPayload, 8000)}
                                    language="json"
                                    showLineNumbers
                                    className="max-h-72 overflow-auto border-t border-ink/8 bg-black/20"
                                  />
                                </details>
                              </div>
                            </VirtualRow>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-ink-soft">
                        Select a session to inspect events.
                      </div>
                    )
                  ) : sessions.length ? (
                    <div
                      className="relative"
                      style={{
                        height: `${caseSessionsVirtual.totalSize + 76}px`,
                      }}
                    >
                      {caseSessionsVirtual.virtualItems.map((item) => {
                        const session = sessions[item.index];
                        if (!session) return null;

                        return (
                          <VirtualRow
                            key={session.session_id}
                            item={item}
                            setRowSize={caseSessionsVirtual.setRowSize}
                          >
                            <div className="pb-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(session.session_id);
                                  switchDiagnosticsTab("events");
                                }}
                                className={`w-full rounded-sm border border-dashed p-3 text-left transition-colors ${
                                  session.session_id === selectedId
                                    ? "border-sea/35 bg-sea/8"
                                    : "border-ink/10 bg-[rgb(4,6,12)] hover:border-sea/25 hover:bg-sea/6"
                                }`}
                                title="Open this case session in the replay dashboard."
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="truncate text-sm font-medium text-ink">
                                    {session.target}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase ${statusClasses(
                                      session.status
                                    )}`}
                                  >
                                    {session.status}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-ink-soft">
                                  <span className="truncate">
                                    {session.model}
                                  </span>
                                  <span>
                                    {formatNumber(session.max_context_tokens)}{" "}
                                    tok
                                  </span>
                                  <span className="text-right">
                                    {formatDuration(session.duration_ms)}
                                  </span>
                                </div>
                                <p className="mt-2 truncate text-xs text-ink-soft">
                                  {formatDate(session.started_at)} /{" "}
                                  {session.workflow}
                                </p>
                              </button>
                            </div>
                          </VirtualRow>
                        );
                      })}
                      <div
                        className="absolute left-0 top-0 w-full"
                        style={{
                          transform: `translateY(${caseSessionsVirtual.totalSize}px)`,
                        }}
                      >
                        <LoadMoreIndicator
                          isLoading={isLoadingMoreSessions}
                          hasMore={hasMoreSessions}
                          onLoadMore={loadMoreSessions}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-center text-sm text-ink-soft">
                      <div>
                        <p>No sessions found for this case.</p>
                        <LoadMoreIndicator
                          isLoading={isLoadingMoreSessions}
                          hasMore={hasMoreSessions}
                          onLoadMore={loadMoreSessions}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {isDiagnosticsContentPending && (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-paper/90 px-4 pb-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-md border border-ink/10 bg-[rgb(4,6,12)] p-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                      <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-ink-hard/25 border-t-ink animate-spin" />
                      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink">
                        Loading{" "}
                        {diagnosticsTab === "case-sessions"
                          ? "case sessions"
                          : "events timeline"}
                      </p>
                      <p className="mt-2 text-sm text-ink-soft">
                        Preparing cached panel data.
                      </p>
                    </div>
                  </div>
                )}
                {isLoadingMoreSessions &&
                  renderedDiagnosticsTab === "case-sessions" && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-md border border-ink/14 bg-cod-950/95 p-2 backdrop-blur-sm">
                      <LoadMoreIndicator
                        compact
                        isLoading={isLoadingMoreSessions}
                        hasMore={hasMoreSessions}
                        onLoadMore={loadMoreSessions}
                      />
                    </div>
                  )}
              </div>
            </Panel>

            <Panel
              title="Sessions"
              action={
                <span className="font-mono text-xs text-ink-soft">
                  {formatNumber(filteredSessions.length)} shown
                </span>
              }
            >
              <div className="flex h-13 items-center gap-3 border-t border-ink/8 px-5">
                <div className="flex min-w-56 flex-1 items-center gap-2 rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  <Icon icon="search" className="h-4 w-4 text-ink-soft" />
                  <input
                    value={query}
                    onInput={(event) =>
                      setQuery((event.currentTarget as HTMLInputElement).value)
                    }
                    placeholder="Filter target, model, workflow..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-hard"
                    title="Search sessions by target, workflow, provider, model, or session id."
                  />
                </div>
                <select
                  value={modelFilter}
                  onChange={(event) =>
                    setModelFilter(
                      (event.currentTarget as HTMLSelectElement).value
                    )
                  }
                  className="h-9 rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  title="Filter sessions by model."
                >
                  <option value="all">All models</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <select
                  value={timeRange}
                  onChange={(event) =>
                    setTimeRange(
                      (event.currentTarget as HTMLSelectElement)
                        .value as TimeRange
                    )
                  }
                  className="h-9 rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-3 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  title="Filter sessions by start time."
                >
                  <option value="all">All time</option>
                  <option value="24h">Last 24h</option>
                  <option value="7d">Last 7d</option>
                </select>
              </div>
              <div className="flex h-11 items-center gap-2 border-t border-ink/8 px-5">
                {(
                  [
                    "all",
                    "running",
                    "completed",
                    "failed",
                    "high-context",
                  ] as SessionFilter[]
                ).map((nextFilter) => (
                  <button
                    key={nextFilter}
                    type="button"
                    onClick={() => setFilter(nextFilter)}
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      filter === nextFilter
                        ? "bg-sea/15 text-sea"
                        : "bg-ink/4 text-ink-soft hover:text-ink"
                    }`}
                    title={`Filter sessions by ${nextFilter}.`}
                  >
                    {nextFilter}
                  </button>
                ))}
              </div>
              <div className="grid h-20 grid-cols-12 gap-2 border-t border-ink/8 px-5 py-2">
                {[
                  [
                    "Completion",
                    formatPercent(completionRate),
                    "completed / total",
                  ],
                  [
                    "Captured",
                    formatNumber(stats.totalCapturedEntities),
                    "entities captured by graph tools",
                  ],
                  [
                    "Entities / Run",
                    capturedEntitiesPerSession.toFixed(1),
                    "captured entities per session",
                  ],
                  [
                    "Tools / Entity",
                    toolsPerCapturedEntity
                      ? toolsPerCapturedEntity.toFixed(1)
                      : "0",
                    "tool calls per captured entity",
                  ],
                  [
                    "Capture Yield",
                    formatPercent(captureYield),
                    "captured entities / tool calls",
                  ],
                  [
                    "Session Errors",
                    formatPercent(sessionFailureRate),
                    "failed / total",
                  ],
                  [
                    "Tool Errors",
                    formatPercent(errorRate),
                    "tool errors / calls",
                  ],
                  [
                    "Tool Latency",
                    formatDuration(avgToolLatency),
                    "average per call",
                  ],
                  [
                    "P95 Session",
                    formatDuration(p95SessionDuration),
                    "session duration",
                  ],
                  [
                    "Events / Run",
                    eventsPerSession.toFixed(1),
                    "recorded timeline events",
                  ],
                  [
                    "High Context",
                    formatNumber(highContextSessions),
                    "above 1.5x average",
                  ],
                  [
                    "Context Use",
                    formatPercent(contextUtilization),
                    "average / peak context",
                  ],
                ].map(([label, value, description]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (label === "Session Errors") setFilter("failed");
                      if (label === "P95 Session") setSortKey("duration_ms");
                      if (label === "Tool Errors") setEventFilter("error");
                      if (label === "High Context") setFilter("high-context");
                      if (label === "Tools / Entity") setEventFilter("tool");
                    }}
                    className="rounded-sm border border-ink/10 bg-[rgb(4,6,12)] px-2 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:border-sea/35 hover:bg-sea/6"
                    title={description}
                  >
                    <p className="truncate text-[10px] text-ink-soft">
                      {label}
                    </p>
                    <p className="mt-1 truncate font-mono text-sm text-ink">
                      {value}
                    </p>
                  </button>
                ))}
              </div>
              <div
                className="h-[calc(100%-14rem)] overflow-auto"
                onScroll={onSessionsTableScroll}
              >
                {filteredSessions.length ? (
                  <>
                    <table className="w-full table-fixed text-sm">
                      <thead className="sticky top-0 z-10 bg-cod-950 text-left text-xs text-ink-soft">
                        <tr>
                          <th className="w-[34%] px-5 py-3 font-medium">
                            Target
                          </th>
                          <th className="px-4 py-3 font-medium">
                            <button
                              type="button"
                              onClick={() => setSortKey("status")}
                            >
                              Status
                            </button>
                          </th>
                          <th className="px-4 py-3 font-medium">Model</th>
                          <th className="px-4 py-3 font-medium">
                            <button
                              type="button"
                              onClick={() => setSortKey("max_context_tokens")}
                            >
                              Token Context Size
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            <button
                              type="button"
                              onClick={() => setSortKey("duration_ms")}
                            >
                              Duration
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSessions.map((session) => {
                          const highContext =
                            session.max_context_tokens > highContextThreshold;
                          const longDuration =
                            session.duration_ms != null &&
                            session.duration_ms > stats.averageDurationMs * 1.5;
                          return (
                            <tr
                              key={session.session_id}
                              onClick={() => setSelectedId(session.session_id)}
                              className={`h-16 cursor-pointer border-t border-dashed border-ink/8 transition-colors ${
                                session.session_id === selectedId
                                  ? "bg-sea/8"
                                  : "hover:bg-ink/4"
                              }`}
                            >
                              <td className="px-5 py-4">
                                <p className="truncate font-medium text-ink">
                                  {session.target}
                                </p>
                                <p className="mt-1 truncate text-xs text-ink-soft">
                                  {formatDate(session.started_at)} /{" "}
                                  {session.workflow}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase ${statusClasses(session.status)}`}
                                >
                                  {session.status}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <p className="truncate text-ink">
                                  {session.model}
                                </p>
                                <p className="mt-1 text-xs text-ink-soft">
                                  {session.provider}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="font-mono text-ink">
                                  {formatNumber(session.max_context_tokens)}
                                </p>
                                {highContext && (
                                  <p className="mt-1 text-xs text-yellow-200">
                                    high context
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="font-mono text-ink">
                                  {formatDuration(session.duration_ms)}
                                </p>
                                {longDuration && (
                                  <p className="mt-1 text-xs text-yellow-200">
                                    long duration
                                  </p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <LoadMoreIndicator
                      isLoading={isLoadingMoreSessions}
                      hasMore={hasMoreSessions}
                      onLoadMore={loadMoreSessions}
                    />
                  </>
                ) : (
                  <div className="grid min-h-full place-items-center text-center text-sm text-ink-soft">
                    <div>
                      <p>No sessions match the active filter.</p>
                      <LoadMoreIndicator
                        isLoading={isLoadingMoreSessions}
                        hasMore={hasMoreSessions}
                        onLoadMore={loadMoreSessions}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <section className="grid min-h-0 grid-cols-[24rem_minmax(0,1fr)] gap-6">
              <Panel
                title="Selected session"
                action={
                  <div className="flex items-center gap-1">
                    {(["summary", "final", "metadata"] as DetailTab[]).map(
                      (tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDetailTab(tab)}
                          className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase ${
                            detailTab === tab
                              ? "bg-sea/15 text-sea"
                              : "bg-ink/4 text-ink-soft hover:text-ink"
                          }`}
                        >
                          {tab}
                        </button>
                      )
                    )}
                  </div>
                }
              >
                <div className="space-y-4 px-5 pb-5">
                  <div>
                    <p className="truncate text-lg font-semibold text-ink">
                      {selectedSession?.target ?? "No session selected"}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-ink-soft">
                      {selectedSession?.session_id ??
                        "Select a row to inspect details"}
                    </p>
                  </div>
                  {detailTab === "summary" && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          [
                            "Agent Iterations",
                            formatNumber(selectedSession?.max_round ?? 0),
                          ],
                          ["Events", formatNumber(details?.events.length ?? 0)],
                          ["Error Rate", formatPercent(errorRate)],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] p-3"
                          >
                            <p className="text-xs text-ink-soft">{label}</p>
                            <p className="mt-2 font-mono text-lg text-ink">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] p-3">
                          <p className="text-xs text-ink-soft">Latency p95</p>
                          <p className="mt-2 font-mono text-lg text-ink">
                            {formatDuration(p95Latency)}
                          </p>
                        </div>
                        <div
                          className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] p-3"
                          title="Rough estimate using $5 per 1M prompt tokens. Exact cost depends on model pricing."
                        >
                          <p className="text-xs text-ink-soft">
                            Estimated Input Cost
                          </p>
                          <p className="mt-2 font-mono text-lg text-ink">
                            ${selectedTokenCost.toFixed(4)}
                          </p>
                        </div>
                      </div>
                      <div className="h-16 rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] p-2">
                        <SparkLine
                          values={
                            selectedEventValues.length
                              ? selectedEventValues
                              : durationValues
                          }
                        />
                      </div>
                    </>
                  )}
                  {detailTab === "final" && (
                    <div className="min-h-0 rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)]">
                      <div className="flex items-center justify-between border-b border-dashed border-ink/10 px-3 py-2">
                        <p className="text-xs text-ink-soft">
                          {selectedSession?.error ? "Error" : "Final answer"}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              selectedSession?.error ??
                                selectedSession?.final_answer
                            )
                          }
                          className="text-xs text-sea hover:text-ink"
                        >
                          copy
                        </button>
                      </div>
                      <pre className="max-h-32 overflow-auto p-3 text-wrap font-mono text-[11px] leading-5 text-ink-soft">
                        {selectedSession?.error ??
                          selectedSession?.final_answer ??
                          "No final output recorded."}
                      </pre>
                    </div>
                  )}
                  {detailTab === "metadata" && (
                    <div className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)]">
                      <div className="flex items-center justify-between border-b border-dashed border-ink/10 px-3 py-2">
                        <p className="text-xs text-ink-soft">
                          Session metadata
                        </p>
                        <button
                          type="button"
                          onClick={() => copyText(selectedSession?.session_id)}
                          className="text-xs text-sea hover:text-ink"
                        >
                          copy id
                        </button>
                      </div>
                      <pre className="max-h-32 overflow-auto p-3 font-mono text-[10px] leading-5 text-ink-soft">
                        {compactJson(
                          details?.session.metadata ??
                            details?.session.report ??
                            {}
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title="LLM history"
                action={
                  <span className="font-mono text-xs text-ink-soft">
                    {formatNumber(llmMessageTape.length)} shown
                  </span>
                }
              >
                <div className="h-full overflow-auto px-5 pb-5">
                  {llmMessageTape.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {llmMessageTape.map((event) => {
                        const payload = event.payload as Record<
                          string,
                          any
                        > | null;
                        const message = payload?.message as
                          | TimelineChatMessage
                          | undefined;
                        if (!message) return null;
                        return (
                          <details
                            key={event.id}
                            className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)]"
                          >
                            <summary className="cursor-pointer px-4 py-3 font-mono text-xs text-ink">
                              {message.role} /{" "}
                              {event.round == null
                                ? "unassigned"
                                : `round ${event.round}`}{" "}
                              / {formatDate(event.created_at)}
                            </summary>
                            <pre className="max-h-40 overflow-auto border-t border-dashed border-ink/10 p-4 font-mono text-[10px] leading-5 text-ink-soft">
                              {messageText(message)}
                            </pre>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-ink-soft">
                      No LLM history messages were recorded for this session.
                    </div>
                  )}
                </div>
              </Panel>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
