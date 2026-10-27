import { useEffect, useMemo, useRef } from "preact/hooks";

import { AgentTimelineCard } from "./AgentTimelineCard";
import type { AgentTimelineEntry, AgentTimelineRenderItem } from "./types";

function buildAgentTimelineRenderItems(entries: AgentTimelineEntry[]) {
  const items: AgentTimelineRenderItem[] = [];
  const toolCallIndexById = new Map<string, number>();
  const unmatchedToolCallQueue: number[] = [];

  for (const entry of entries) {
    if (entry.kind === "tool_result") {
      if (entry.toolCallId) {
        const idx = toolCallIndexById.get(entry.toolCallId);
        if (idx != null) {
          items[idx]?.toolResults.push(entry);
          const queuePos = unmatchedToolCallQueue.indexOf(idx);
          if (queuePos !== -1) unmatchedToolCallQueue.splice(queuePos, 1);
          continue;
        }
      }
      if (unmatchedToolCallQueue.length > 0) {
        const idx = unmatchedToolCallQueue.shift()!;
        items[idx]?.toolResults.push(entry);
        continue;
      }
      items.push({ entry, toolResults: [] });
      continue;
    }

    const item: AgentTimelineRenderItem = { entry, toolResults: [] };
    items.push(item);

    if (entry.kind === "tool_call") {
      const idx = items.length - 1;
      toolCallIndexById.set(entry.call.id, idx);
      unmatchedToolCallQueue.push(idx);
    }
  }

  return items;
}

export function AgentTimelinePanel({
  entries,
  busy,
  roundInfo,
  onClear,
}: {
  entries: AgentTimelineEntry[];
  busy: boolean;
  roundInfo?: { round: number; maxTurns: number } | null;
  onClear?: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const renderItems = useMemo(
    () => buildAgentTimelineRenderItems(entries),
    [entries]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [busy, entries]);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-ink/10 bg-black/20">
      <div className="flex items-center justify-between gap-3 bg-paper px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-[10px] font-display uppercase tracking-[0.24em] text-ink-hard/55">
            {busy
              ? "Chat history · live"
              : `Chat history · ${entries.length} items`}
          </p>
          {busy && (
            <span className="shrink-0 rounded-sm border border-sea/18 bg-sea/10 px-2 py-1 text-[10px] font-display uppercase tracking-[0.22em] text-sea">
              {roundInfo
                ? `Round ${roundInfo.round} / ${roundInfo.maxTurns}`
                : "Running"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onClear && entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 text-[10px] font-display uppercase tracking-[0.24em] text-ink-hard/52 transition-colors duration-150 hover:text-paper"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="space-y-3">
          {!busy && renderItems.length === 0 && (
            <div className="border border-dashed border-ink/10 bg-black/16 px-4 py-5">
              <p className="text-[10px] font-display uppercase tracking-[0.28em] text-ink-soft">
                No history yet
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-hard/64">
                User messages, agent replies, tool calls, and tool output will
                appear here.
              </p>
            </div>
          )}
          {renderItems.map((item) => (
            <AgentTimelineCard
              key={item.entry.id}
              entry={item.entry}
              toolResults={item.toolResults}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

