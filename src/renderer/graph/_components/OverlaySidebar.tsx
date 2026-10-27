import { Icon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import type { Graph } from "@/api";

interface OverlaySidebarProps {
  graph: Graph | null;
  entitiesLabel: string;
  layoutsLabel: string;
  showEntities: boolean;
  showLayouts: boolean;
  showTimelineBar: boolean;
  timelineLabel: string;
  clearGraph: () => void;
  navigate: (to: string) => void;
  setShowDuplicateMerges: (value: boolean) => void;
  setShowEntities: (value: boolean) => void;
  setShowLayouts: (value: boolean) => void;
  setShowTimelineBar: (value: boolean) => void;
  toggleSettings: () => void;
}

export function OverlaySidebar({
  graph,
  entitiesLabel,
  layoutsLabel,
  showEntities,
  showLayouts,
  showTimelineBar,
  timelineLabel,
  clearGraph,
  navigate,
  setShowDuplicateMerges,
  setShowEntities,
  setShowLayouts,
  setShowTimelineBar,
  toggleSettings,
}: OverlaySidebarProps) {
  const sidebarButtonClass = (active: boolean) =>
    [
      "relative inline-flex h-10 w-full shrink-0 items-center justify-center border-b border-subtle/50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border",
      active
        ? "bg-panel/10 text-review-txt"
        : "bg-canvas text-primary-txt/60 hover:bg-panel/25 hover:text-review-border",
    ].join(" ");
  const sidebarBadgeClass =
    "absolute right-1 top-1 grid min-h-3 min-w-3 place-items-center rounded-full px-1 font-mono text-[8px] leading-none";

  return (
    <div
      id="appbar"
      className="pointer-events-auto absolute bottom-0 left-0 top-0 z-50 flex w-10 flex-col overflow-visible border-r border-subtle/50 bg-canvas text-primary-txt"
    >
      {/* <Tooltip content={duplicateMergesLabel} side="right" className="w-full">
        <button
          onClick={() => setShowDuplicateMerges(!showDuplicateMerges)}
          aria-label={duplicateMergesLabel}
          type="button"
          className={sidebarButtonClass(showDuplicateMerges)}
        >
          <span
            className={[
              "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
              showDuplicateMerges
                ? "bg-review-border opacity-100"
                : "bg-primary-txt/8 opacity-0",
            ].join(" ")}
          />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          <Icon icon="git-merge" className="h-3.5 w-3.5" />
          {duplicateMergeCount > 0 && (
            <span
              className={`${sidebarBadgeClass} bg-amber-300 text-black shadow-[0_0_14px_rgba(251,191,36,0.7)]`}
            >
              {duplicateMergeCount > 9 ? "9+" : duplicateMergeCount}
            </span>
          )}
        </button>
      </Tooltip> */}

      <Tooltip content={layoutsLabel} side="right" className="w-full">
        <button
          onClick={() => setShowLayouts(!showLayouts)}
          aria-label={layoutsLabel}
          type="button"
          className={sidebarButtonClass(showLayouts)}
        >
          <span
            className={[
              "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
              showLayouts
                ? "bg-review-border opacity-100"
                : "bg-primary-txt/8 opacity-0",
            ].join(" ")}
          >
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          </span>

          <Icon icon="chart-grid-dots" className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip content={entitiesLabel} side="right" className="w-full">
        <button
          onClick={() => setShowEntities(!showEntities)}
          aria-label={entitiesLabel}
          type="button"
          className={sidebarButtonClass(showEntities)}
        >
          <span
            className={[
              "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
              showEntities
                ? "text-review-border opacity-100"
                : "bg-primary-txt/8 opacity-0",
            ].join(" ")}
          >
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          </span>

          <Icon icon="ghost-3" className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip content={timelineLabel} side="right" className="w-full">
        <button
          onClick={() => setShowTimelineBar(!showTimelineBar)}
          aria-label={timelineLabel}
          type="button"
          className={sidebarButtonClass(showTimelineBar)}
        >
          <span
            className={[
              "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
              showTimelineBar
                ? "bg--border opacity-100"
                : "bg-primary-txt/8 opacity-0",
            ].join(" ")}
          >
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          </span>
          <Icon icon="timeline-event" className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip
        content="Go back to case details"
        side="right"
        className="mt-auto w-full"
      >
        <button
          className={sidebarButtonClass(false)}
          aria-label="Go back to case details"
          type="button"
          onClick={() => {
            clearGraph();
            navigate(`/dashboard/case/${graph?.id}`);
          }}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary-txt/8 opacity-0" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          <Icon icon="arrow-back" className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip content="Settings" side="right" className="w-full">
        <button
          className={sidebarButtonClass(false)}
          aria-label="Settings"
          type="button"
          onClick={() => toggleSettings()}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary-txt/8 opacity-0" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
          <Icon icon="settings" className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
