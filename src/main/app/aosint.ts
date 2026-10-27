import { randomUUID } from "node:crypto";
import {
  buildInitialOpenAiCompatMessages,
  createOpenRouterClient,
  DEFAULT_OPENROUTER_MODEL,
  generateOpenAiCompatStructuredOsintReport,
  runOpenAiCompatOsintAgentLoop,
} from "../../lib/aosint/openrouterAgent";
import { DEFAULT_LM_STUDIO_MODEL } from "../../lib/aosint/lmstudio";
import {
  buildInitialOsintMessages,
  createDefaultOsintClient,
  generateStructuredOsintReport,
  runOsintAgentLoop,
} from "../../lib/aosint/osintAgent";
import { createOsintToolExecutor, InMemoryCaseMemoryStore } from "../../lib/aosint/toolExecutor";
import type { RuntimeToolName } from "../../lib/aosint/agentTools";
import { resolveOsintWorkflow } from "../../lib/aosint/workflows";
import type {
  AgentProvider,
  AosintWorkflowEvent,
  BrowserCommand,
  BrowserResult,
  RunOsintWorkflowPayload,
  RunOsintWorkflowResult,
} from "../../lib/aosint/agentTypes";
import type { UserToolDefinition } from "../../lib/userTools";
import { executeBrowserCommand } from "../browserController";

const caseMemoryStore = new InMemoryCaseMemoryStore();
const RUNTIME_TOOL_NAMES = new Set<RuntimeToolName>([
  "search_entity_types",
  "add_unverified_entity_to_graph",
  "ENTITY_RESOLUTION_FINISHED",
]);

function normalizeRuntimeTools(value?: string[]): RuntimeToolName[] | undefined {
  const tools = (value ?? []).filter((name): name is RuntimeToolName =>
    RUNTIME_TOOL_NAMES.has(name as RuntimeToolName)
  );
  return tools.length ? tools : undefined;
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/␛\[[0-9;]*m/g, "");
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: typeof error,
    message: String(error),
    stack: null,
  };
}

function isModelCrashError(error: unknown) {
  const message = stripAnsi(
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  return (
    message.includes("model has crashed") ||
    message.includes("crashed without additional information") ||
    message.includes("exit code: null")
  );
}

function hasCustomRuntimeOverrides(payload: RunOsintWorkflowPayload) {
  return (
    typeof payload.contextLength === "number" ||
    typeof payload.maxTokens === "number"
  );
}

function normalizeWorkflowError(
  error: unknown,
  context: { provider: AgentProvider; model: string; baseUrl?: string }
) {
  const message = stripAnsi(
    error instanceof Error ? error.message : String(error)
  );
  const normalized = message.toLowerCase();

  if (context.provider === "openrouter") {
    if (
      normalized.includes("401") ||
      normalized.includes("403") ||
      normalized.includes("unauthorized") ||
      normalized.includes("invalid api key")
    ) {
      return new Error(
        "OpenRouter rejected the API key. Update the key in settings and try again."
      );
    }

    if (
      normalized.includes("429") ||
      normalized.includes("rate limit") ||
      normalized.includes("insufficient credits")
    ) {
      if (
        normalized.includes("temporarily rate-limited upstream") ||
        normalized.includes("provider returned error")
      ) {
        return new Error(
          `OpenRouter could not run "${context.model}" because the upstream provider is temporarily rate-limited. Retry shortly, choose another OpenRouter model, or add your own provider key in OpenRouter integrations.`
        );
      }

      return new Error(
        `OpenRouter could not run "${context.model}" because the request was rate-limited or the account has insufficient credits. Retry shortly or check the OpenRouter account settings.`
      );
    }

    if (
      normalized.includes("model not found") ||
      normalized.includes("unknown model") ||
      normalized.includes("no endpoints found")
    ) {
      return new Error(
        `OpenRouter could not find "${context.model}". Update the model in settings and try again.`
      );
    }

    if (
      normalized.includes("fetch failed") ||
      normalized.includes("failed to fetch") ||
      normalized.includes("econnrefused") ||
      normalized.includes("could not connect") ||
      normalized.includes("unable to connect")
    ) {
      return new Error(
        "OpenRouter is not reachable. Check your network connection and try again."
      );
    }

    return error instanceof Error ? error : new Error(message);
  }

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("could not connect") ||
    normalized.includes("unable to connect")
  ) {
    const endpoint = context.baseUrl?.trim()
      ? ` at ${context.baseUrl.trim()}`
      : "";
    return new Error(
      `LM Studio is not reachable${endpoint}. Open LM Studio, load the "${context.model}" model, and try again.`
    );
  }

  if (
    normalized.includes("failed to load model") ||
    normalized.includes("model not found") ||
    normalized.includes("error loading model")
  ) {
    const detail = stripAnsi(
      error instanceof Error ? error.message : String(error)
    ).trim();
    return new Error(
      detail
        ? `LM Studio could not load "${context.model}". ${detail}`
        : `LM Studio could not load "${context.model}".`
    );
  }

  if (normalized.includes("model has crashed")) {
    const parts = [
      `LM Studio crashed while running "${context.model}".`,
      'Retry with a smaller model or clear custom "Context length" / "Max tokens" settings and try again.',
    ];
    if (context.baseUrl?.trim()) {
      parts.push(`LM Studio endpoint: ${context.baseUrl.trim()}.`);
    }
    return new Error(parts.join(" "));
  }

  return error instanceof Error ? error : new Error(message);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("AOSINT workflow was canceled.");
  }
}

async function runLmStudioWorkflowAttempt(
  params: {
    caseId: string;
    client: ReturnType<typeof createDefaultOsintClient>;
    workflow: ReturnType<typeof resolveOsintWorkflow>;
    payload: RunOsintWorkflowPayload;
    model: string;
    executeTool: ReturnType<typeof createOsintToolExecutor>;
  },
  deps: RunOsintWorkflowDeps
) {
  throwIfAborted(deps.abortSignal);
  const messages = buildInitialOsintMessages(
    params.workflow.buildUserPrompt(params.payload),
    params.payload.systemPrompt
  );

  const loopResult = await runOsintAgentLoop({
    caseId: params.caseId,
    client: params.client,
    model: params.model,
    messages,
    temperature: params.payload.temperature,
    maxTurns: params.payload.maxTurns,
    maxTokens: params.payload.maxTokens,
    contextLength: params.payload.contextLength,
    executeTool: params.executeTool,
    enabledBuiltinNames: deps.enabledBuiltinNames,
    enabledRuntimeTools: normalizeRuntimeTools(params.payload.enabledRuntimeTools),
    nearEndUserPrompt: params.payload.nearEndUserPrompt,
    userTools: deps.userTools,
    onEvent: deps.onProgressEvent,
    signal: deps.abortSignal,
  });
  throwIfAborted(deps.abortSignal);

  const report =
    params.payload.generateReport === false
      ? null
      : await generateStructuredOsintReport({
          caseId: params.caseId,
          client: params.client,
          model: params.model,
          messages: loopResult.messages,
          target: params.payload.target,
          temperature: params.payload.temperature,
          maxTokens: params.payload.maxTokens,
          contextLength: params.payload.contextLength,
          onEvent: deps.onProgressEvent,
          signal: deps.abortSignal,
        });

  return {
    workflow: params.workflow.name,
    target: params.payload.target,
    finalAnswer: loopResult.finalAnswer,
    report,
    caseContext: caseMemoryStore.getContext(params.caseId),
    messages:
      params.payload.includeMessages === false ? [] : loopResult.messages,
  } satisfies RunOsintWorkflowResult;
}

async function runOpenRouterWorkflowAttempt(
  params: {
    caseId: string;
    client: ReturnType<typeof createOpenRouterClient>;
    workflow: ReturnType<typeof resolveOsintWorkflow>;
    payload: RunOsintWorkflowPayload;
    model: string;
    executeTool: ReturnType<typeof createOsintToolExecutor>;
  },
  deps: RunOsintWorkflowDeps
) {
  throwIfAborted(deps.abortSignal);
  const messages = buildInitialOpenAiCompatMessages(
    params.workflow.buildUserPrompt(params.payload),
    params.payload.systemPrompt
  );

  const loopResult = await runOpenAiCompatOsintAgentLoop({
    caseId: params.caseId,
    client: params.client,
    model: params.model,
    messages,
    temperature: params.payload.temperature,
    maxTurns: params.payload.maxTurns,
    maxTokens: params.payload.maxTokens,
    executeTool: params.executeTool,
    enabledBuiltinNames: deps.enabledBuiltinNames,
    enabledRuntimeTools: normalizeRuntimeTools(params.payload.enabledRuntimeTools),
    nearEndUserPrompt: params.payload.nearEndUserPrompt,
    userTools: deps.userTools,
    onEvent: deps.onProgressEvent,
    signal: deps.abortSignal,
  });
  throwIfAborted(deps.abortSignal);

  const report =
    params.payload.generateReport === false
      ? null
      : await generateOpenAiCompatStructuredOsintReport({
          client: params.client,
          model: params.model,
          messages: loopResult.messages,
          target: params.payload.target,
          temperature: params.payload.temperature,
          maxTokens: params.payload.maxTokens,
          signal: deps.abortSignal,
        });

  return {
    workflow: params.workflow.name,
    target: params.payload.target,
    finalAnswer: loopResult.finalAnswer,
    report,
    caseContext: caseMemoryStore.getContext(params.caseId),
    messages:
      params.payload.includeMessages === false ? [] : loopResult.messages,
  } satisfies RunOsintWorkflowResult;
}

export interface RunOsintWorkflowDeps {
  executeVisibleBrowserCommand?: (
    command: BrowserCommand
  ) => Promise<unknown>;
  enabledBuiltinNames?: string[];
  userTools?: UserToolDefinition[];
  onProgressEvent?: (event: AosintWorkflowEvent) => void;
  abortSignal?: AbortSignal;
}

export async function runOsintWorkflow(
  payload: RunOsintWorkflowPayload,
  deps: RunOsintWorkflowDeps = {}
): Promise<RunOsintWorkflowResult> {
  throwIfAborted(deps.abortSignal);
  const startedAt = Date.now();
  const workflow = resolveOsintWorkflow(payload.workflow);
  const caseId = payload.caseId?.trim() || randomUUID();
  const provider = payload.provider ?? "lmstudio";
  const model =
    payload.model?.trim() ||
    (provider === "openrouter"
      ? DEFAULT_OPENROUTER_MODEL
      : DEFAULT_LM_STUDIO_MODEL);

  console.log("[aosint:workflow] start", {
    workflow: workflow.name,
    caseId,
    target: payload.target,
    provider,
    model,
    hasPrompt: Boolean(payload.prompt?.trim()),
    generateReport: payload.generateReport !== false,
    contextLength: payload.contextLength ?? null,
    maxTokens: payload.maxTokens ?? null,
    maxTurns: payload.maxTurns ?? null,
    systemPromptChars: payload.systemPrompt?.length ?? 0,
    promptChars: payload.prompt?.length ?? 0,
    nearEndUserPromptChars: payload.nearEndUserPrompt?.length ?? 0,
    enabledRuntimeToolCount: payload.enabledRuntimeTools?.length ?? 0,
  });

  const executeTool = createOsintToolExecutor({
    caseId,
    caseMemory: caseMemoryStore,
    executeBrowserCommand: async (command): Promise<BrowserResult> => {
      throwIfAborted(deps.abortSignal);
      if (deps.executeVisibleBrowserCommand) {
        const result = (await deps.executeVisibleBrowserCommand(command)) as BrowserResult;
        throwIfAborted(deps.abortSignal);
        return result;
      }

      const result = await executeBrowserCommand(command);
      throwIfAborted(deps.abortSignal);
      return result;
    },
    enabledRuntimeTools: normalizeRuntimeTools(payload.enabledRuntimeTools),
    runtimeToolContext: payload.runtimeToolContext,
    userTools: deps.userTools,
  });

  const lmStudioClient =
    provider === "lmstudio"
      ? createDefaultOsintClient({
          baseUrl: payload.baseUrl,
          apiKey: payload.apiKey,
          model,
        })
      : null;

  try {
    throwIfAborted(deps.abortSignal);
    if (provider === "openrouter" && !payload.apiKey?.trim()) {
      throw new Error(
        "OpenRouter API key is not configured. Add it in settings and try again."
      );
    }

    const result =
      provider === "openrouter"
        ? await runOpenRouterWorkflowAttempt(
            {
              caseId,
              client: createOpenRouterClient({
                apiKey: payload.apiKey?.trim(),
                label: "OpenRouter",
              }),
              workflow,
              payload,
              model,
              executeTool,
            },
            deps
          )
        : await runLmStudioWorkflowAttempt(
            {
              caseId,
              client: lmStudioClient!,
              workflow,
              payload,
              model,
              executeTool,
            },
            deps
          );

    if (provider === "lmstudio" && hasCustomRuntimeOverrides(payload)) {
      console.log("[aosint:workflow] runtime-overrides", {
        caseId,
        contextLength: payload.contextLength ?? null,
        maxTokens: payload.maxTokens ?? null,
      });
    }

    console.log("[aosint:workflow] success", {
      workflow: workflow.name,
      caseId,
      durationMs: Date.now() - startedAt,
      finalAnswerPreview: result.finalAnswer.slice(0, 240),
      reportSummaryPreview: result.report?.summary.slice(0, 200) ?? null,
    });

    return result;
  } catch (error) {
    console.error("[aosint:workflow] first-attempt:error", {
      workflow: workflow.name,
      caseId,
      durationMs: Date.now() - startedAt,
      provider,
      model,
      baseUrl: payload.baseUrl ?? null,
      requestedContextLength: payload.contextLength ?? null,
      requestedMaxTokens: payload.maxTokens ?? null,
      requestedMaxTurns: payload.maxTurns ?? null,
      hasCustomRuntimeOverrides: hasCustomRuntimeOverrides(payload),
      isModelCrashError: isModelCrashError(error),
      error: serializeError(error),
    });

    const hasExplicitContextLength =
      typeof payload.contextLength === "number" && payload.contextLength > 0;

    if (
      provider === "lmstudio" &&
      lmStudioClient &&
      hasCustomRuntimeOverrides(payload) &&
      isModelCrashError(error) &&
      !hasExplicitContextLength
    ) {
      console.warn("[aosint:workflow] retry-with-default-runtime", {
        workflow: workflow.name,
        caseId,
        contextLength: payload.contextLength ?? null,
        maxTokens: payload.maxTokens ?? null,
      });

      deps.onProgressEvent?.({
        type: "assistant_message",
        caseId,
        round: 0,
        hasToolCalls: false,
        content:
          "LM Studio crashed with the current runtime limits. Retrying once with default context and token settings.",
      });

      try {
        console.warn("[aosint:workflow] retry-with-default-runtime:start", {
          workflow: workflow.name,
          caseId,
          provider,
          model,
          originalError: serializeError(error),
          retryContextLength: null,
          retryMaxTokens: null,
        });

        const retryResult = await runLmStudioWorkflowAttempt(
          {
            caseId,
            client: lmStudioClient,
            workflow,
            payload: {
              ...payload,
              contextLength: undefined,
              maxTokens: undefined,
            },
            model,
            executeTool,
          },
          deps
        );

        console.log("[aosint:workflow] retry-success", {
          workflow: workflow.name,
          caseId,
          durationMs: Date.now() - startedAt,
          finalAnswerPreview: retryResult.finalAnswer.slice(0, 240),
        });

        return retryResult;
      } catch (retryError) {
        console.error("[aosint:workflow] retry-with-default-runtime:error", {
          workflow: workflow.name,
          caseId,
          provider,
          model,
          originalError: serializeError(error),
          retryError: serializeError(retryError),
        });
        error = retryError;
      }
    }

    if (
      provider === "lmstudio" &&
      hasExplicitContextLength &&
      isModelCrashError(error)
    ) {
      console.warn("[aosint:workflow] skip-default-runtime-retry", {
        workflow: workflow.name,
        caseId,
        contextLength: payload.contextLength,
        maxTokens: payload.maxTokens ?? null,
        reason:
          "Preserving explicit contextLength from settings; not retrying with LM Studio defaults.",
      });
    }

    const normalizedError = normalizeWorkflowError(error, {
      provider,
      model,
      baseUrl: payload.baseUrl,
    });

    console.error("[aosint:workflow] error", {
      workflow: workflow.name,
      caseId,
      durationMs: Date.now() - startedAt,
      error:
        normalizedError instanceof Error
          ? normalizedError.message
          : String(normalizedError),
    });

    throw normalizedError;
  } finally {
    if (lmStudioClient && Symbol.asyncDispose in lmStudioClient) {
      await lmStudioClient[Symbol.asyncDispose]();
    }
  }
}
