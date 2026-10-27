import {
  tool,
  type ChatHistoryData,
  type ChatMessage,
  type ChatMessageData,
  type LMStudioClient,
} from "@lmstudio/sdk";
import { z } from "zod";
import {
  buildOsintSystemPrompt,
  buildStructuredReportPrompt,
  normalizeOsintReport,
} from "./agentPrompts";
import {
  getOsintToolParameterShape,
  osintToolDescriptions,
  type OsintToolName,
  runtimeAgentTools,
  runtimeToolArgumentSchemas,
  runtimeToolDescriptions,
  type RuntimeToolName,
} from "./agentTools";
import { sanitizeAssistantMessageContent } from "./messageContent";
import {
  compactMessageForCompaction,
  sanitizeToolResultForModel,
} from "./workflowPayloads";
import { createLMStudioClient, resolveLlmModel } from "./lmstudio";
import type {
  AosintWorkflowEvent,
  LMStudioOpenAIClientConfig,
  OpenAIChatMessage,
  OpenAIToolCall,
  OsintReport,
} from "./agentTypes";
import type { UserToolDefinition, UserToolParameters } from "../userTools";

const osintReportSchema = z.object({
  summary: z.string(),
  entities: z.array(z.string()),
  contacts: z.array(z.string()),
  domains: z.array(z.string()),
  evidence: z.array(z.string()),
  unknowns: z.array(z.string()),
});

const osintMessageCompactionSchema = z.object({
  summary: z.string(),
  entities: z.array(z.string()),
  contacts: z.array(z.string()),
  domains: z.array(z.string()),
  urls: z.array(z.string()),
  sources: z.array(z.string()),
  provenance: z.array(z.string()),
  leads: z.array(z.string()),
  unknowns: z.array(z.string()),
});

type OsintMessageCompaction = z.infer<typeof osintMessageCompactionSchema>;

const DEFAULT_OSINT_MAX_COMPACTIONS = 2;
const DEFAULT_COMPACTION_MAX_TOKENS = 700;
const DEFAULT_COMPACTION_LIST_LIMIT = 24;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function parseJsonArgs(raw: string | undefined) {
  if (!raw?.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    return {
      __parseError: error instanceof Error ? error.message : "JSON parse failed.",
      raw,
    };
  }
}

function dedupeTrimmed(values: string[], limit = DEFAULT_COMPACTION_LIST_LIMIT) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(trimmed);

    if (deduped.length >= limit) break;
  }

  return deduped;
}

function truncateText(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function formatLogPreview(value: string, maxChars = 180) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed ? truncateText(collapsed, maxChars) : "";
}

function getInitialPromptContext(messages: OpenAIChatMessage[]) {
  const systemPrompt =
    messages.find((message) => message.role === "system")?.content?.trim() ??
    buildOsintSystemPrompt();
  const userPrompt =
    messages.find((message) => message.role === "user")?.content?.trim() ?? "";

  return {
    systemPrompt,
    userPrompt,
  };
}

function buildMessageCompactionPrompt(
  initialPrompt: string,
  message: OpenAIChatMessage
) {
  return [
    "You are compacting one message from an OSINT investigation so the investigation can continue in a fresh chat.",
    "",
    "Initial investigation prompt:",
    initialPrompt,
    "",
    "Instructions:",
    "1. Extract only evidence, entities, sources, provenance, leads, and unknowns that are actually present in this one message.",
    "2. Prioritize names, usernames, organizations, domains, URLs, contact details, source websites, tool names, and direct observations.",
    "3. Treat tool outputs and observed page text as evidence.",
    "4. Treat assistant reasoning as tentative unless the message explicitly ties it to a source or tool output.",
    "5. If the message contains no useful evidence, leave the lists empty and say that briefly in the summary.",
    "",
    "Message JSON:",
    JSON.stringify(compactMessageForCompaction(message), null, 2),
  ].join("\n");
}

function normalizeMessageCompaction(
  input: Partial<OsintMessageCompaction>
): OsintMessageCompaction {
  return {
    summary: input.summary?.trim() ?? "",
    entities: input.entities ?? [],
    contacts: input.contacts ?? [],
    domains: input.domains ?? [],
    urls: input.urls ?? [],
    sources: input.sources ?? [],
    provenance: input.provenance ?? [],
    leads: input.leads ?? [],
    unknowns: input.unknowns ?? [],
  };
}

function buildFallbackCompaction(
  message: OpenAIChatMessage,
  fallbackSummary?: string
): OsintMessageCompaction {
  const summary =
    fallbackSummary?.trim() ||
    truncateText(message.content?.trim() || `Message role: ${message.role}`, 240);

  return normalizeMessageCompaction({
    summary,
  });
}

async function compactSingleMessage(params: {
  model: Awaited<ReturnType<typeof resolveLlmModel>>;
  systemPrompt: string;
  initialPrompt: string;
  message: OpenAIChatMessage;
  maxTokens?: number;
}): Promise<OsintMessageCompaction> {
  const prompt = buildMessageCompactionPrompt(
    params.initialPrompt,
    params.message
  );

  try {
    const structuredCompactionSchema =
      osintMessageCompactionSchema as unknown as {
        parse: (input: unknown) => OsintMessageCompaction;
      };
    const result = (await params.model.respond<OsintMessageCompaction>(
      toSdkChat([
        {
          role: "system",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ]),
      {
        temperature: 0.1,
        maxTokens: Math.min(
          params.maxTokens ?? DEFAULT_COMPACTION_MAX_TOKENS,
          DEFAULT_COMPACTION_MAX_TOKENS
        ),
        structured: structuredCompactionSchema,
      }
    )) as unknown as {
      parsed: OsintMessageCompaction;
    };

    return normalizeMessageCompaction(result.parsed);
  } catch (error) {
    console.warn("[aosint:compaction] structured-fallback", {
      error: error instanceof Error ? error.message : String(error),
    });

    const response = await params.model.respond(
      toSdkChat([
        {
          role: "system",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content: [
            prompt,
            "",
            "Return a single JSON object with the keys:",
            "summary, entities, contacts, domains, urls, sources, provenance, leads, unknowns.",
          ].join("\n"),
        },
      ]),
      {
        temperature: 0.1,
        maxTokens: Math.min(
          params.maxTokens ?? DEFAULT_COMPACTION_MAX_TOKENS,
          DEFAULT_COMPACTION_MAX_TOKENS
        ),
      }
    );

    const content = response.content.trim();
    if (!content) {
      return buildFallbackCompaction(params.message);
    }

    try {
      return normalizeMessageCompaction(
        JSON.parse(content) as Partial<OsintMessageCompaction>
      );
    } catch {
      return buildFallbackCompaction(params.message, content);
    }
  }
}

function buildCompactedContinuationPrompt(params: {
  initialPrompt: string;
  compactions: OsintMessageCompaction[];
  compactionPass: number;
}) {
  const summaries = dedupeTrimmed(
    params.compactions.map((compaction) => compaction.summary),
    DEFAULT_COMPACTION_LIST_LIMIT
  );
  const entities = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.entities)
  );
  const contacts = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.contacts)
  );
  const domains = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.domains)
  );
  const urls = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.urls)
  );
  const sources = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.sources)
  );
  const provenance = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.provenance)
  );
  const leads = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.leads)
  );
  const unknowns = dedupeTrimmed(
    params.compactions.flatMap((compaction) => compaction.unknowns)
  );

  const sections = [
    `Continue the OSINT investigation from this compacted context snapshot (pass ${params.compactionPass}).`,
    "",
    "Original investigation prompt:",
    params.initialPrompt,
    "",
    "Compacted evidence summaries:",
    summaries.length ? summaries.map((item) => `- ${item}`).join("\n") : "- No compacted summaries available.",
    "",
    "Entities:",
    entities.length ? entities.map((item) => `- ${item}`).join("\n") : "- None extracted.",
    "",
    "Contacts:",
    contacts.length ? contacts.map((item) => `- ${item}`).join("\n") : "- None extracted.",
    "",
    "Domains:",
    domains.length ? domains.map((item) => `- ${item}`).join("\n") : "- None extracted.",
    "",
    "URLs:",
    urls.length ? urls.map((item) => `- ${item}`).join("\n") : "- None extracted.",
    "",
    "Sources:",
    sources.length ? sources.map((item) => `- ${item}`).join("\n") : "- None extracted.",
    "",
    "Provenance:",
    provenance.length
      ? provenance.map((item) => `- ${truncateText(item, 220)}`).join("\n")
      : "- None extracted.",
    "",
    "Leads to validate next:",
    leads.length ? leads.map((item) => `- ${item}`).join("\n") : "- No leads extracted.",
    "",
    "Unknowns:",
    unknowns.length ? unknowns.map((item) => `- ${item}`).join("\n") : "- No unknowns extracted.",
    "",
    "Continue gathering data with tools.",
    "Use the compacted evidence as working memory, avoid repeating identical tool calls unless you are validating or extending a lead, and keep separating direct evidence from inference.",
  ];

  return sections.join("\n");
}

async function compactMessagesForContinuation(params: {
  model: Awaited<ReturnType<typeof resolveLlmModel>>;
  systemPrompt: string;
  initialPrompt: string;
  messages: OpenAIChatMessage[];
  maxTokens?: number;
  compactionPass: number;
}) {
  const compactions: OsintMessageCompaction[] = [];

  for (const [index, message] of params.messages.entries()) {
    console.log("[aosint:compaction] message:start", {
      index: index + 1,
      total: params.messages.length,
      role: message.role,
    });

    const compaction = await compactSingleMessage({
      model: params.model,
      systemPrompt: params.systemPrompt,
      initialPrompt: params.initialPrompt,
      message,
      maxTokens: params.maxTokens,
    });
    compactions.push(compaction);

    console.log("[aosint:compaction] message:success", {
      index: index + 1,
      total: params.messages.length,
      summaryPreview: compaction.summary.slice(0, 160),
    });
  }

  return {
    compactions,
    continuationPrompt: buildCompactedContinuationPrompt({
      initialPrompt: params.initialPrompt,
      compactions,
      compactionPass: params.compactionPass,
    }),
  };
}

function toSdkChat(messages: OpenAIChatMessage[]) {
  const history = messages.reduce<ChatMessageData[]>(
    (chat, message) => {
    if (message.role === "tool") {
      chat.push({
        role: "tool",
        content: [
          {
            type: "toolCallResult",
            content: message.content ?? "",
            toolCallId: message.tool_call_id,
          },
        ],
      });
      return chat;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      const content: Extract<ChatMessageData, { role: "assistant" }>["content"] =
        [];
      const text = message.content
        ? sanitizeAssistantMessageContent(message.content)
        : "";
      if (text) {
        content.push({
          type: "text",
          text,
        });
      }

      content.push(
        ...message.tool_calls.map((call) => ({
          type: "toolCallRequest" as const,
          toolCallRequest: {
            id: call.id,
            type: "function" as const,
            name: call.function.name,
            arguments: parseJsonArgs(call.function.arguments),
          },
        }))
      );

      chat.push({
        role: "assistant",
        content,
      });
      return chat;
    }

    chat.push({
      role: message.role,
      content: [
        {
          type: "text",
          text: message.content ?? "",
        },
      ],
    });
    return chat;
    },
    []
  );

  return {
    messages: history,
  } satisfies ChatHistoryData;
}

function mapAssistantToolCalls(
  message: ChatMessage,
  messageIndex: number
): OpenAIToolCall[] | undefined {
  const requests = message.getToolCallRequests();
  if (requests.length === 0) return undefined;

  return requests.map((request, index) => ({
    id: request.id ?? `tool-${messageIndex}-${index}`,
    type: "function",
    function: {
      name: request.name,
      arguments: JSON.stringify(request.arguments ?? {}),
    },
  }));
}

function getToolCallSignature(name: string, args: unknown) {
  return `${name}:${stableStringify(args)}`;
}

function getMessageSignature(message: OpenAIChatMessage) {
  return stableStringify({
    role: message.role,
    name: message.name,
    tool_call_id: message.tool_call_id,
    content: message.content,
    tool_calls: message.tool_calls,
  });
}

function mapSdkMessageToOpenAiMessages(
  message: ChatMessage,
  messageIndex: number
): OpenAIChatMessage[] {
  switch (message.getRole()) {
    case "system":
    case "user":
      return [
        {
          role: message.getRole(),
          content: message.getText(),
        },
      ];
    case "assistant": {
      const toolCalls = mapAssistantToolCalls(message, messageIndex);
      const text = sanitizeAssistantMessageContent(message.getText());
      return [
        {
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls,
        },
      ];
    }
    case "tool":
      return message.getToolCallResults().map((result, index) => ({
        role: "tool",
        tool_call_id: result.toolCallId ?? `tool-result-${messageIndex}-${index}`,
        content: result.content,
      }));
    default:
      return [];
  }
}

function findFinalAnswer(messages: OpenAIChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    if (message.tool_calls?.length) continue;
    const content = message.content
      ? sanitizeAssistantMessageContent(message.content)
      : "";
    if (content) return content;
  }

  return "";
}

function isCrashError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("model has crashed") ||
    message.includes("crashed without additional information") ||
    message.includes("exit code: null")
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("AOSINT workflow was canceled.");
  }
}

function buildForcedFinalAnswerPrompt(reason: "budget" | "repetition") {
  if (reason === "repetition") {
    return [
      "Stop calling tools.",
      "You are repeating prior tool requests and already have enough context to answer.",
      "Write the best concise OSINT summary you can from the evidence already in the conversation.",
      "Separate confirmed facts, reasonable inferences, and unknowns.",
    ].join("\n");
  }

  return [
    "Stop calling tools.",
    "You have reached the tool-call budget for this workflow.",
    "Write the best concise OSINT summary you can from the evidence already in the conversation.",
    "Separate confirmed facts, reasonable inferences, and unknowns.",
  ].join("\n");
}

async function finalizeWithoutTools(
  params: Pick<
    RunOsintAgentLoopParams,
    | "caseId"
    | "client"
    | "model"
    | "temperature"
    | "maxTokens"
    | "contextLength"
    | "onEvent"
    | "signal"
  > & {
    messages: OpenAIChatMessage[];
    reason: "budget" | "repetition";
  }
): Promise<RunOsintAgentLoopResult> {
  throwIfAborted(params.signal);
  const finalPrompt = buildForcedFinalAnswerPrompt(params.reason);
  console.log("[aosint:agent] finalize:start", {
    reason: params.reason,
    messageCount: params.messages.length,
  });

  const model = await resolveLlmModel(params.client, params.model, {
    contextLength: params.contextLength,
    onLoadProgress: (event) =>
      params.onEvent?.({
        type: "model_loading",
        caseId: params.caseId,
        ...event,
      }),
  });
  throwIfAborted(params.signal);
  const response = await model.respond(
    toSdkChat([
      ...params.messages,
      {
        role: "user",
        content: finalPrompt,
      },
    ]),
    {
      temperature: params.temperature ?? 0.2,
      maxTokens: params.maxTokens,
    }
  );
  throwIfAborted(params.signal);

  const finalAnswer = sanitizeAssistantMessageContent(response.content);
  console.log("[aosint:agent] finalize:success", {
    reason: params.reason,
    finalAnswerPreview: finalAnswer.slice(0, 240),
  });

  return {
    finalAnswer,
    messages: [
      ...params.messages,
      {
        role: "user",
        content: finalPrompt,
      },
      {
        role: "assistant",
        content: finalAnswer,
      },
    ],
  };
}

function userParamsToZodShape(
  parameters: UserToolParameters
): Record<string, z.ZodType> {
  const required = new Set(parameters.required ?? []);
  return Object.fromEntries(
    Object.entries(parameters.properties).map(([key, def]) => {
      let base: z.ZodType;
      switch (def.type) {
        case "number":
          base = z.number();
          break;
        case "integer":
          base = z.number().int();
          break;
        case "boolean":
          base = z.boolean();
          break;
        default:
          base = z.string();
      }
      if (def.description) base = base.describe(def.description);
      return [key, required.has(key) ? base : base.optional()];
    })
  );
}

function createSdkOsintTools(
  executeTool: RunOsintAgentLoopParams["executeTool"],
  enabledBuiltinNames?: Set<string>,
  enabledRuntimeTools?: Set<RuntimeToolName>,
  userToolsList?: UserToolDefinition[],
  options?: {
    caseId: string;
    onEvent?: (event: AosintWorkflowEvent) => void;
    resolveToolCallId?: (name: string, args: unknown) => string | null;
    toolResultCache?: Map<string, unknown>;
  }
) {
  const seenToolCalls = options?.toolResultCache ?? new Map<string, unknown>();

  // Browser tools read from or mutate live browser state — their results depend
  // on which page is currently loaded, not just their args, so they must not be cached.
  const browserStatefulTools = new Set([
    "open_page",
    "read_page",
    "list_links",
    "click_element",
    "fill_input",
    "wait_for_match",
    "web_search",
  ]);

  const makeImplementation = (name: string) =>
    async (args: Record<string, unknown>) => {
      const cacheKey = `${name}:${stableStringify(args)}`;
      const startedAt = Date.now();
      const toolCallId = options?.resolveToolCallId?.(name, args) ?? cacheKey;
      const isCacheable = !browserStatefulTools.has(name);

      console.log("[aosint:agent] tool:start", { toolName: name, args });

      if (isCacheable && seenToolCalls.has(cacheKey)) {
        const durationMs = Date.now() - startedAt;
        const result = {
          deduplicated: true,
          cached: true,
          result: sanitizeToolResultForModel(seenToolCalls.get(cacheKey)),
        };
        console.log("[aosint:agent] tool:deduped", {
          toolName: name,
          durationMs,
        });
        options?.onEvent?.({
          type: "tool_result",
          caseId: options.caseId,
          toolCallId,
          toolName: name,
          ok: true,
          durationMs,
          result,
        });
        return result;
      }

      try {
        const rawResult = await executeTool(name, args);
        const result = sanitizeToolResultForModel(rawResult);
        const durationMs = Date.now() - startedAt;
        if (isCacheable) seenToolCalls.set(cacheKey, result);
        console.log("[aosint:agent] tool:success", {
          toolName: name,
          durationMs,
          resultPreview: JSON.stringify(result).slice(0, 240),
        });
        options?.onEvent?.({
          type: "tool_result",
          caseId: options.caseId,
          toolCallId,
          toolName: name,
          ok: true,
          durationMs,
          result,
        });
        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        console.error("[aosint:agent] tool:error", {
          toolName: name,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
        const result = {
          ok: false,
          error: error instanceof Error ? error.message : "Tool execution failed.",
        };
        options?.onEvent?.({
          type: "tool_result",
          caseId: options.caseId,
          toolCallId,
          toolName: name,
          ok: false,
          durationMs,
          error: error instanceof Error ? error.message : "Tool execution failed.",
        });
        return result;
      }
    };

  const builtinNames = (Object.keys(osintToolDescriptions) as OsintToolName[]).filter(
    (name) => !enabledBuiltinNames || enabledBuiltinNames.has(name)
  );

  const sdkTools = builtinNames.map((name) =>
    tool({
      name,
      description: osintToolDescriptions[name],
      parameters: getOsintToolParameterShape(name),
      implementation: makeImplementation(name),
    })
  );

  for (const name of enabledRuntimeTools ?? []) {
    sdkTools.push(
      tool({
        name,
        description: runtimeToolDescriptions[name],
        parameters: (
          runtimeToolArgumentSchemas[name] as z.ZodObject<
            Record<string, z.ZodTypeAny>
          >
        ).shape,
        implementation: makeImplementation(name),
      })
    );
  }

  for (const userTool of userToolsList ?? []) {
    if (!userTool.enabled) continue;
    sdkTools.push(
      tool({
        name: userTool.name,
        description: userTool.description,
        parameters: userParamsToZodShape(userTool.parameters),
        implementation: makeImplementation(userTool.name),
      })
    );
  }

  return sdkTools;
}

export interface RunOsintAgentLoopParams {
  caseId: string;
  client: LMStudioClient;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTurns?: number;
  maxTokens?: number;
  contextLength?: number;
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  enabledBuiltinNames?: string[];
  enabledRuntimeTools?: RuntimeToolName[];
  nearEndUserPrompt?: string;
  userTools?: UserToolDefinition[];
  onEvent?: (event: AosintWorkflowEvent) => void;
  signal?: AbortSignal;
}

export interface RunOsintAgentLoopResult {
  finalAnswer: string;
  messages: OpenAIChatMessage[];
}

export async function runOsintAgentLoop(
  params: RunOsintAgentLoopParams
): Promise<RunOsintAgentLoopResult> {
  throwIfAborted(params.signal);
  const model = await resolveLlmModel(params.client, params.model, {
    contextLength: params.contextLength,
    onLoadProgress: (event) =>
      params.onEvent?.({
        type: "model_loading",
        caseId: params.caseId,
        ...event,
      }),
  });
  throwIfAborted(params.signal);
  try {
    const modelInfo = await model.getModelInfo();
    console.log("[aosint:agent] model-info", {
      model: params.model,
      requestedContextLength: params.contextLength ?? null,
      loadedContextLength: modelInfo.contextLength,
      maxTokens: params.maxTokens ?? null,
      maxTurns: params.maxTurns ?? null,
    });
  } catch (error) {
    console.warn("[aosint:agent] model-info:error", {
      model: params.model,
      requestedContextLength: params.contextLength ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const initialPromptContext = getInitialPromptContext(params.messages);
  const fullTranscript = [...params.messages];
  const toolResultCache = new Map<string, unknown>();
  const maxTurns = params.maxTurns ?? 8;
  let workingMessages = [...params.messages];
  let emittedMessageCount = 0;
  let roundOffset = 0;
  let compactionPass = 0;
  let nearEndPromptInjected = false;

  console.log("[aosint:agent] start", {
    maxTurns,
    messageCount: fullTranscript.length,
    model: params.model,
  });
  params.onEvent?.({
    type: "agent_start",
    caseId: params.caseId,
    maxTurns,
    messageCount: fullTranscript.length,
    model: params.model,
  });

  const emittedHistoryMessageKeys = new Set<string>();
  const emitUniqueHistoryMessages = (
    messages: OpenAIChatMessage[],
    round: number
  ) => {
    messages.forEach((message, index) => {
      const key = getMessageSignature(message);
      if (emittedHistoryMessageKeys.has(key)) return;
      emittedHistoryMessageKeys.add(key);
      params.onEvent?.({
        type: "llm_message",
        caseId: params.caseId,
        round,
        messageIndex: index,
        role: message.role,
        message,
      });
    });
  };

  while (true) {
    throwIfAborted(params.signal);
    const sessionTurnBudget = maxTurns - roundOffset;
    if (sessionTurnBudget <= 0) {
      break;
    }

    const sessionTranscript = [...workingMessages];
    const queuedToolCallIds = new Map<string, string[]>();
    let currentRound = 0;

    try {
      await model.act(
        toSdkChat(workingMessages),
        createSdkOsintTools(
          params.executeTool,
          params.enabledBuiltinNames ? new Set(params.enabledBuiltinNames) : undefined,
          params.enabledRuntimeTools
            ? new Set(params.enabledRuntimeTools)
            : undefined,
          params.userTools,
          {
            caseId: params.caseId,
            onEvent: params.onEvent,
            toolResultCache,
            resolveToolCallId: (name, args) => {
              const signature = getToolCallSignature(name, args);
              const queue = queuedToolCallIds.get(signature);
              if (!queue?.length) return null;
              const toolCallId = queue.shift() ?? null;
              if (!queue.length) {
                queuedToolCallIds.delete(signature);
              }
              return toolCallId;
            },
          }
        ),
        {
          temperature: params.temperature ?? 0.2,
          maxTokens: params.maxTokens,
          allowParallelToolExecution: false,
          maxPredictionRounds: sessionTurnBudget,
          onRoundStart: (roundIndex) => {
            throwIfAborted(params.signal);
            currentRound = roundIndex + 1;
            const globalRound = roundOffset + currentRound;
            console.log("[aosint:agent] round:start", {
              round: globalRound,
              maxTurns,
              messageCount: sessionTranscript.length,
            });
            params.onEvent?.({
              type: "round_start",
              caseId: params.caseId,
              round: globalRound,
              maxTurns,
              messageCount: sessionTranscript.length,
            });
            emitUniqueHistoryMessages(sessionTranscript, globalRound);
          },
          onRoundEnd: (roundIndex) => {
            throwIfAborted(params.signal);
            const globalRound = roundOffset + roundIndex + 1;
            console.log("[aosint:agent] round:end", {
              round: globalRound,
              messageCount: sessionTranscript.length,
            });
            params.onEvent?.({
              type: "round_end",
              caseId: params.caseId,
              round: globalRound,
              messageCount: sessionTranscript.length,
            });
          },
          onMessage: (message) => {
            throwIfAborted(params.signal);
            emittedMessageCount += 1;
            const mapped = mapSdkMessageToOpenAiMessages(message, emittedMessageCount);
            sessionTranscript.push(...mapped);

            if (message.getRole() === "assistant") {
              const toolCalls =
                mapAssistantToolCalls(message, emittedMessageCount) ?? [];
              const content = sanitizeAssistantMessageContent(message.getText());
              const globalRound = roundOffset + currentRound;
              const toolNames = toolCalls.map((call) => call.function.name);
              const toolSummary = toolNames.length
                ? ` tools=${toolNames.join(",")}`
                : " tools=none";
              const preview = formatLogPreview(content);

              console.log(
                `[aosint:agent] round ${globalRound}: assistant${toolSummary}${
                  preview ? ` | ${preview}` : ""
                }`
              );

              const eventContent =
                content ||
                (toolCalls.length > 0
                  ? toolCalls.map((c) => `→ ${c.function.name}`).join("\n")
                  : "");
              if (eventContent) {
                params.onEvent?.({
                  type: "assistant_message",
                  caseId: params.caseId,
                  round: globalRound,
                  hasToolCalls: Boolean(toolCalls.length),
                  content: eventContent,
                });
              }

              for (const call of toolCalls) {
                const args = parseJsonArgs(call.function.arguments);
                const signature = getToolCallSignature(call.function.name, args);
                const queue = queuedToolCallIds.get(signature) ?? [];
                queue.push(call.id);
                queuedToolCallIds.set(signature, queue);
                params.onEvent?.({
                  type: "tool_call",
                  caseId: params.caseId,
                  toolCallId: call.id,
                  toolName: call.function.name,
                  args,
                });
              }
            }
          },
          handleInvalidToolRequest: (error, request) => {
            console.warn("[aosint:agent] tool:invalid-request", {
              error: error.message,
              toolName: request?.name ?? null,
            });
            return error.message;
          },
        }
      );
      throwIfAborted(params.signal);
    } catch (error) {
      if (params.signal?.aborted) throw error;
      if (!isCrashError(error)) throw error;

      console.warn("[aosint:agent] model-crash", {
        round: roundOffset + currentRound,
        sessionMessages: sessionTranscript.length - workingMessages.length,
        compactionPass,
      });
      params.onEvent?.({
        type: "assistant_message",
        caseId: params.caseId,
        round: roundOffset + currentRound,
        hasToolCalls: false,
        content:
          "The model crashed mid-session. Recovering by compacting collected evidence and continuing in a fresh session.",
      });
    }

    const sessionNewMessages = sessionTranscript.slice(workingMessages.length);
    fullTranscript.push(...sessionNewMessages);

    const finalAnswer = findFinalAnswer(sessionTranscript);
    if (finalAnswer) {
      if (params.nearEndUserPrompt?.trim() && !nearEndPromptInjected) {
        const nearEndPrompt: OpenAIChatMessage = {
          role: "user",
          content: params.nearEndUserPrompt.trim(),
        };
        nearEndPromptInjected = true;
        fullTranscript.push(nearEndPrompt);
        workingMessages = [...fullTranscript];
        continue;
      }

      console.log("[aosint:agent] complete", {
        finalAnswerPreview: finalAnswer.slice(0, 240),
      });
      return {
        finalAnswer,
        messages: fullTranscript,
      };
    }

    if (
      compactionPass >= DEFAULT_OSINT_MAX_COMPACTIONS ||
      sessionNewMessages.length === 0 ||
      roundOffset + currentRound >= maxTurns
    ) {
      break;
    }

    compactionPass += 1;
    roundOffset += currentRound;
    console.log("[aosint:compaction] start", {
      pass: compactionPass,
      messageCount: sessionNewMessages.length,
    });
    params.onEvent?.({
      type: "assistant_message",
      caseId: params.caseId,
      round: roundOffset,
      hasToolCalls: false,
      content:
        "Compacting investigation context into entities, sources, and provenance so the browser agent can continue gathering data.",
    });

    const compacted = await compactMessagesForContinuation({
      model,
      systemPrompt: initialPromptContext.systemPrompt,
      initialPrompt: initialPromptContext.userPrompt,
      messages: sessionNewMessages,
      maxTokens: params.maxTokens,
      compactionPass,
    });

    console.log("[aosint:compaction] success", {
      pass: compactionPass,
      compactions: compacted.compactions.length,
      continuationPreview: compacted.continuationPrompt.slice(0, 240),
    });

    fullTranscript.push({
      role: "user",
      content: compacted.continuationPrompt,
    });
    workingMessages = [
      {
        role: "system",
        content: initialPromptContext.systemPrompt,
      },
      {
        role: "user",
        content: compacted.continuationPrompt,
      },
    ];
  }

  return finalizeWithoutTools({
    caseId: params.caseId,
    client: params.client,
    model: params.model,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    contextLength: params.contextLength,
    onEvent: params.onEvent,
    signal: params.signal,
    messages: fullTranscript,
    reason: "budget",
  });
}

export interface GenerateStructuredReportParams {
  caseId?: string;
  client: LMStudioClient;
  model: string;
  messages: OpenAIChatMessage[];
  target: string;
  temperature?: number;
  maxTokens?: number;
  contextLength?: number;
  onEvent?: (event: AosintWorkflowEvent) => void;
  signal?: AbortSignal;
}

export async function generateStructuredOsintReport(
  params: GenerateStructuredReportParams
): Promise<OsintReport> {
  throwIfAborted(params.signal);
  console.log("[aosint:report] start", {
    model: params.model,
    target: params.target,
    messageCount: params.messages.length,
  });

  const model = await resolveLlmModel(params.client, params.model, {
    contextLength: params.contextLength,
    onLoadProgress: (event) => {
      if (!params.caseId) return;
      params.onEvent?.({
        type: "model_loading",
        caseId: params.caseId,
        ...event,
      });
    },
  });
  throwIfAborted(params.signal);

  try {
    const structuredReportSchema = osintReportSchema as unknown as {
      parse: (input: unknown) => OsintReport;
    };
    const reportResult = await model.respond<OsintReport>(
      toSdkChat([
        ...params.messages,
        {
          role: "user",
          content: buildStructuredReportPrompt(params.target),
        },
      ]),
      {
        temperature: params.temperature ?? 0.1,
        maxTokens: params.maxTokens,
        structured: structuredReportSchema,
      }
    );
    throwIfAborted(params.signal);

    const report = normalizeOsintReport(reportResult.parsed);
    console.log("[aosint:report] success", {
      target: params.target,
      summaryPreview: report.summary.slice(0, 200),
      domains: report.domains.length,
      entities: report.entities.length,
    });
    return report;
  } catch (error) {
    console.warn("[aosint:report] structured-fallback", {
      target: params.target,
      error: error instanceof Error ? error.message : String(error),
    });

    const response = await model.respond(
      toSdkChat([
        ...params.messages,
        {
          role: "user",
          content: [
            buildStructuredReportPrompt(params.target),
            "",
            "Return a single JSON object with the keys:",
            "summary, entities, contacts, domains, evidence, unknowns.",
          ].join("\n"),
        },
      ]),
      {
        temperature: params.temperature ?? 0.1,
        maxTokens: params.maxTokens,
      }
    );
    throwIfAborted(params.signal);

    const content = response.content.trim();
    if (!content) {
      console.warn("[aosint:report] empty-response", {
        target: params.target,
      });
      return normalizeOsintReport({
        summary: "",
      });
    }

    try {
      const report = normalizeOsintReport(
        JSON.parse(content) as Partial<OsintReport>
      );
      console.log("[aosint:report] parse-fallback:success", {
        target: params.target,
        summaryPreview: report.summary.slice(0, 200),
      });
      return report;
    } catch {
      console.warn("[aosint:report] parse-fallback:failed", {
        target: params.target,
        contentPreview: content.slice(0, 240),
      });
      return normalizeOsintReport({
        summary: content,
      });
    }
  }
}

export function buildInitialOsintMessages(
  userPrompt: string,
  systemPrompt?: string
): OpenAIChatMessage[] {
  return [
    {
      role: "system",
      content: buildOsintSystemPrompt(systemPrompt),
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];
}

export function createDefaultOsintClient(config: LMStudioOpenAIClientConfig) {
  return createLMStudioClient({
    baseUrl: config.baseUrl,
  });
}
