import { createContext } from "preact";
import { memo } from "preact/compat";
import { useContext, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";
import { Collapsible } from "@/components/Collapsible";
import EntityHandles from "./EntityHandles";
import {
  formatUnverifiedNodeValue,
  normalizeResolutionCandidates,
  getBestResolutionBlueprintLabel,
} from "./unverifiedEntityUtils";

export const GraphSelectionContext = createContext({ selectedCount: 0 });

function UnverifiedEntityNode({ entity, blueprints, onResolveToBlueprint }: {
  entity: any;
  blueprints: Record<string, any>;
  onResolveToBlueprint: (entity: any, resolvedItems: Array<{
    index: number;
    resolution: Record<string, unknown>;
    blueprintLabel: string;
    title: string;
    canResolve: boolean;
  }>, options?: {
    duplicateMode?: "queueSimilar" | "forceCreate" | "mergeBest";
    suppressSuccessToast?: boolean;
  }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [isResolving, setIsResolving] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isForceCreating, setIsForceCreating] = useState(false);
  const { selectedCount } = useContext(GraphSelectionContext);
  const isSoloSelected = entity.selected && selectedCount === 1;
  const data = (entity?.data ?? {}) as Record<string, unknown>;

  if (!isSoloSelected) {
    return (
      <>
        <div className="unverified-node-hint relative h-15 w-15 text-ink">
          <div className="absolute left-0 top-0 z-5 flex h-15 w-15 items-center justify-center">
            <span className="unverified-node-glow pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 rounded-full" />
            <span className="z-3 block h-15 w-15 rounded-full border border-ink/20 bg-paper/40" />
            <Icon
              icon="alert-triangle"
              className="absolute z-4 h-4 w-4 text-amber-500"
            />
          </div>
        </div>
        <EntityHandles />
      </>
    );
  }

  const resolutions = normalizeResolutionCandidates(data);
  const primaryResolution = resolutions[0] ?? {};
  const title =
    formatUnverifiedNodeValue(data.name) ||
    formatUnverifiedNodeValue(data.title) ||
    formatUnverifiedNodeValue(data.resolution_target) ||
    t("graph.unverified.title");
  const source = formatUnverifiedNodeValue(data.source_graph_entity_label);
  const resolver = formatUnverifiedNodeValue(data.resolved_by);
  const summary = formatUnverifiedNodeValue(data.agent_resolution_summary);
  const graphReason =
    formatUnverifiedNodeValue(primaryResolution.graph_reason) ||
    formatUnverifiedNodeValue(primaryResolution.reasoning);
  const confidence = formatUnverifiedNodeValue(primaryResolution.confidence);
  const evidence = Array.isArray(primaryResolution.evidence)
    ? primaryResolution.evidence.map(formatUnverifiedNodeValue).filter(Boolean)
    : [];
  const evidenceCitations = Array.isArray(data.evidence_citations)
    ? data.evidence_citations.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : Array.isArray(primaryResolution.evidence_citations)
      ? primaryResolution.evidence_citations.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
        )
      : [];
  const citationStatus = formatUnverifiedNodeValue(
    data.citation_status ?? primaryResolution.citation_status,
  );
  const unknowns = Array.isArray(primaryResolution.unknowns)
    ? primaryResolution.unknowns.map(formatUnverifiedNodeValue).filter(Boolean)
    : [];
  const toolSubmission =
    data.agent_resolution_tool_submission &&
    typeof data.agent_resolution_tool_submission === "object" &&
    !Array.isArray(data.agent_resolution_tool_submission)
      ? (data.agent_resolution_tool_submission as Record<string, unknown>)
      : null;
  const conversationTrace = Array.isArray(data.agent_resolution_conversation_trace)
    ? data.agent_resolution_conversation_trace.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
    : [];
  const resolvedItems = resolutions.map((resolution, index) => {
    const blueprintLabel = getBestResolutionBlueprintLabel(
      data,
      blueprints ?? {},
      resolution
    );
    return {
      index,
      resolution,
      blueprintLabel,
      title:
        formatUnverifiedNodeValue(resolution.display_name) ||
        formatUnverifiedNodeValue(resolution.name) ||
        formatUnverifiedNodeValue(resolution.title) ||
        title,
      confidence: formatUnverifiedNodeValue(resolution.confidence),
      canResolve: Boolean(blueprintLabel && blueprints?.[blueprintLabel]),
    };
  });
  const resolvableCount = resolvedItems.filter((item) => item.canResolve).length;
  const canResolve = resolvableCount > 0;
  const duplicateQueue = Array.isArray(data.agent_duplicate_queue)
    ? data.agent_duplicate_queue.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
    : [];
  const isMergeQueued = data.__resolutionStatus === "merge_queue";
  const primaryBlueprintLabel =
    resolvedItems.find((item) => item.canResolve)?.blueprintLabel ??
    resolvedItems[0]?.blueprintLabel ??
    "";

  const handleResolve = async () => {
    if (!canResolve || isResolving) return;
    setIsResolving(true);
    try {
      await onResolveToBlueprint(
        entity,
        resolvedItems.filter((item) => item.canResolve)
      );
    } finally {
      setIsResolving(false);
    }
  };

  const handleMergeBest = async () => {
    if (!duplicateQueue.length || isMerging) return;
    setIsMerging(true);
    try {
      await onResolveToBlueprint(
        entity,
        resolvedItems.filter((item) => item.canResolve),
        { duplicateMode: "mergeBest" }
      );
    } finally {
      setIsMerging(false);
    }
  };

  const handleForceCreate = async () => {
    if (!canResolve || isForceCreating) return;
    setIsForceCreating(true);
    try {
      await onResolveToBlueprint(
        entity,
        resolvedItems.filter((item) => item.canResolve),
        { duplicateMode: "forceCreate" }
      );
    } finally {
      setIsForceCreating(false);
    }
  };

  return (
    <>
      <div className={`unverified-node-hint relative h-15 w-15 text-ink${isSoloSelected ? " is-selected" : ""}`}>
        <div className="absolute left-0 top-0 z-5 flex h-15 w-15 items-center justify-center">
          <span className="unverified-node-hover-field pointer-events-none absolute -left-1/2 -top-1/2 h-42 w-42 translate-x-1/2 translate-y-1/2 rounded-full bg-ink/1" />
          <span className="unverified-node-glow pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 rounded-full" />
          <span className="z-3 block h-15 w-15 rounded-full border border-ink/20 bg-paper/40" />
          <Icon
            icon="alert-triangle"
            className="absolute z-4 h-4 w-4 text-amber-500"
          />
        </div>

        <div className="unverified-node-leader pointer-events-none absolute left-7.5 top-7.5 z-6 h-px w-30 origin-left bg-ink" />
        <div className="unverified-node-leader-angled pointer-events-none absolute left-7.5 top-7.5 z-6 h-px w-12 origin-left bg-ink" />

        <div className="unverified-node-panel pointer-events-none absolute left-14 top-7.5 z-5 flex max-h-96 w-82 max-w-96 flex-col overflow-hidden rounded-md border border-ink/10 bg-paper/95 shadow-[0_22px_80px_rgba(0,0,0,0.62)] ring-1 ring-inset ring-ink/3 backdrop-blur-[2px]">
          <div className="pointer-events-none absolute bottom-3 right-3 h-3 w-12 border-b border-r border-ink/14" />
          <div className="pointer-events-none absolute left-3 top-3  h-3 w-10 border-t border-l border-ink/10" />
          <div className="pointer-events-none absolute right-3 top-3  h-18 w-18 rounded-full border border-ink/10">
            <div className="absolute inset-2 rounded-full border border-ink/7" />
            <div className="absolute inset-4 rounded-full border border-ink/5" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-3.5 w-3.5 rotate-45 border border-ink/20">
                <div className="absolute inset-0.75 border border-ink/10" />
              </div>
            </div>
          </div>

          <div className="relative  px-4 pb-3 pt-4">
            <p className="font-display text-[10px] uppercase tracking-[0.34em] text-ink-soft">
              {t("graph.unverified.unverified")}
            </p>
            <h2 className="mt-1 line-clamp-3 font-display text-base leading-6 text-ink wrap-anywhere">
              {title}
            </h2>
            <div className="mt-3 h-px w-28 bg-ink/14" />
          </div>

          <div className="unverified-node-meta nodrag nowheel relative grid min-h-0 gap-2 overflow-y-auto px-4 pb-4 text-[11px] leading-5 text-ink-hard">
            {resolver && (
              <p className="wrap-anywhere">
                {t("graph.unverified.resolvedBy")}{" "}
                <span className="text-ink-soft">{resolver}</span>
              </p>
            )}
            {source && (
              <p className="wrap-anywhere">
                {t("graph.unverified.source")}{" "}
                <span className="text-ink-soft">{source}</span>
              </p>
            )}
            {primaryBlueprintLabel && (
              <p className="wrap-anywhere">
                {t("graph.unverified.blueprint")}{" "}
                <span className="text-ink-soft">
                  {primaryBlueprintLabel}
                </span>
              </p>
            )}
            {confidence && (
              <p className="wrap-anywhere">
                {t("graph.unverified.confidence")}{" "}
                <span className="text-ink-soft">{confidence}</span>
              </p>
            )}
            {resolvedItems.length > 1 && (
              <details className="rounded-sm border border-ink/8 bg-ink/3 px-2 py-2">
                <summary className="cursor-pointer font-display text-[9px] uppercase tracking-[0.22em] text-ink-soft">
                  {t("graph.unverified.entities", {
                    count: resolvedItems.length,
                  })}
                </summary>
                <div className="mt-2 grid gap-2">
                  {resolvedItems.map((item) => (
                    <div
                      key={`candidate-${item.index}`}
                      className="rounded-sm border border-ink/8 bg-black/15 px-2 py-2"
                    >
                      <p className="font-display text-[10px] uppercase tracking-[0.12em] text-ink-soft wrap-anywhere">
                        {item.title}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-hard/70 wrap-anywhere">
                        {item.blueprintLabel ||
                          t("graph.unverified.noMatchingBlueprint")}
                        {item.confidence ? ` · ${item.confidence}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {isMergeQueued && duplicateQueue.length > 0 && (
              <details
                open
                className="rounded-sm border border-amber-400/20 bg-amber-400/8 px-2 py-2"
              >
                <summary className="cursor-pointer font-display text-[9px] uppercase tracking-[0.22em] text-amber-300/80">
                  {t("graph.unverified.mergeQueue", {
                    count: duplicateQueue.length,
                  })}
                </summary>
                <div className="mt-2 grid gap-2">
                  {duplicateQueue.map((item, index) => (
                    <div
                      key={`duplicate-${index}`}
                      className="rounded-sm border border-ink/8 bg-black/15 px-2 py-2"
                    >
                      <p className="font-display text-[10px] uppercase tracking-[0.12em] text-ink-soft wrap-anywhere">
                        {formatUnverifiedNodeValue(item.title) ||
                          t("graph.unverified.possibleDuplicate")}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-hard/70 wrap-anywhere">
                        {t("graph.unverified.candidate")}{" "}
                        {formatUnverifiedNodeValue(item.candidate_label) ||
                          formatUnverifiedNodeValue(item.candidate_entity_id)}
                        {Number.isFinite(Number(item.score))
                          ? ` · ${Math.round(Number(item.score) * 100)}%`
                          : ""}
                      </p>
                      {formatUnverifiedNodeValue(item.reason) && (
                        <p className="mt-1 text-[10px] text-ink-hard/55 wrap-anywhere">
                          {formatUnverifiedNodeValue(item.reason)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <details className="rounded-sm border border-ink/8 bg-ink/3 px-2 py-2 open:bg-ink/5">
              <summary className="cursor-pointer font-display text-[9px] uppercase tracking-[0.22em] text-ink-soft">
                {t("graph.unverified.reasoning")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap font-code text-[10px] leading-5 text-ink-hard/85">
                {graphReason || summary || "No reasoning returned."}
              </p>
            </details>
            {(evidence.length > 0 || evidenceCitations.length > 0 || unknowns.length > 0) && (
              <details className="rounded-sm border border-ink/8 bg-ink/3 px-2 py-2">
                <summary className="cursor-pointer font-display text-[9px] uppercase tracking-[0.22em] text-ink-soft">
                  Evidence{citationStatus ? ` (${citationStatus})` : ""}
                </summary>
                {evidenceCitations.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 font-code text-[10px] leading-5 text-ink-hard/85">
                    {evidenceCitations.map((item, index) => {
                      const url = formatUnverifiedNodeValue(item.url);
                      const observation = formatUnverifiedNodeValue(item.observation);
                      const status = formatUnverifiedNodeValue(item.status);
                      return (
                        <li key={`citation-${index}`}>
                          {url || observation}
                          {status ? ` [${status}]` : ""}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {evidence.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 font-code text-[10px] leading-5 text-ink-hard/85">
                    {evidence.map((item, index) => (
                      <li key={`evidence-${index}`}>{item}</li>
                    ))}
                  </ul>
                )}
                {unknowns.length > 0 && (
                  <p className="mt-2 whitespace-pre-wrap font-code text-[10px] leading-5 text-ink-hard/65">
                    Unknowns: {unknowns.join(", ")}
                  </p>
                )}
              </details>
            )}
            {summary && (
              <p className="whitespace-pre-wrap rounded-sm border border-ink/8 bg-ink/3 px-2 py-2 font-code text-[10px] leading-5 text-ink-hard/85">
                {summary}
              </p>
            )}
            {(toolSubmission || conversationTrace.length > 0) && (
              <div className="rounded-sm border border-ink/8 bg-ink/3">
                <Collapsible
                  compact
                  startOpen={false}
                  title={
                    <span className="truncate">
                      Resolution trace ({conversationTrace.length})
                    </span>
                  }
                >
                  <div className="grid max-h-48 gap-2 overflow-y-auto px-3 pb-3 font-code text-[10px] leading-5 text-ink-hard/80">
                    {toolSubmission && (
                      <div className="rounded-sm border border-ink/8 bg-black/15 px-2 py-2">
                        <p className="font-display text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                          Tool submission
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap wrap-anywhere">
                          {formatUnverifiedNodeValue(toolSubmission)}
                        </pre>
                      </div>
                    )}
                    {conversationTrace.map((entry, index) => (
                      <div
                        key={`trace-${index}`}
                        className="rounded-sm border border-ink/8 bg-black/15 px-2 py-2"
                      >
                        <p className="font-display text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                          {formatUnverifiedNodeValue(entry.role) || "message"}{" "}
                          {formatUnverifiedNodeValue(entry.index)}
                        </p>
                        {formatUnverifiedNodeValue(entry.tool_calls) && (
                          <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sea/80">
                            tools: {formatUnverifiedNodeValue(entry.tool_calls)}
                          </p>
                        )}
                        {formatUnverifiedNodeValue(entry.content) && (
                          <p className="mt-1 whitespace-pre-wrap wrap-anywhere">
                            {formatUnverifiedNodeValue(entry.content)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Collapsible>
              </div>
            )}
            <button
              type="button"
              disabled={!canResolve || isResolving}
              onClick={handleResolve}
              className="mt-1 inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-sea/30 bg-sea/10 px-2 font-display text-[9px] uppercase tracking-[0.18em] text-sea transition-colors enabled:hover:border-sea/60 enabled:hover:bg-sea/15 disabled:cursor-not-allowed disabled:border-ink/10 disabled:bg-ink/5 disabled:text-ink-hard/40"
              title={
                canResolve
                  ? `Resolve ${resolvableCount} entit${
                      resolvableCount === 1 ? "y" : "ies"
                    }`
                  : "No matching Python blueprint was found for this resolution"
              }
            >
              <Icon icon="check" className="h-3 w-3" />
              <span>
                {isResolving
                  ? "Resolving"
                  : canResolve
                    ? isMergeQueued
                      ? "Check again"
                      : `Resolve ${resolvableCount}`
                    : "No blueprint"}
              </span>
            </button>
            {isMergeQueued && duplicateQueue.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isMerging}
                  onClick={handleMergeBest}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 font-display text-[9px] uppercase tracking-[0.18em] text-amber-300 transition-colors enabled:hover:border-amber-300/60 enabled:hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:border-ink/10 disabled:bg-ink/5 disabled:text-ink-hard/40"
                  title="Merge this unverified entity into the highest scoring duplicate"
                >
                  <Icon icon="git-merge" className="h-3 w-3" />
                  <span>{isMerging ? "Merging" : "Merge best"}</span>
                </button>
                <button
                  type="button"
                  disabled={!canResolve || isForceCreating}
                  onClick={handleForceCreate}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-ink/14 bg-ink/5 px-2 font-display text-[9px] uppercase tracking-[0.18em] text-ink-soft transition-colors enabled:hover:border-sea/40 enabled:hover:text-sea disabled:cursor-not-allowed disabled:text-ink-hard/40"
                  title="Create a separate verified entity despite the duplicate queue"
                >
                  <Icon icon="plus" className="h-3 w-3" />
                  <span>{isForceCreating ? "Creating" : "Separate"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <EntityHandles />
    </>
  );
}

export default memo(UnverifiedEntityNode);
