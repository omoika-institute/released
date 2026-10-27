import { Button } from "@/components/buttons/Button";
import TransparentModal from "@/components/modals/TransparentModal";
import { useEffect, useRef, useState } from "preact/hooks";
import Icon from "@/components/icons";
import { toast } from "react-toastify";
import {
  DEFAULT_LM_STUDIO_MAX_TURNS,
  DEFAULT_LM_STUDIO_MODEL,
  DEFAULT_LM_STUDIO_TEMPERATURE,
} from "@/lib/aosint/lmstudio";
import { DEFAULT_OPENROUTER_MODEL } from "@/lib/aosint/openrouterAgent";

interface SettingsModalProps {
  graphId: string;
  isOpen: boolean;
  closeModal: () => void;
}

interface OSINTSettings {
  maxGraphDepth: number;
  autoExpandNodes: boolean;
  defaultLayout: string;
  entityLimit: number;
  enableCaching: boolean;
  cacheExpiry: number;
  anonymousMode: boolean;
  proxyEnabled: boolean;
  rateLimit: number;
  autoSaveInterval: number;
  enableNotifications: boolean;
  defaultExportFormat: string;
  showMetadata: boolean;
  enableGeolocation: boolean;
  privacyLevel: string;
  maxConcurrentTransforms: number;
}
type SettingsTabs = "general" | "privacy" | "performance" | "agent";

const inputClass =
  "w-full rounded-sm border border-ink/10 bg-ink/3 px-3 py-2 text-sm text-ink focus:outline-none focus:border-canvas/30 placeholder:text-ink-hard/30 disabled:opacity-40";

const selectClass =
  "w-full rounded-sm border border-ink/10 bg-ink/3 px-3 py-2 text-sm text-ink focus:outline-none focus:border-canvas/30";

const labelClass =
  "block font-display text-[10px] uppercase tracking-[0.28em] text-ink-soft mb-1";

const helperClass = "font-display text-[10px] text-ink-hard/40 mt-1";

const toggleTrackClass =
  "w-11 h-6 bg-ink/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-canvas/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-canvas";

const switchRowClass =
  "flex items-center justify-between py-3 border-b border-ink/10 last:border-0";

// Proactive intelligence runtime settings are held for a later release.
const PROACTIVE_INTELLIGENCE_RELEASED = false;

export default function SettingsModal({
  graphId,
  isOpen,
  closeModal,
}: SettingsModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  const cancelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabs>("general");

  const [agentProvider, setAgentProvider] = useState<"lmstudio" | "openrouter">(
    "lmstudio",
  );
  const [agentBaseUrl, setAgentBaseUrl] = useState("");
  const [agentModel, setAgentModel] = useState(DEFAULT_LM_STUDIO_MODEL);
  const [agentTemperature, setAgentTemperature] = useState(
    String(DEFAULT_LM_STUDIO_TEMPERATURE),
  );
  const [agentMaxTurns, setAgentMaxTurns] = useState(
    String(DEFAULT_LM_STUDIO_MAX_TURNS),
  );
  const [agentContextLength, setAgentContextLength] = useState("");
  const [agentMaxTokens, setAgentMaxTokens] = useState("");
  const [agentOpenRouterApiKey, setAgentOpenRouterApiKey] = useState("");
  const [agentOpenRouterModel, setAgentOpenRouterModel] = useState(
    DEFAULT_OPENROUTER_MODEL,
  );
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [availableLmStudioModels, setAvailableLmStudioModels] = useState<
    { modelKey: string; displayName: string }[]
  >([]);
  const [isLoadingLmStudioModels, setIsLoadingLmStudioModels] = useState(false);

  useEffect(() => {
    if (!PROACTIVE_INTELLIGENCE_RELEASED || !isOpen || activeTab !== "agent") {
      return;
    }

    window.api.settings.get().then((s) => {
      const provider =
        s.agentProvider === "openrouter" ? "openrouter" : "lmstudio";
      const baseUrl = s.agentLmStudioBaseUrl?.trim() ?? "";
      const model = s.agentLmStudioModel?.trim() || DEFAULT_LM_STUDIO_MODEL;
      setAgentProvider(provider);
      setAgentBaseUrl(baseUrl);
      setAgentModel(model);
      setAgentTemperature(
        s.agentLmStudioTemperature != null
          ? String(s.agentLmStudioTemperature)
          : String(DEFAULT_LM_STUDIO_TEMPERATURE),
      );
      setAgentMaxTurns(
        s.agentLmStudioMaxTurns != null
          ? String(s.agentLmStudioMaxTurns)
          : String(DEFAULT_LM_STUDIO_MAX_TURNS),
      );
      setAgentContextLength(
        s.agentLmStudioContextLength != null
          ? String(s.agentLmStudioContextLength)
          : "",
      );
      setAgentMaxTokens(
        s.agentLmStudioMaxTokens != null
          ? String(s.agentLmStudioMaxTokens)
          : "",
      );
      setAgentOpenRouterApiKey(s.agentOpenRouterApiKey?.trim() ?? "");
      setAgentOpenRouterModel(
        s.agentOpenRouterModel?.trim() || DEFAULT_OPENROUTER_MODEL,
      );

      if (provider === "lmstudio") {
        setIsLoadingLmStudioModels(true);
        setAvailableLmStudioModels([]);
        void window.api.aosint
          .listLmStudioModels({ baseUrl: baseUrl || undefined })
          .then((models) => {
            setAvailableLmStudioModels(models);
            if (models.length > 0) {
              const match = models.find((m) => m.modelKey === model);
              if (!match) setAgentModel(models[0].modelKey);
            }
          })
          .catch(() => {})
          .finally(() => setIsLoadingLmStudioModels(false));
      }
    });
  }, [isOpen, activeTab]);

  const saveAgentRuntimeSettings = async ({
    showSuccessToast = true,
  }: {
    showSuccessToast?: boolean;
  } = {}) => {
    try {
      const temperature = parseFloat(agentTemperature);
      const maxTurns = parseInt(agentMaxTurns, 10);
      const contextLength =
        agentProvider === "lmstudio" && agentContextLength.trim()
          ? parseInt(agentContextLength, 10)
          : undefined;
      const maxTokens = agentMaxTokens.trim()
        ? parseInt(agentMaxTokens, 10)
        : undefined;

      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        setAgentError("Temperature must be a number between 0 and 2.");
        return false;
      }
      if (!Number.isInteger(maxTurns) || maxTurns < 1) {
        setAgentError("Max turns must be a positive integer.");
        return false;
      }
      if (
        contextLength !== undefined &&
        (!Number.isInteger(contextLength) || contextLength < 1)
      ) {
        setAgentError("Context length must be a positive integer or empty.");
        return false;
      }
      if (
        maxTokens !== undefined &&
        (!Number.isInteger(maxTokens) || maxTokens < 1)
      ) {
        setAgentError("Max tokens must be a positive integer or empty.");
        return false;
      }

      await window.api.settings.update({
        agentProvider,
        agentLmStudioBaseUrl:
          agentProvider === "lmstudio"
            ? agentBaseUrl.trim() || undefined
            : undefined,
        agentLmStudioModel:
          agentProvider === "lmstudio"
            ? agentModel.trim() === DEFAULT_LM_STUDIO_MODEL
              ? undefined
              : agentModel.trim() || undefined
            : undefined,
        agentLmStudioTemperature:
          temperature === DEFAULT_LM_STUDIO_TEMPERATURE
            ? undefined
            : temperature,
        agentLmStudioMaxTurns:
          maxTurns === DEFAULT_LM_STUDIO_MAX_TURNS ? undefined : maxTurns,
        agentLmStudioContextLength: contextLength,
        agentLmStudioMaxTokens: maxTokens,
        agentOpenRouterApiKey:
          agentProvider === "openrouter"
            ? agentOpenRouterApiKey.trim() || undefined
            : undefined,
        agentOpenRouterModel:
          agentProvider === "openrouter"
            ? agentOpenRouterModel.trim() === DEFAULT_OPENROUTER_MODEL
              ? undefined
              : agentOpenRouterModel.trim() || undefined
            : undefined,
      });
      if (showSuccessToast) {
        toast.success("Agent runtime settings saved.");
      }
      return true;
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "Save failed.");
      return false;
    }
  };

  const [settings, setSettings] = useState<OSINTSettings>({
    maxGraphDepth: 3,
    autoExpandNodes: true,
    defaultLayout: "force",
    entityLimit: 1000,
    enableCaching: true,
    cacheExpiry: 3600,
    anonymousMode: false,
    proxyEnabled: false,
    rateLimit: 100,
    autoSaveInterval: 300,
    enableNotifications: true,
    defaultExportFormat: "json",
    showMetadata: true,
    enableGeolocation: false,
    privacyLevel: "medium",
    maxConcurrentTransforms: 5,
  });

  const handleSave = async () => {
    setIsSaving(true);
    setIsSavingAgent(true);
    setAgentError(null);
    try {
      const runtimeSaved = PROACTIVE_INTELLIGENCE_RELEASED
        ? await saveAgentRuntimeSettings({
            showSuccessToast: false,
          })
        : true;
      if (!runtimeSaved) return;

      handleSaveSettings(settings);
      closeModal();
    } finally {
      setIsSaving(false);
      setIsSavingAgent(false);
    }
  };

  const handleSaveSettings = (settings: any) => {
    localStorage.setItem(`flow-settings-${graphId}`, JSON.stringify(settings));
    toast.success("Settings saved successfully");
  };

  const handleReset = () => {
    setSettings({
      maxGraphDepth: 3,
      autoExpandNodes: true,
      defaultLayout: "force",
      entityLimit: 1000,
      enableCaching: true,
      cacheExpiry: 3600,
      anonymousMode: false,
      proxyEnabled: false,
      rateLimit: 100,
      autoSaveInterval: 300,
      enableNotifications: true,
      defaultExportFormat: "json",
      showMetadata: true,
      enableGeolocation: false,
      privacyLevel: "medium",
      maxConcurrentTransforms: 5,
    });
  };

  const updateSetting = <K extends keyof OSINTSettings>(
    key: K,
    value: OSINTSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const tabs: { id: SettingsTabs; label: string }[] = [
    { id: "general", label: "General" },
    { id: "privacy", label: "Privacy" },
    { id: "performance", label: "Performance" },
    ...(PROACTIVE_INTELLIGENCE_RELEASED
      ? ([{ id: "agent", label: "Agent Runtime" }] as const)
      : []),
  ];

  return (
    <TransparentModal
      isOpen={isOpen}
      closeModal={closeModal}
      cancelRef={cancelRef}
    >
      <div className="relative flex max-h-[80vh] flex-col overflow-hidden rounded-md border border-ink/10 bg-[linear-gradient(180deg,rgba(8,12,22,0.94),rgba(4,6,12,0.88)_54%,rgba(4,5,10,0.96))] shadow-[0_32px_120px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-ink/3 backdrop-blur-[2px]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-6 pt-8 sm:px-9 sm:pt-10">
          <div className="space-y-2">
            <p className="font-display text-xs uppercase tracking-[0.34em] text-ink-soft">
              Configuration
            </p>
            <h2 className="font-display text-2xl text-ink">Flow Settings</h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="flex items-center justify-center text-ink-hard/40 transition-colors hover:text-ink-soft focus:outline-hidden"
          >
            <Icon icon="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex shrink-0 gap-0 border-b border-ink/10 px-6 sm:px-9">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 font-display text-[10px] uppercase tracking-[0.28em] transition-colors ${
                activeTab === id
                  ? "border-canvas/60 text-canvas"
                  : "border-transparent text-ink-hard/40 hover:text-ink-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-9">
          {activeTab === "general" && (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Max Graph Depth</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.maxGraphDepth}
                  onInput={(e) =>
                    updateSetting(
                      "maxGraphDepth",
                      parseInt(e.currentTarget.value),
                    )
                  }
                  className="w-full cursor-pointer accent-canvas"
                />
                <p className={helperClass}>
                  Current: {settings.maxGraphDepth} levels
                </p>
              </div>

              <div>
                <label className={labelClass}>Entity Limit</label>
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={settings.entityLimit}
                  onInput={(e) =>
                    updateSetting(
                      "entityLimit",
                      parseInt(e.currentTarget.value),
                    )
                  }
                  className={inputClass}
                />
                <p className={helperClass}>
                  Maximum entities to load in graph view
                </p>
              </div>

              <div>
                <label className={labelClass}>Default Layout Algorithm</label>
                <select
                  value={settings.defaultLayout}
                  onChange={(e) =>
                    updateSetting("defaultLayout", e.currentTarget.value)
                  }
                  className={selectClass}
                >
                  <option value="force">Force-Directed</option>
                  <option value="hierarchical">Hierarchical</option>
                  <option value="circular">Circular</option>
                  <option value="grid">Grid</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Default Export Format</label>
                <select
                  value={settings.defaultExportFormat}
                  onChange={(e) =>
                    updateSetting("defaultExportFormat", e.currentTarget.value)
                  }
                  className={selectClass}
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="graphml">GraphML</option>
                  <option value="gexf">GEXF</option>
                  <option value="pdf">PDF Report</option>
                </select>
              </div>

              <div className="rounded-sm border border-ink/10 bg-ink/3 px-3 py-1">
                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Auto-Expand Nodes</p>
                    <p className={helperClass}>
                      Automatically expand connected entities
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.autoExpandNodes}
                      onChange={(e) =>
                        updateSetting(
                          "autoExpandNodes",
                          e.currentTarget.checked,
                        )
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>

                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Show Metadata</p>
                    <p className={helperClass}>
                      Display entity metadata in tooltips
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.showMetadata}
                      onChange={(e) =>
                        updateSetting("showMetadata", e.currentTarget.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Privacy Level</label>
                <select
                  value={settings.privacyLevel}
                  onChange={(e) =>
                    updateSetting("privacyLevel", e.currentTarget.value)
                  }
                  className={selectClass}
                >
                  <option value="low">Low — Maximum data collection</option>
                  <option value="medium">Medium — Balanced</option>
                  <option value="high">High — Minimal data collection</option>
                  <option value="maximum">Maximum — No telemetry</option>
                </select>
              </div>

              <div className="rounded-sm border border-ink/10 bg-ink/3 px-3 py-1">
                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Anonymous Mode</p>
                    <p className={helperClass}>
                      Hide identifying information in exports
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.anonymousMode}
                      onChange={(e) =>
                        updateSetting("anonymousMode", e.currentTarget.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>

                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Use Proxy</p>
                    <p className={helperClass}>
                      Route requests through configured proxy
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.proxyEnabled}
                      onChange={(e) =>
                        updateSetting("proxyEnabled", e.currentTarget.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>

                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Enable Geolocation</p>
                    <p className={helperClass}>
                      Resolve and display geographic data
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.enableGeolocation}
                      onChange={(e) =>
                        updateSetting(
                          "enableGeolocation",
                          e.currentTarget.checked,
                        )
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>
              </div>

              <div className="rounded-sm border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="font-display text-[10px] uppercase tracking-[0.22em] text-amber-400/80">
                  Privacy Notice
                </p>
                <p className="mt-1 font-display text-[10px] text-ink-hard/50">
                  Some features may be limited when privacy settings are
                  maximized. Enable geolocation and proxy features with caution.
                </p>
              </div>
            </div>
          )}

          {activeTab === "performance" && (
            <div className="space-y-5">
              <div className="rounded-sm border border-ink/10 bg-ink/3 px-3 py-1">
                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">Enable Caching</p>
                    <p className={helperClass}>
                      Cache API responses for faster loading
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.enableCaching}
                      onChange={(e) =>
                        updateSetting("enableCaching", e.currentTarget.checked)
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>

                <div className={switchRowClass}>
                  <div>
                    <p className="text-sm text-ink-soft">
                      Enable Notifications
                    </p>
                    <p className={helperClass}>
                      Show desktop notifications for completed operations
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.enableNotifications}
                      onChange={(e) =>
                        updateSetting(
                          "enableNotifications",
                          e.currentTarget.checked,
                        )
                      }
                      className="peer sr-only"
                    />
                    <div className={toggleTrackClass} />
                  </label>
                </div>
              </div>

              <div>
                <label className={labelClass}>Cache Expiry (seconds)</label>
                <input
                  type="number"
                  min="60"
                  max="86400"
                  step="60"
                  value={settings.cacheExpiry}
                  onInput={(e) =>
                    updateSetting(
                      "cacheExpiry",
                      parseInt(e.currentTarget.value),
                    )
                  }
                  disabled={!settings.enableCaching}
                  className={inputClass}
                />
                <p className={helperClass}>
                  {Math.floor(settings.cacheExpiry / 60)} minutes
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  API Rate Limit (requests/min)
                </label>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={settings.rateLimit}
                  onInput={(e) =>
                    updateSetting("rateLimit", parseInt(e.currentTarget.value))
                  }
                  className="w-full cursor-pointer accent-canvas"
                />
                <p className={helperClass}>
                  Current: {settings.rateLimit} req/min
                </p>
              </div>

              <div>
                <label className={labelClass}>Max Concurrent Transforms</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={settings.maxConcurrentTransforms}
                  onInput={(e) =>
                    updateSetting(
                      "maxConcurrentTransforms",
                      parseInt(e.currentTarget.value),
                    )
                  }
                  className="w-full cursor-pointer accent-canvas"
                />
                <p className={helperClass}>
                  Current: {settings.maxConcurrentTransforms} parallel
                  operations
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  Auto-Save Interval (seconds)
                </label>
                <input
                  type="number"
                  min="30"
                  max="3600"
                  step="30"
                  value={settings.autoSaveInterval}
                  onInput={(e) =>
                    updateSetting(
                      "autoSaveInterval",
                      parseInt(e.currentTarget.value),
                    )
                  }
                  className={inputClass}
                />
                <p className={helperClass}>
                  {Math.floor(settings.autoSaveInterval / 60)} minutes
                </p>
              </div>
            </div>
          )}

          {PROACTIVE_INTELLIGENCE_RELEASED && activeTab === "agent" && (
            <div className="space-y-4">
              <p className={helperClass}>
                Agent runtime settings for the proactive intelligence agent.
                Leave optional fields empty to use defaults.
              </p>

              <div>
                <label className={labelClass}>Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAgentProvider("lmstudio")}
                    className={`rounded-sm border px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] transition-colors ${
                      agentProvider === "lmstudio"
                        ? "border-canvas/40 bg-canvas/5 text-canvas"
                        : "border-ink/10 bg-ink/3 text-ink-hard/55 hover:border-ink/20 hover:text-ink-soft"
                    }`}
                  >
                    LM Studio
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentProvider("openrouter")}
                    className={`rounded-sm border px-3 py-2 font-display text-[10px] uppercase tracking-[0.22em] transition-colors ${
                      agentProvider === "openrouter"
                        ? "border-canvas/40 bg-canvas/5 text-canvas"
                        : "border-ink/10 bg-ink/3 text-ink-hard/55 hover:border-ink/20 hover:text-ink-soft"
                    }`}
                  >
                    OpenRouter
                  </button>
                </div>
              </div>

              {agentError && (
                <div className="rounded-sm border border-red-500/20 bg-red-500/5 px-3 py-2 font-display text-[10px] text-red-400/80">
                  {agentError}
                </div>
              )}

              {agentProvider === "lmstudio" && (
                <>
                  <div>
                    <label className={labelClass}>LM Studio Base URL</label>
                    <input
                      type="text"
                      value={agentBaseUrl}
                      onInput={(e) => setAgentBaseUrl(e.currentTarget.value)}
                      placeholder="http://localhost:1234 (default)"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Model</label>
                    {availableLmStudioModels.length > 0 ? (
                      <select
                        value={agentModel}
                        onChange={(e) => setAgentModel(e.currentTarget.value)}
                        className={selectClass}
                      >
                        {availableLmStudioModels.map((m) => (
                          <option key={m.modelKey} value={m.modelKey}>
                            {m.displayName || m.modelKey}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={agentModel}
                        onInput={(e) => setAgentModel(e.currentTarget.value)}
                        placeholder={
                          isLoadingLmStudioModels
                            ? "Loading models…"
                            : DEFAULT_LM_STUDIO_MODEL
                        }
                        className={inputClass}
                      />
                    )}
                  </div>
                </>
              )}

              {agentProvider === "openrouter" && (
                <>
                  <div>
                    <label className={labelClass}>OpenRouter API Key</label>
                    <input
                      type="password"
                      value={agentOpenRouterApiKey}
                      onInput={(e) =>
                        setAgentOpenRouterApiKey(e.currentTarget.value)
                      }
                      placeholder="sk-or-…"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Model</label>
                    <input
                      type="text"
                      value={agentOpenRouterModel}
                      onInput={(e) =>
                        setAgentOpenRouterModel(e.currentTarget.value)
                      }
                      placeholder={DEFAULT_OPENROUTER_MODEL}
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={agentTemperature}
                    onInput={(e) => setAgentTemperature(e.currentTarget.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Max Turns</label>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    step="1"
                    value={agentMaxTurns}
                    onInput={(e) => setAgentMaxTurns(e.currentTarget.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div
                className={`grid gap-3 ${agentProvider === "lmstudio" ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {agentProvider === "lmstudio" && (
                  <div>
                    <label className={labelClass}>
                      Context Length{" "}
                      <span className="normal-case text-ink-hard/30">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1024"
                      value={agentContextLength}
                      onInput={(e) =>
                        setAgentContextLength(e.currentTarget.value)
                      }
                      placeholder="model default"
                      className={inputClass}
                    />
                  </div>
                )}

                <div>
                  <label className={labelClass}>
                    Max Tokens{" "}
                    <span className="normal-case text-ink-hard/30">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="256"
                    value={agentMaxTokens}
                    onInput={(e) => setAgentMaxTokens(e.currentTarget.value)}
                    placeholder="model default"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-3 border-t border-ink/10 px-6 py-6 sm:px-9">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            className="flex-1"
          >
            <Icon icon="refresh" className="h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? "Saving…" : "Save Settings"}
            <Icon icon="check" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </TransparentModal>
  );
}
