import { create } from "zustand";
import type { Settings } from "@/preload";

export interface SettingsState extends Settings {
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<Settings>;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  pythonPath: undefined,
  pip3Path: undefined,
  venvPath: undefined,
  pluginsPath: undefined,
  pluginSettings: undefined,
  agentProvider: undefined,
  agentSystemPrompt: undefined,
  agentUserPrompt: undefined,
  agentLmStudioBaseUrl: undefined,
  agentLmStudioModel: undefined,
  agentLmStudioTemperature: undefined,
  agentLmStudioMaxTurns: undefined,
  agentLmStudioContextLength: undefined,
  agentLmStudioMaxTokens: undefined,
  agentOpenRouterApiKey: undefined,
  agentOpenRouterModel: undefined,
  isLoading: false,
  hasLoaded: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await window.api.settings.get();
      set({ ...settings, isLoading: false, hasLoaded: true, error: null });
    } catch (error) {
      set({
        isLoading: false,
        hasLoaded: true,
        error: toErrorMessage(error),
      });
    }
  },

  update: async (partial) => {
    set({ isLoading: true, error: null });
    try {
      const settings = await window.api.settings.update(partial);
      set({ ...settings, isLoading: false, hasLoaded: true, error: null });
      return settings;
    } catch (error) {
      set({ isLoading: false, hasLoaded: true, error: toErrorMessage(error) });
      throw error;
    }
  },
}));
