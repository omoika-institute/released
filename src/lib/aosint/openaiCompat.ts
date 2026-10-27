import type {
  LMStudioChatCompletionRequest,
  LMStudioChatCompletionResponse,
  LMStudioOpenAIClientConfig,
} from "./agentTypes";

const DEFAULT_BASE_URL = "http://localhost:1234/v1";
const DEFAULT_API_KEY = "lm-studio";
const DEFAULT_CHAT_COMPLETION_TIMEOUT_MS = 90000;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("AOSINT workflow was canceled.");
  }
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
}

function getRetryDelayMs(params: {
  attempt: number;
  retryAfter: string | null;
  baseDelayMs: number;
}) {
  const retryAfterMs = parseRetryAfterMs(params.retryAfter);
  if (retryAfterMs !== null) {
    return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
  }

  const backoffMs = params.baseDelayMs * 2 ** params.attempt;
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(backoffMs + jitterMs, MAX_RETRY_DELAY_MS);
}

export class LMStudioOpenAIClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;
  private readonly label: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: LMStudioOpenAIClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey ?? DEFAULT_API_KEY;
    this.headers = config.headers ?? {};
    this.label = config.label ?? "OpenAI-compatible";
    this.maxRetries = Math.max(0, config.maxRetries ?? 0);
    this.retryBaseDelayMs = Math.max(
      0,
      config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
    );
  }

  async createChatCompletion(
    request: LMStudioChatCompletionRequest
  ): Promise<LMStudioChatCompletionResponse> {
    const startedAt = Date.now();
    const { signal, ...wireRequest } = request;

    console.log("[aosint:openai-compat] request:start", {
      label: this.label,
      model: request.model,
      messageCount: request.messages.length,
      toolCount: request.tools?.length ?? 0,
      hasResponseFormat: Boolean(request.response_format),
      baseUrl: this.baseUrl,
      maxRetries: this.maxRetries,
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      throwIfAborted(signal);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort(
          new Error(
            `${this.label} chat completion timed out after ${DEFAULT_CHAT_COMPLETION_TIMEOUT_MS}ms.`
          )
        );
      }, DEFAULT_CHAT_COMPLETION_TIMEOUT_MS);
      const abortFromRequest = () => {
        controller.abort(signal?.reason);
      };
      signal?.addEventListener("abort", abortFromRequest, { once: true });

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
            ...this.headers,
          },
          body: JSON.stringify(wireRequest),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromRequest);
        console.error("[aosint:openai-compat] request:error", {
          label: this.label,
          durationMs: Date.now() - startedAt,
          model: request.model,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromRequest);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const retryable =
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < this.maxRetries;

        console.error("[aosint:openai-compat] request:failed", {
          label: this.label,
          durationMs: Date.now() - startedAt,
          status: response.status,
          statusText: response.statusText,
          attempt,
          retryable,
          body,
        });

        if (retryable) {
          const delayMs = getRetryDelayMs({
            attempt,
            retryAfter: response.headers.get("retry-after"),
            baseDelayMs: this.retryBaseDelayMs,
          });

          console.warn("[aosint:openai-compat] request:retry", {
            label: this.label,
            model: request.model,
            attempt,
            nextAttempt: attempt + 1,
            delayMs,
            status: response.status,
          });

          await sleep(delayMs);
          continue;
        }

        throw new Error(
          `${this.label} request failed with ${response.status}: ${body || response.statusText}`
        );
      }

      const parsed = (await response.json()) as LMStudioChatCompletionResponse;
      console.log("[aosint:openai-compat] request:success", {
        label: this.label,
        durationMs: Date.now() - startedAt,
        attempt,
        choices: parsed.choices.length,
        finishReason: parsed.choices[0]?.finish_reason ?? null,
        hasToolCalls: Boolean(parsed.choices[0]?.message?.tool_calls?.length),
      });

      return parsed;
    }

    throw new Error(`${this.label} request failed after retries.`);
  }
}
