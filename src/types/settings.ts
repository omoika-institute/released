import type { AgentProvider } from "@/lib/aosint/agentTypes";
import type { SupportedLanguage } from "@/i18n/languages";

export type PluginSettingsMap = Record<string, Record<string, string>>;

export interface Settings {
  language?: SupportedLanguage;
  pythonPath?: string;
  pip3Path?: string;
  venvPath?: string;
  pluginsPath?: string;
  pluginSettings?: PluginSettingsMap;
  agentProvider?: AgentProvider;
  agentSystemPrompt?: string;
  agentUserPrompt?: string;
  agentLmStudioBaseUrl?: string;
  agentLmStudioModel?: string;
  agentLmStudioTemperature?: number;
  agentLmStudioMaxTurns?: number;
  agentLmStudioContextLength?: number;
  agentLmStudioMaxTokens?: number;
  agentOpenRouterApiKey?: string;
  agentOpenRouterModel?: string;
}

export type DiagnosticsStatus = "ok" | "warning" | "error";

export interface DiagnosticsCheck {
  status: DiagnosticsStatus;
  message: string;
  details?: string[];
}

export interface SettingsDiagnostics {
  venv: DiagnosticsCheck;
  plugins: DiagnosticsCheck;
  resolvedPythonPath?: string;
  resolvedPluginsPath?: string;
  detectedPythonPath?: string;
}
