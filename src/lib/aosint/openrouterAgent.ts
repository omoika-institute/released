import { z } from "zod";
import {
  getOsintToolParameterShape,
  osintAgentTools,
  osintToolArgumentSchemas,
  osintToolDescriptions,
  runtimeAgentTools,
  runtimeToolArgumentSchemas,
  type OsintToolName,
  type RuntimeToolName,
} from "./agentTools";
import {
  buildOsintSystemPrompt,
  buildStructuredReportPrompt,
  normalizeOsintReport,
} from "./agentPrompts";
import { sanitizeAssistantMessageContent } from "./messageContent";
import { sanitizeToolResultForModel } from "./workflowPayloads";
import type {
  AosintWorkflowEvent,
  LMStudioOpenAIClientConfig,
  OpenAIChatMessage,
  OpenAIToolCall,
  OpenAIToolDefinition,
  OsintReport,
} from "./agentTypes";
import { LMStudioOpenAIClient } from "./openaiCompat";
import type { UserToolDefinition, UserToolParameters } from "../userTools";

export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

const DEFAULT_OPENAI_COMPAT_MAX_TURNS = 8;

const openAiCompatReportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "entities",
    "contacts",
    "domains",
    "evidence",
    "unknowns",
  ],
  properties: {
    summary: { type: "string" },
    entities: { type: "array", items: { type: "string" } },
    contacts: { type: "array", items: { type: "string" } },
    domains: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
  },
} as const;

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

function serializeToolResult(result: unknown) {
  const sanitized = sanitizeToolResultForModel(result);
  if (typeof sanitized === "string") return sanitized;
  return JSON.stringify(sanitized, null, 2);
}

function buildForcedFinalAnswerPrompt(reason: "budget" | "tool_only") {
  if (reason === "tool_only") {
    return [
      "Stop calling tools.",
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("AOSINT workflow was canceled.");
  }
}

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

function getMessageSignature(message: OpenAIChatMessage) {
  return stableStringify({
    role: message.role,
    name: message.name,
    tool_call_id: message.tool_call_id,
    content: message.content,
    tool_calls: message.tool_calls,
  });
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

function userParamsToToolDefinition(
  userTool: UserToolDefinition
): OpenAIToolDefinition {
  return {
    type: "function",
    function: {
      name: userTool.name,
      description: userTool.description,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          Object.entries(userTool.parameters.properties).map(([key, def]) => [
            key,
            {
              type: def.type,
              ...(def.description ? { description: def.description } : {}),
            },
          ])
        ),
        required: userTool.parameters.required ?? [],
      },
    },
  };
}

function buildToolDefinitions(
  enabledBuiltinNames?: string[],
  enabledRuntimeTools?: RuntimeToolName[],
  userTools?: UserToolDefinition[]
) {
  const enabled = enabledBuiltinNames
    ? new Set(enabledBuiltinNames)
    : new Set(Object.keys(osintToolDescriptions));

  const builtinTools = osintAgentTools.filter((tool) =>
    enabled.has(tool.function.name)
  );
  const runtimeTools = (enabledRuntimeTools ?? []).map(
    (name) => runtimeAgentTools[name]
  );
  const dynamicTools = (userTools ?? [])
    .filter((tool) => tool.enabled)
    .map(userParamsToToolDefinition);

  return [...builtinTools, ...runtimeTools, ...dynamicTools];
}

function userParamsToZodSchema(parameters: UserToolParameters) {
  const required = new Set(parameters.required ?? []);

  return z.object(
    Object.fromEntries(
      Object.entries(parameters.properties).map(([key, def]) => {
        let base: z.ZodTypeAny;
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

        if (def.description) {
          base = base.describe(def.description);
        }

        return [key, required.has(key) ? base : base.optional()];
      })
    )
  );
}

async function executeValidatedTool(
  name: string,
  args: unknown,
  executeTool: (name: string, args: unknown) => Promise<unknown>,
  enabledRuntimeTools?: RuntimeToolName[],
  userTools?: UserToolDefinition[]
) {
  const builtinSchema = (osintToolArgumentSchemas as Partial<
    Record<OsintToolName, z.ZodTypeAny>
  >)[name as OsintToolName];

  if (builtinSchema) {
    const parsed = builtinSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return executeTool(name, parsed.data);
  }

  const runtimeSchema =
    enabledRuntimeTools?.includes(name as RuntimeToolName) &&
    (runtimeToolArgumentSchemas as Partial<Record<RuntimeToolName, z.ZodTypeAny>>)[
      name as RuntimeToolName
    ];

  if (runtimeSchema) {
    const parsed = runtimeSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return executeTool(name, parsed.data);
  }

  const userTool = userTools?.find((tool) => tool.enabled && tool.name === name);
  if (userTool) {
    const parsed = userParamsToZodSchema(userTool.parameters).safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
    }
    return executeTool(name, parsed.data);
  }

  return executeTool(name, args);
}

async function requestFinalAnswer(params: {
  client: LMStudioOpenAIClient;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reason: "budget" | "tool_only";
  signal?: AbortSignal;
}): Promise<{ finalAnswer: string; messages: OpenAIChatMessage[] }> {
  throwIfAborted(params.signal);
  const forcedPrompt: OpenAIChatMessage = {
    role: "user",
    content: buildForcedFinalAnswerPrompt(params.reason),
  };

  const response = await params.client.createChatCompletion({
    model: params.model,
    messages: [...params.messages, forcedPrompt],
    tool_choice: "none",
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens,
    signal: params.signal,
  });

  const finalAnswer = sanitizeAssistantMessageContent(
    response.choices[0]?.message?.content ?? ""
  );
  const finalMessage: OpenAIChatMessage = {
    role: "assistant",
    content: finalAnswer,
  };

  return {
    finalAnswer,
    messages: [...params.messages, forcedPrompt, finalMessage],
  };
}

export interface RunOpenAiCompatOsintAgentLoopParams {
  caseId: string;
  client: LMStudioOpenAIClient;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTurns?: number;
  maxTokens?: number;
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  enabledBuiltinNames?: string[];
  enabledRuntimeTools?: RuntimeToolName[];
  nearEndUserPrompt?: string;
  userTools?: UserToolDefinition[];
  onEvent?: (event: AosintWorkflowEvent) => void;
  signal?: AbortSignal;
}

export async function runOpenAiCompatOsintAgentLoop(
  params: RunOpenAiCompatOsintAgentLoopParams
): Promise<{ finalAnswer: string; messages: OpenAIChatMessage[] }> {
  const maxTurns = params.maxTurns ?? DEFAULT_OPENAI_COMPAT_MAX_TURNS;
  const tools = buildToolDefinitions(
    params.enabledBuiltinNames,
    params.enabledRuntimeTools,
    params.userTools
  );
  const messages: OpenAIChatMessage[] = [...params.messages];
  let nearEndPromptInjected = false;
  const emittedHistoryMessageKeys = new Set<string>();

  const emitUniqueHistoryMessages = (round: number) => {
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

  console.log("[aosint:openai-agent] start", {
    model: params.model,
    maxTurns,
    messageCount: messages.length,
    toolCount: tools.length,
  });

  params.onEvent?.({
    type: "agent_start",
    caseId: params.caseId,
    maxTurns,
    messageCount: messages.length,
    model: params.model,
  });

  for (let round = 1; round <= maxTurns; round += 1) {
    throwIfAborted(params.signal);
    if (
      params.nearEndUserPrompt?.trim() &&
      !nearEndPromptInjected &&
      round === maxTurns
    ) {
      messages.push({
        role: "user",
        content: params.nearEndUserPrompt.trim(),
      });
      nearEndPromptInjected = true;
    }

    params.onEvent?.({
      type: "round_start",
      caseId: params.caseId,
      round,
      maxTurns,
      messageCount: messages.length,
    });

    emitUniqueHistoryMessages(round);

    const response = await params.client.createChatCompletion({
      model: params.model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : "none",
      temperature: params.temperature ?? 0.2,
      max_tokens: params.maxTokens,
      parallel_tool_calls: false,
      signal: params.signal,
    });
    throwIfAborted(params.signal);

    const assistantResponse = response.choices[0]?.message;
    if (!assistantResponse) {
      throw new Error("The model returned no assistant message.");
    }

    const content = sanitizeAssistantMessageContent(assistantResponse.content ?? "");
    const toolCalls =
      assistantResponse.tool_calls?.map((call, index) => ({
        id: call.id || `tool-${round}-${index}`,
        type: "function" as const,
        function: {
          name: call.function.name,
          arguments: call.function.arguments ?? "{}",
        },
      })) ?? [];

    const assistantMessage: OpenAIChatMessage = {
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    };

    messages.push(assistantMessage);

    if (content) {
      params.onEvent?.({
        type: "assistant_message",
        caseId: params.caseId,
        round,
        hasToolCalls: toolCalls.length > 0,
        content,
      });
    }

    if (!toolCalls.length) {
      params.onEvent?.({
        type: "round_end",
        caseId: params.caseId,
        round,
        messageCount: messages.length,
      });

      return {
        finalAnswer: content,
        messages,
      };
    }

    for (const call of toolCalls) {
      throwIfAborted(params.signal);
      const parsedArgs = parseJsonArgs(call.function.arguments);
      const startedAt = Date.now();

      params.onEvent?.({
        type: "tool_call",
        caseId: params.caseId,
        toolCallId: call.id,
        toolName: call.function.name,
        args: parsedArgs,
      });

      try {
        const rawResult = await executeValidatedTool(
          call.function.name,
          parsedArgs,
          params.executeTool,
          params.enabledRuntimeTools,
          params.userTools
        );
        throwIfAborted(params.signal);
        const result = sanitizeToolResultForModel(rawResult);
        const durationMs = Date.now() - startedAt;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: serializeToolResult(result),
        });
        params.onEvent?.({
          type: "tool_result",
          caseId: params.caseId,
          toolCallId: call.id,
          toolName: call.function.name,
          ok: true,
          durationMs,
          result,
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const message =
          error instanceof Error ? error.message : "Tool execution failed.";
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: serializeToolResult({ ok: false, error: message }),
        });
        params.onEvent?.({
          type: "tool_result",
          caseId: params.caseId,
          toolCallId: call.id,
          toolName: call.function.name,
          ok: false,
          durationMs,
          error: message,
        });
      }
    }

    params.onEvent?.({
      type: "round_end",
      caseId: params.caseId,
      round,
      messageCount: messages.length,
    });
  }

  const final = await requestFinalAnswer({
    client: params.client,
    model: params.model,
    messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    reason: findFinalAnswer(messages) ? "tool_only" : "budget",
    signal: params.signal,
  });

  return final;
}

export interface GenerateOpenAiCompatStructuredReportParams {
  client: LMStudioOpenAIClient;
  model: string;
  messages: OpenAIChatMessage[];
  target: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function generateOpenAiCompatStructuredOsintReport(
  params: GenerateOpenAiCompatStructuredReportParams
): Promise<OsintReport> {
  throwIfAborted(params.signal);
  const reportMessages: OpenAIChatMessage[] = [
    ...params.messages,
    {
      role: "user",
      content: buildStructuredReportPrompt(params.target),
    },
  ];

  try {
    const structuredResponse = await params.client.createChatCompletion({
      model: params.model,
      messages: reportMessages,
      tool_choice: "none",
      temperature: params.temperature ?? 0.1,
      max_tokens: params.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "osint_report",
          schema: openAiCompatReportSchema,
        },
      },
      signal: params.signal,
    });
    throwIfAborted(params.signal);

    const content = structuredResponse.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return normalizeOsintReport({ summary: "" });
    }

    return normalizeOsintReport(JSON.parse(content) as Partial<OsintReport>);
  } catch (error) {
    console.warn("[aosint:openai-agent] report:structured-fallback", {
      target: params.target,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const fallbackResponse = await params.client.createChatCompletion({
    model: params.model,
    messages: [
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
    ],
    tool_choice: "none",
    temperature: params.temperature ?? 0.1,
    max_tokens: params.maxTokens,
    signal: params.signal,
  });
  throwIfAborted(params.signal);

  const content = fallbackResponse.choices[0]?.message?.content?.trim() ?? "";
  if (!content) {
    return normalizeOsintReport({ summary: "" });
  }

  try {
    return normalizeOsintReport(JSON.parse(content) as Partial<OsintReport>);
  } catch {
    return normalizeOsintReport({ summary: content });
  }
}

export function createOpenRouterClient(config: LMStudioOpenAIClientConfig) {
  return new LMStudioOpenAIClient({
    baseUrl: config.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL,
    apiKey: config.apiKey,
    headers: config.headers,
    label: config.label ?? "OpenRouter",
    maxRetries: config.maxRetries ?? 3,
    retryBaseDelayMs: config.retryBaseDelayMs ?? 2000,
  });
}

export function buildInitialOpenAiCompatMessages(
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

export function getBuiltinToolParameterSchema(name: OsintToolName) {
  return getOsintToolParameterShape(name);
}
