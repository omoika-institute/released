import { Icon } from "@/components/icons";
import OverlayModal from "@/components/modals/OverlayModal";

import type { AgentPromptSettingsTab } from "./types";

export function AgentPromptSettingsModal({
  activeTab,
  closeModal,
  error,
  isOpen,
  isSaving,
  onSave,
  onTabChange,
  systemPrompt,
  userPrompt,
  setSystemPrompt,
  setUserPrompt,
  cancelRef,
}: {
  activeTab: AgentPromptSettingsTab;
  closeModal: () => void;
  error: string | null;
  isOpen: boolean;
  isSaving: boolean;
  onSave: () => void;
  onTabChange: (tab: AgentPromptSettingsTab) => void;
  systemPrompt: string;
  userPrompt: string;
  setSystemPrompt: (value: string) => void;
  setUserPrompt: (value: string) => void;
  cancelRef: { current: HTMLDivElement | null };
}) {
  return (
    <OverlayModal isOpen={isOpen} closeModal={closeModal} cancelRef={cancelRef}>
      <div className="border border-ink/12 bg-[linear-gradient(180deg,rgba(8,12,22,0.98),rgba(5,8,16,0.96))] p-5 text-ink shadow-[0_24px_90px_rgba(0,0,0,0.58)]">
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-sea">
              Prompt Controls
            </p>
            <h2 className="mt-2 font-display text-xl text-ink">
              Agent prompt presets
            </h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-6 text-ink-hard/68">
              System prompt changes the agent&apos;s standing behavior. User
              prompt is appended to each submitted request from this browser
              tab.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="shrink-0 rounded-full border border-ink/10 p-2 text-ink-hard/60 transition-colors duration-150 hover:border-ink/20 hover:text-paper"
            aria-label="Close prompt settings"
          >
            <Icon icon="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onTabChange("system")}
            className={[
              "flex items-center gap-2 border px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] transition-colors duration-150",
              activeTab === "system"
                ? "border-sea/30 bg-sea/12 text-sea"
                : "border-ink/10 text-ink-hard/58 hover:border-ink/20 hover:text-paper",
            ].join(" ")}
          >
            <Icon icon="message-circle-cog" className="h-4 w-4" />
            System
          </button>
          <button
            type="button"
            onClick={() => onTabChange("user")}
            className={[
              "flex items-center gap-2 border px-3 py-2 text-[10px] font-display uppercase tracking-[0.24em] transition-colors duration-150",
              activeTab === "user"
                ? "border-sea/30 bg-sea/12 text-sea"
                : "border-ink/10 text-ink-hard/58 hover:border-ink/20 hover:text-paper",
            ].join(" ")}
          >
            <Icon icon="message-circle-user" className="h-4 w-4" />
            User
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {activeTab === "system" ? (
            <div>
              <label
                for="agent-system-prompt"
                className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
              >
                System prompt
              </label>
              <p className="mt-2 text-sm leading-6 text-ink-hard/62">
                Applied to the agent&apos;s top-level instructions before every
                workflow run.
              </p>
              <textarea
                id="agent-system-prompt"
                value={systemPrompt}
                onInput={(event) => setSystemPrompt(event.currentTarget.value)}
                rows={12}
                placeholder="Add standing OSINT instructions or behavioral constraints."
                className="mt-3 min-h-56 w-full resize-y border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
              />
            </div>
          ) : (
            <div>
              <label
                for="agent-user-prompt"
                className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft"
              >
                User prompt preset
              </label>
              <p className="mt-2 text-sm leading-6 text-ink-hard/62">
                Appended to each request you send from the prompt bar in this
                tab.
              </p>
              <textarea
                id="agent-user-prompt"
                value={userPrompt}
                onInput={(event) => setUserPrompt(event.currentTarget.value)}
                rows={10}
                placeholder="Add reusable investigation instructions."
                className="mt-3 min-h-48 w-full resize-y border border-ink/10 bg-black/24 px-4 py-3 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-ink-hard/36 focus:border-sea/35"
              />
            </div>
          )}

          {error && (
            <div className="border border-danger/20 bg-danger/8 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

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
            {isSaving ? "Saving" : "Save prompts"}
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}

