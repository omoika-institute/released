import { Icon } from "@/components/icons";
import type { Node } from "@xyflow/react";

type ProactiveQueueEntity = {
  id: string;
  target: string;
};

type ProactiveAgentStatus = {
  runningEntityId: string;
};

interface ProactiveQueuePanelProps {
  draggedProactiveQueueId: string | null;
  graphNodes: Node[];
  proactiveAgentStatus: ProactiveAgentStatus;
  proactiveQueueDropIndex: number | null;
  proactiveQueueEntities: ProactiveQueueEntity[];
  dropProactiveQueueEntityAtIndex: (index: number) => void;
  focusDuplicateQueueNode: (nodeId: string) => void;
  moveProactiveQueueEntity: (id: string, direction: -1 | 1) => void;
  setDraggedProactiveQueueId: (id: string | null) => void;
  setProactiveQueueDropIndex: (index: number | null) => void;
}

const formatQueueValue = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

export function ProactiveQueuePanel({
  draggedProactiveQueueId,
  graphNodes,
  proactiveAgentStatus,
  proactiveQueueDropIndex,
  proactiveQueueEntities,
  dropProactiveQueueEntityAtIndex,
  focusDuplicateQueueNode,
  moveProactiveQueueEntity,
  setDraggedProactiveQueueId,
  setProactiveQueueDropIndex,
}: ProactiveQueuePanelProps) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-hard/10 bg-paper/20">
      <div className="flex shrink-0 items-center border-b border-ink-hard/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-display text-[10px] uppercase tracking-[0.34em] text-ink">
            Entity Queue
          </p>
          <span className="font-display text-[9px] uppercase tracking-[0.28em] text-ink-hard/65">
            {proactiveQueueEntities.length}
          </span>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5"
        onDragOver={(event) => {
          if (!draggedProactiveQueueId) return;
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setProactiveQueueDropIndex(proactiveQueueEntities.length);
          }
        }}
        onDrop={(event) => {
          if (!draggedProactiveQueueId) return;
          event.preventDefault();
          event.stopPropagation();
          dropProactiveQueueEntityAtIndex(
            proactiveQueueDropIndex ?? proactiveQueueEntities.length
          );
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget as globalThis.Node | null;
          if (nextTarget && event.currentTarget.contains(nextTarget)) {
            return;
          }
          setProactiveQueueDropIndex(null);
        }}
      >
        {proactiveQueueEntities.length === 0 ? (
          <div className="rounded-sm border border-ink-hard/10 bg-paper/20 px-3 py-4 text-sm text-ink-hard/60">
            No graph entities are available for proactive intelligence.
          </div>
        ) : (
          <div className="flex min-h-full flex-col gap-1">
            {proactiveQueueEntities.map((entity, index) => {
              const isActive =
                proactiveAgentStatus.runningEntityId === entity.id;
              const score = Math.max(
                1,
                Math.round(
                  ((proactiveQueueEntities.length - index) /
                    proactiveQueueEntities.length) *
                    100
                )
              );
              const targetNode = graphNodes.find(
                (node) => node.id === entity.id
              );
              const nodeData = (targetNode?.data ?? {}) as Record<
                string,
                unknown
              >;
              const entityType =
                formatQueueValue(nodeData.label) || "Graph entity";

              return (
                <div key={entity.id} className="contents">
                  {draggedProactiveQueueId &&
                    proactiveQueueDropIndex === index && (
                      <div className="flex h-1.5 items-center px-1">
                        <span className="h-0.5 flex-1 rounded-full bg-sea shadow-[0_0_10px_rgba(29,45,245,0.65)]" />
                      </div>
                    )}
                  <article
                    draggable
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDraggedProactiveQueueId(entity.id);
                      setProactiveQueueDropIndex(index);
                      event.dataTransfer?.setData("text/plain", entity.id);
                      if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = "move";
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const nextDropIndex =
                        event.clientY < rect.top + rect.height / 2
                          ? index
                          : index + 1;
                      setProactiveQueueDropIndex(nextDropIndex);
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      dropProactiveQueueEntityAtIndex(
                        proactiveQueueDropIndex ?? index
                      );
                    }}
                    onDragEnd={() => {
                      setDraggedProactiveQueueId(null);
                      setProactiveQueueDropIndex(null);
                    }}
                    className={`group relative flex min-h-9 cursor-grab items-stretch overflow-hidden rounded-sm border bg-paper/20 transition-colors active:cursor-grabbing ${
                      isActive
                        ? "border-sea/55 bg-sea/8"
                        : "border-ink-hard/10 hover:border-sea/35 hover:bg-paper/30"
                    } ${draggedProactiveQueueId === entity.id ? "opacity-55" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => focusDuplicateQueueNode(entity.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus:outline-hidden"
                      title={`Focus ${entity.target}`}
                    >
                      <span
                        className={`flex h-6 w-8 shrink-0 items-center justify-center rounded-sm border ${
                          isActive
                            ? "border-sea/45 bg-sea/12 text-sea"
                            : "border-ink-hard/10 bg-paper/30 text-ink-hard/65"
                        }`}
                      >
                        <Icon icon="robot" className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[10px] uppercase leading-3 tracking-[0.24em] text-ink">
                          {entity.target}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[8px] leading-3 text-ink-hard/60">
                          {entityType}
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1 border-l border-ink-hard/10 bg-paper/20 px-1">
                      <span
                        className={`min-w-8 rounded-sm border px-1 py-0.5 text-center font-mono text-[8px] ${
                          isActive
                            ? "border-sea/35 bg-sea/8 text-sea"
                            : "border-ink-hard/10 bg-paper/30 text-ink-hard/60"
                        }`}
                        title="Queue priority score"
                      >
                        {score}
                      </span>
                      <div className="grid gap-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            moveProactiveQueueEntity(entity.id, -1)
                          }
                          title="Move up"
                          className="flex h-4 w-5 items-center justify-center rounded-sm text-ink-hard/55 transition-colors enabled:hover:bg-ink/8 enabled:hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          <Icon icon="chevron-up" className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === proactiveQueueEntities.length - 1}
                          onClick={() =>
                            moveProactiveQueueEntity(entity.id, 1)
                          }
                          title="Move down"
                          className="flex h-4 w-5 items-center justify-center rounded-sm text-ink-hard/55 transition-colors enabled:hover:bg-ink/8 enabled:hover:text-ink-soft disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          <Icon icon="chevron-down" className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </article>
                  {draggedProactiveQueueId &&
                    proactiveQueueDropIndex === proactiveQueueEntities.length &&
                    index === proactiveQueueEntities.length - 1 && (
                      <div className="flex h-1.5 items-center px-1">
                        <span className="h-0.5 flex-1 rounded-full bg-sea shadow-[0_0_10px_rgba(29,45,245,0.65)]" />
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
