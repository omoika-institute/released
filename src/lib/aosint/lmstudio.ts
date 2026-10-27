import { LMStudioClient } from "@lmstudio/sdk";
import type { LLM } from "@lmstudio/sdk";
import type { LMStudioRuntimeConfig } from "./types";

export const DEFAULT_LM_STUDIO_MODEL = "qwen/qwen3.5-27b";
export const DEFAULT_LM_STUDIO_TEMPERATURE = 0.7;
export const DEFAULT_LM_STUDIO_MAX_TURNS = 7;

const modelAliases: Record<string, string> = {
  "qwen3.5-27b": DEFAULT_LM_STUDIO_MODEL,
  "qwen/qwen3.5-27b": DEFAULT_LM_STUDIO_MODEL,
};

function getModelCandidates(modelKey?: string) {
  const trimmed = modelKey?.trim();
  const candidates = [
    trimmed ? modelAliases[trimmed] ?? trimmed : DEFAULT_LM_STUDIO_MODEL,
  ];

  if (trimmed && trimmed in modelAliases) {
    candidates.push(trimmed);
  }

  return [...new Set(candidates.filter(Boolean))];
}

export function createLMStudioClient(
  config: LMStudioRuntimeConfig = {}
): LMStudioClient {
  return new LMStudioClient({
    baseUrl: config.baseUrl,
    clientIdentifier: config.clientIdentifier,
    clientPasskey: config.clientPasskey,
    verboseErrorMessages: config.verboseErrorMessages,
  });
}

export async function resolveLlmModel(
  client: LMStudioClient,
  modelKey?: string,
  opts?: {
    contextLength?: number;
    onLoadProgress?: (event: {
      model: string;
      phase: "started" | "progress" | "loaded" | "failed";
      progress?: number;
      message?: string;
    }) => void;
  }
): Promise<LLM> {
  const candidates = getModelCandidates(modelKey);
  let lastError: unknown;
  const requestedContextLength =
    typeof opts?.contextLength === "number" ? opts.contextLength : undefined;

  for (const candidate of candidates) {
    try {
      console.log("[aosint:lmstudio] resolve-model:start", {
        candidate,
        requestedContextLength: requestedContextLength ?? null,
      });
      opts?.onLoadProgress?.({
        model: candidate,
        phase: "started",
        progress: 0,
        message: "Preparing LM Studio model",
      });

      let model = await client.llm.model(candidate, {
        config:
          requestedContextLength !== undefined
            ? { contextLength: requestedContextLength }
            : undefined,
        onProgress: (progress) =>
          opts?.onLoadProgress?.({
            model: candidate,
            phase: "progress",
            progress,
            message: "Loading LM Studio model",
          }),
      });
      let modelInfo = await model.getModelInfo();

      console.log("[aosint:lmstudio] resolve-model:success", {
        candidate,
        identifier: model.identifier,
        resolvedModelKey: model.modelKey,
        requestedContextLength: requestedContextLength ?? null,
        loadedContextLength: modelInfo.contextLength,
      });

      if (
        requestedContextLength !== undefined &&
        modelInfo.contextLength < requestedContextLength
      ) {
        console.warn("[aosint:lmstudio] resolve-model:reload-required", {
          candidate,
          identifier: model.identifier,
          resolvedModelKey: model.modelKey,
          requestedContextLength,
          loadedContextLength: modelInfo.contextLength,
        });

        model = await client.llm.load(model.modelKey, {
          config: {
            contextLength: requestedContextLength,
          },
          onProgress: (progress) =>
            opts?.onLoadProgress?.({
              model: model.modelKey,
              phase: "progress",
              progress,
              message: "Reloading LM Studio model with requested context",
            }),
        });
        modelInfo = await model.getModelInfo();

        console.log("[aosint:lmstudio] resolve-model:reload-success", {
          candidate,
          identifier: model.identifier,
          resolvedModelKey: model.modelKey,
          requestedContextLength,
          loadedContextLength: modelInfo.contextLength,
        });

        if (modelInfo.contextLength < requestedContextLength) {
          throw new Error(
            `LM Studio loaded "${model.modelKey}" with context length ${modelInfo.contextLength}, below the requested ${requestedContextLength}.`
          );
        }
      }

      opts?.onLoadProgress?.({
        model: model.modelKey || candidate,
        phase: "loaded",
        progress: 1,
        message: "LM Studio model ready",
      });
      return model;
    } catch (error) {
      console.warn("[aosint:lmstudio] resolve-model:error", {
        candidate,
        requestedContextLength: requestedContextLength ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      opts?.onLoadProgress?.({
        model: candidate,
        phase: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(
      `Failed to load model "${candidates[0]}". ${lastError.message}`
    );
  }

  throw new Error(`Failed to load model "${candidates[0]}".`);
}
