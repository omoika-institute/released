import { Icon } from "@/components/icons";
import OverlayModal from "@/components/modals/OverlayModal";
import type { AgentProvider } from "@/lib/aosint/agentTypes";
import { DEFAULT_OPENROUTER_MODEL } from "@/lib/aosint/openrouterAgent";

export function AgentLmStudioSettingsModal({
  availableModels,
  baseUrl,
  closeModal,
  contextLength,
  error,
  isLoadingModels,
  isOpen,
  isSaving,
  maxTokens,
  maxTurns,
  model,
  openRouterApiKey,
  openRouterModel,
  onSave,
  provider,
  setBaseUrl,
  setContextLength,
  setMaxTokens,
  setMaxTurns,
  setModel,
  setOpenRouterApiKey,
  setOpenRouterModel,
  setProvider,
  setTemperature,
  temperature,
  cancelRef,
}: {
  availableModels: { modelKey: string; displayName: string }[];
  baseUrl: string;
  closeModal: () => void;
  contextLength: string;
  error: string | null;
  isLoadingModels: boolean;
  isOpen: boolean;
  isSaving: boolean;
  maxTokens: string;
  maxTurns: string;
  model: string;
  openRouterApiKey: string;
  openRouterModel: string;
  onSave: () => void;
  provider: AgentProvider;
  setBaseUrl: (value: string) => void;
  setContextLength: (value: string) => void;
  setMaxTokens: (value: string) => void;
  setMaxTurns: (value: string) => void;
  setModel: (value: string) => void;
  setOpenRouterApiKey: (value: string) => void;
  setOpenRouterModel: (value: string) => void;
  setProvider: (value: AgentProvider) => void;
  setTemperature: (value: string) => void;
  temperature: string;
  cancelRef: { current: HTMLDivElement | null };
}) {
  return (
    <OverlayModal isOpen={isOpen} closeModal={closeModal} cancelRef={cancelRef}>
      <div className="border border-ink/12 bg-[linear-gradient(180deg,rgba(8,12,22,0.98),rgba(5,8,16,0.96))] p-5 text-ink shadow-[0_24px_90px_rgba(0,0,0,0.58)]">
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-sea">
              Runtime
            </p>
            <h2 className="mt-2 font-display text-xl text-ink">
              Agent runtime settings
            </h2>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-ink-hard/68">
              Choose the provider and tune how the browser agent connects to
              it. LM Studio runtime limits apply only to the local provider.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="shrink-0 rounded-full border border-ink/10 p-2 text-ink-hard/60 transition-colors duration-150 hover:border-ink/20 hover:text-paper"
            aria-label="Close runtime settings"
          >
            <Icon icon="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              for="agent-provider"
              className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
            >
              Provider
            </label>
            <select
              id="agent-provider"
              value={provider}
              onChange={(event) =>
                setProvider(event.currentTarget.value as AgentProvider)
              }
              className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 focus:border-sea/35"
            >
              <option value="lmstudio">LM Studio</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

          {provider === "lmstudio" ? (
            <>
              <div className="sm:col-span-2">
                <label
                  for="agent-lmstudio-base-url"
                  className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
                >
                  Base URL
                </label>
                <input
                  id="agent-lmstudio-base-url"
                  type="text"
                  value={baseUrl}
                  onInput={(event) => setBaseUrl(event.currentTarget.value)}
                  placeholder="Leave blank to let LM Studio autodetect the local server"
                  className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
                />
                <p className="mt-2 text-xs leading-5 text-ink-hard/48">
                  For custom endpoints, use a `ws://` or `wss://` URL.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label
                  for="agent-lmstudio-model"
                  className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
                >
                  Model
                </label>
                {isLoadingModels ? (
                  <div className="mt-3 flex h-[46px] items-center border border-ink/10 bg-black/24 px-4 text-sm text-ink-hard/48">
                    Loading models…
                  </div>
                ) : availableModels.length > 0 ? (
                  <select
                    id="agent-lmstudio-model"
                    value={model}
                    onChange={(event) => setModel(event.currentTarget.value)}
                    className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 focus:border-sea/35"
                  >
                    {availableModels.map((m) => (
                      <option key={m.modelKey} value={m.modelKey}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="agent-lmstudio-model"
                    type="text"
                    value={model}
                    onInput={(event) => setModel(event.currentTarget.value)}
                    placeholder="No models found — enter model key manually"
                    className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <label
                  for="agent-openrouter-api-key"
                  className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
                >
                  API key
                </label>
                <input
                  id="agent-openrouter-api-key"
                  type="password"
                  value={openRouterApiKey}
                  onInput={(event) =>
                    setOpenRouterApiKey(event.currentTarget.value)
                  }
                  placeholder="sk-or-v1-..."
                  className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
                />
                <p className="mt-2 text-xs leading-5 text-ink-hard/48">
                  Stored locally in the app settings and used only for
                  OpenRouter requests.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label
                  for="agent-openrouter-model"
                  className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
                >
                  Model
                </label>
                <input
                  id="agent-openrouter-model"
                  type="text"
                  value={openRouterModel}
                  onInput={(event) =>
                    setOpenRouterModel(event.currentTarget.value)
                  }
                  placeholder={DEFAULT_OPENROUTER_MODEL}
                  className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
                />
              </div>
            </>
          )}

          <div>
            <label
              for="agent-runtime-temperature"
              className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
            >
              Temperature
            </label>
            <input
              id="agent-runtime-temperature"
              type="number"
              step="0.05"
              min="0"
              value={temperature}
              onInput={(event) => setTemperature(event.currentTarget.value)}
              className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 focus:border-sea/35"
            />
          </div>

          <div>
            <label
              for="agent-runtime-max-turns"
              className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
            >
              Max turns
            </label>
            <input
              id="agent-runtime-max-turns"
              type="number"
              min="1"
              step="1"
              value={maxTurns}
              onInput={(event) => setMaxTurns(event.currentTarget.value)}
              className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 focus:border-sea/35"
            />
          </div>

          <div>
            <label
              for="agent-runtime-max-tokens"
              className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
            >
              Max tokens
            </label>
            <input
              id="agent-runtime-max-tokens"
              type="number"
              min="1"
              step="1"
              value={maxTokens}
              onInput={(event) => setMaxTokens(event.currentTarget.value)}
              placeholder="No explicit cap"
              className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
            />
          </div>

          {provider === "lmstudio" && (
            <div>
              <label
                for="agent-lmstudio-context-length"
                className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
              >
                Context length
              </label>
              <input
                id="agent-lmstudio-context-length"
                type="number"
                min="1"
                step="1"
                value={contextLength}
                onInput={(event) => setContextLength(event.currentTarget.value)}
                placeholder="Use model default"
                className="mt-3 w-full border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 border border-danger/20 bg-danger/8 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-ink/10 pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="border border-ink/10 px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] text-ink-hard/58 transition-colors duration-150 hover:border-ink/20 hover:text-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="bg-sea px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] text-black transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSaving ? "Saving" : "Save settings"}
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}

