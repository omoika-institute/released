import type {
  AosintWorkflowEvent,
  OpenAIChatMessage,
  RunOsintWorkflowResult,
} from "./agentTypes";

const MAX_EVENT_STRING_CHARS = 20_000;
const MAX_EVENT_ARRAY_ITEMS = 80;
const MAX_EVENT_OBJECT_KEYS = 160;
const MAX_RENDERER_MESSAGES = 200;
const MAX_RENDERER_MESSAGE_CHARS = 40_000;
const MAX_RENDERER_TOOL_ARG_CHARS = 40_000;
const MAX_COMPACTION_MESSAGE_CHARS = 96_000;
const MAX_MODEL_TOOL_STRING_CHARS = 24_000;
const MAX_MODEL_TOOL_ARRAY_ITEMS = 60;
const MAX_MODEL_TOOL_OBJECT_KEYS = 160;

function truncateText(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function sanitizeValueForRenderer(
  value: unknown,
  maxStringChars = MAX_EVENT_STRING_CHARS,
  depth = 0
): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncateText(value, maxStringChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value);

  if (depth >= 5) {
    return "[truncated: max depth reached]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_EVENT_ARRAY_ITEMS)
      .map((item) => sanitizeValueForRenderer(item, maxStringChars, depth + 1));
    if (value.length > MAX_EVENT_ARRAY_ITEMS) {
      items.push(`[truncated: ${value.length - MAX_EVENT_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, unknown> = {};

  for (const [key, item] of entries.slice(0, MAX_EVENT_OBJECT_KEYS)) {
    result[key] = sanitizeValueForRenderer(item, maxStringChars, depth + 1);
  }

  if (entries.length > MAX_EVENT_OBJECT_KEYS) {
    result.__truncated_keys = entries.length - MAX_EVENT_OBJECT_KEYS;
  }

  return result;
}

function sanitizeValueForModel(
  value: unknown,
  maxStringChars = MAX_MODEL_TOOL_STRING_CHARS,
  depth = 0
): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncateText(value, maxStringChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value);

  if (depth >= 4) {
    return "[truncated: max depth reached]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_MODEL_TOOL_ARRAY_ITEMS)
      .map((item) => sanitizeValueForModel(item, maxStringChars, depth + 1));
    if (value.length > MAX_MODEL_TOOL_ARRAY_ITEMS) {
      items.push(`[truncated: ${value.length - MAX_MODEL_TOOL_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  const record = value as Record<string, unknown>;

  if (isBrowserResult(record)) {
    return summarizeBrowserResultForModel(record, maxStringChars, depth);
  }

  const entries = Object.entries(record);
  const result: Record<string, unknown> = {};

  for (const [key, item] of entries.slice(0, MAX_MODEL_TOOL_OBJECT_KEYS)) {
    result[key] = sanitizeValueForModel(item, maxStringChars, depth + 1);
  }

  if (entries.length > MAX_MODEL_TOOL_OBJECT_KEYS) {
    result.__truncated_keys = entries.length - MAX_MODEL_TOOL_OBJECT_KEYS;
  }

  return result;
}

function isBrowserResult(value: Record<string, unknown>) {
  return (
    typeof value.id === "string" &&
    typeof value.ok === "boolean" &&
    ("data" in value || "error" in value)
  );
}

function summarizeBrowserResultForModel(
  value: Record<string, unknown>,
  maxStringChars: number,
  depth: number
) {
  if (value.ok !== true) {
    return {
      id: value.id,
      ok: false,
      error: sanitizeValueForModel(value.error, maxStringChars, depth + 1),
      page: sanitizeValueForModel(value.page, maxStringChars, depth + 1),
    };
  }

  const data = value.data as Record<string, unknown> | undefined;
  const page = sanitizeValueForModel(value.page, maxStringChars, depth + 1);

  if (data && Array.isArray(data.results)) {
    return {
      id: value.id,
      ok: true,
      page,
      data: {
        query: sanitizeValueForModel(data.query, maxStringChars, depth + 1),
        engines: sanitizeValueForModel(data.engines, maxStringChars, depth + 1),
        pages: data.pages,
        deduplicatedCount: data.deduplicatedCount,
        engineErrors: sanitizeValueForModel(data.engineErrors, 4_000, depth + 1),
        results: data.results.slice(0, 20).map((result) => {
          const item = result as Record<string, unknown>;
          return {
            position: item.position,
            url: item.url,
            engines: item.engines,
            title: sanitizeValueForModel(item.title, 1_000, depth + 1),
            description: sanitizeValueForModel(item.description, 4_000, depth + 1),
            displayUrl: sanitizeValueForModel(item.displayUrl, 1_000, depth + 1),
          };
        }),
      },
    };
  }

  if (data && ("markdown" in data || "text" in data || "links" in data)) {
    return {
      id: value.id,
      ok: true,
      page,
      data: {
        title: sanitizeValueForModel(data.title, 2_000, depth + 1),
        excerpt: sanitizeValueForModel(data.excerpt, 10_000, depth + 1),
        siteName: sanitizeValueForModel(data.siteName, 1_000, depth + 1),
        publishedTime: data.publishedTime,
        text: sanitizeValueForModel(data.text, 40_000, depth + 1),
        links: Array.isArray(data.links)
          ? data.links.slice(0, 80).map((link) =>
              sanitizeValueForModel(link, 1_500, depth + 1)
            )
          : undefined,
        truncated: true,
        source: data.source,
      },
    };
  }

  return {
    id: value.id,
    ok: true,
    page,
    data: sanitizeValueForModel(data, maxStringChars, depth + 1),
  };
}

function sanitizeJsonString(raw: string | undefined, maxChars: number) {
  if (!raw) return raw;
  if (raw.length <= maxChars) return raw;

  try {
    const sanitized = JSON.stringify(
      sanitizeValueForRenderer(JSON.parse(raw), Math.floor(maxChars / 2))
    );
    return sanitized.length <= maxChars
      ? sanitized
      : JSON.stringify({ truncated: true, preview: truncateText(sanitized, maxChars) });
  } catch {
    return truncateText(raw, maxChars);
  }
}

function sanitizeMessageForRenderer(message: OpenAIChatMessage): OpenAIChatMessage {
  const content =
    typeof message.content === "string"
      ? message.role === "tool"
        ? sanitizeJsonString(message.content, MAX_RENDERER_MESSAGE_CHARS)
        : truncateText(message.content, MAX_RENDERER_MESSAGE_CHARS)
      : message.content;

  return {
    ...message,
    content,
    tool_calls: message.tool_calls?.map((call) => ({
      ...call,
      function: {
        ...call.function,
        arguments: sanitizeJsonString(
          call.function.arguments,
          MAX_RENDERER_TOOL_ARG_CHARS
        ),
      },
    })),
  };
}

export function sanitizeAosintWorkflowEventForRenderer(
  event: AosintWorkflowEvent
): AosintWorkflowEvent {
  switch (event.type) {
    case "assistant_message":
      return {
        ...event,
        content: truncateText(event.content, MAX_EVENT_STRING_CHARS),
      };
    case "tool_call":
      return {
        ...event,
        args: sanitizeValueForRenderer(event.args),
      };
    case "tool_result":
      return {
        ...event,
        result:
          event.result === undefined
            ? undefined
            : sanitizeValueForRenderer(event.result),
        error: event.error
          ? truncateText(event.error, MAX_EVENT_STRING_CHARS)
          : event.error,
      };
    case "context_snapshot":
      return {
        ...event,
        snapshot: {
          id: event.snapshot.id,
          caseId: event.snapshot.caseId,
          round: event.snapshot.round,
          model: event.snapshot.model,
          createdAt: event.snapshot.createdAt,
          messages: [],
          tools: [],
          metrics: event.snapshot.metrics,
          diff: event.snapshot.diff,
        },
      };
    default:
      return event;
  }
}

export function sanitizeAosintWorkflowResultForRenderer(
  result: RunOsintWorkflowResult
): RunOsintWorkflowResult {
  const messages = result.messages
    .slice(-MAX_RENDERER_MESSAGES)
    .map(sanitizeMessageForRenderer);

  return {
    ...result,
    finalAnswer: truncateText(result.finalAnswer, 100_000),
    report: result.report
      ? (sanitizeValueForRenderer(result.report, 40_000) as RunOsintWorkflowResult["report"])
      : result.report,
    caseContext: {
      ...result.caseContext,
      notes: result.caseContext.notes.slice(-100).map((note) => truncateText(note, 20_000)),
    },
    messages,
  };
}

export function compactMessageForCompaction(
  message: OpenAIChatMessage
): OpenAIChatMessage {
  const content =
    typeof message.content === "string"
      ? message.role === "tool"
        ? sanitizeJsonString(message.content, MAX_COMPACTION_MESSAGE_CHARS)
        : truncateText(message.content, MAX_COMPACTION_MESSAGE_CHARS)
      : message.content;

  return {
    ...message,
    content,
    tool_calls: message.tool_calls?.map((call) => ({
      ...call,
      function: {
        ...call.function,
        arguments: sanitizeJsonString(
          call.function.arguments,
          MAX_COMPACTION_MESSAGE_CHARS
        ),
      },
    })),
  };
}

export function sanitizeToolResultForModel(result: unknown) {
  return sanitizeValueForModel(result);
}

export function truncateAosintTraceText(value: string, maxChars = 24_000) {
  return truncateText(value, maxChars);
}
