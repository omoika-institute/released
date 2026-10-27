import { useState } from "preact/hooks";

import CodeMirrorViewer from "@/components/editor/CodeMirrorViewer";
import { Icon } from "@/components/icons";
import MarkdownRenderer from "@/components/MarkdownRenderer";

import type { AgentTimelineEntry, AgentTimelineRenderItem } from "./types";

function detectCodeMirrorLanguage(value: string): "json" | "text" {
  const trimmed = value.trim();
  if (!trimmed || !/^[{\[]/.test(trimmed)) return "text";

  try {
    JSON.parse(trimmed);
    return "json";
  } catch {
    return "text";
  }
}

function getEntryIcon(kind: AgentTimelineEntry["kind"]) {
  switch (kind) {
    case "prompt":
      return "user-circle";
    case "thinking":
      return "brain";
    case "response":
      return "message-chatbot";
    case "tool_call":
      return "terminal";
    case "tool_result":
      return "terminal-2";
    case "context":
      return "braces";
  }
}

export function AgentTimelineCard({ entry, toolResults }: AgentTimelineRenderItem) {
  const [isOpen, setIsOpen] = useState(
    entry.kind !== "tool_call" && entry.kind !== "tool_result"
  );
  const [isToolOutputOpen, setIsToolOutputOpen] = useState(false);

  const toneClasses =
    entry.tone === "signal"
      ? "border-signal/18 bg-signal/8"
      : entry.tone === "sea"
        ? "border-sea/18 bg-sea/8"
        : entry.tone === "amber"
          ? "border-amber-300/16 bg-amber-300/8"
          : "border-ink/10 bg-black/18";

  const labelClasses =
    entry.tone === "danger"
      ? "text-danger"
      : entry.tone === "signal"
        ? "text-signal"
        : entry.tone === "sea"
          ? "text-sea"
          : entry.tone === "amber"
            ? "text-amber-300"
            : "text-ink-soft";

  const frameClasses =
    entry.kind === "prompt"
      ? "ml-8 border-ink/14 bg-ink/8"
      : entry.kind === "tool_call" || entry.kind === "tool_result"
        ? ""
        : "mr-6";

  const body = (() => {
    if (
      entry.kind === "thinking" ||
      entry.kind === "response" ||
      entry.kind === "prompt"
    ) {
      return (
        <MarkdownRenderer markdown={entry.content} className="space-y-1" />
      );
    }

    if (entry.kind === "tool_call") {
      return (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-hard/48">
              Arguments
            </p>
            <div className="mt-2 overflow-hidden -sm border border-black/18 bg-black/22">
              <CodeMirrorViewer
                value={entry.content}
                language={detectCodeMirrorLanguage(entry.content)}
              />
            </div>
          </div>
          {toolResults.length > 0 && (
            <div className="-md border border-black/18 bg-black/22">
              <button
                type="button"
                onClick={() => setIsToolOutputOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-soft">
                  Tool output
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-display uppercase tracking-[0.22em] text-ink-hard/48">
                    {toolResults.length}
                  </span>
                  <Icon
                    icon="chevron-down"
                    className={`h-3.5 w-3.5 text-ink-hard/58 transition-transform duration-300 ${isToolOutputOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                </span>
              </button>
              <div
                className={[
                  "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
                  isToolOutputOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-60",
                ].join(" ")}
              >
                <div className="min-h-0">
                  <div className="space-y-2 border-t border-black/18 px-3 py-3">
                    {toolResults.map((result) => (
                      <div
                        key={result.id}
                        className="overflow-hidden -sm border border-ink/10 bg-black/26"
                      >
                        <CodeMirrorViewer
                          value={result.content}
                          language={detectCodeMirrorLanguage(result.content)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="overflow-hidden -sm bg-black/22">
        <CodeMirrorViewer
          value={entry.content}
          language={detectCodeMirrorLanguage(entry.content)}
        />
      </div>
    );
  })();

  return (
    <article className={`-md border ${toneClasses} ${frameClasses}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex items-start gap-2">
          <Icon
            icon="chevron-down"
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-hard/58 transition-transform duration-300 ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
          <p
            className={`text-[10px] font-display uppercase tracking-[0.28em] ${labelClasses}`}
          >
            {entry.label}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry.kind === "tool_call" && (
            <span className="-full border border-black/20 bg-black/20 px-2 py-1 text-[10px] font-display uppercase tracking-[0.22em] text-ink-hard/58">
              {entry.call.id}
            </span>
          )}
          <Icon
            icon={getEntryIcon(entry.kind)}
            className={`h-3.5 w-3.5 shrink-0 ${labelClasses}`}
          />
        </div>
      </button>
      <div
        className={[
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-60",
        ].join(" ")}
      >
        <div className="min-h-0">
          <div className="border-t border-black/12 px-4 py-3">{body}</div>
        </div>
      </div>
    </article>
  );
}

