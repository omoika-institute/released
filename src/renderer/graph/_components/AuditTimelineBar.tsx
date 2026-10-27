import { Icon } from "@/components/icons";
import { useCallback, useMemo, useState } from "preact/hooks";

type AuditTimelineEntry = {
  id: string;
  kind: "entity" | "edge";
  label: string;
  meta: string;
  time: number | null;
  nodeId?: string;
  edgeId?: string;
};

type TimelineVisibleWindow = {
  zoom: number;
  start: number;
  width: number;
  maxPan: number;
};

type TimelineVisualizationMethod =
  | "timebar"
  | "rings"
  | "layers"
  | "matrix"
  | "gantt";

interface AuditTimelineBarProps {
  timelineActiveEntry: AuditTimelineEntry | null;
  timelineAuditEntries: AuditTimelineEntry[];
  timelineCursorIndex: number;
  timelineVisibleWindow: TimelineVisibleWindow;
  timelineZoom: number;
  getTimelineEntryVisiblePosition: (
    entry: AuditTimelineEntry,
    index: number
  ) => number;
  handleTimelineWheel: (event: WheelEvent) => void;
  jumpToTimelineEntry: (index: number) => void;
  scrubTimelineAtVisiblePercent: (percent: number) => void;
  closeTimelineBar: () => void;
  setTimelinePan: (pan: number) => void;
  setTimelineZoomFromCenter: (zoom: number) => void;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const formatAuditTime = (timestamp: number | null) => {
  if (timestamp === null) return "time unknown";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTickLabel = (timestamp: number | null, fallback: string) => {
  if (timestamp === null) return fallback;
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

const timelineVisualizationMethods: Array<{
  id: TimelineVisualizationMethod;
  label: string;
  icon: string;
}> = [
  { id: "timebar", label: "Time Bar", icon: "chart-histogram" },
  { id: "rings", label: "Tree Rings", icon: "circles" },
  { id: "layers", label: "3D Layers", icon: "stack" },
  { id: "matrix", label: "Matrices", icon: "grid-3x3" },
  { id: "gantt", label: "Gantt", icon: "timeline-event" },
];

export function AuditTimelineBar({
  timelineActiveEntry,
  timelineAuditEntries,
  timelineCursorIndex,
  timelineVisibleWindow,
  timelineZoom,
  getTimelineEntryVisiblePosition,
  handleTimelineWheel,
  jumpToTimelineEntry,
  scrubTimelineAtVisiblePercent,
  closeTimelineBar,
  setTimelinePan,
  setTimelineZoomFromCenter,
}: AuditTimelineBarProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [visualizationMethod, setVisualizationMethod] =
    useState<TimelineVisualizationMethod>("timebar");
  const activePosition =
    timelineActiveEntry && timelineAuditEntries.length
      ? getTimelineEntryVisiblePosition(timelineActiveEntry, timelineCursorIndex)
      : 100;
  const timelineScrollbarProgress =
    timelineVisibleWindow.maxPan > 0
      ? clampPercent(
          (timelineVisibleWindow.start / timelineVisibleWindow.maxPan) * 100
        )
      : 0;

  const visibleActivity = useMemo(() => {
    const bucketCount = 42;
    const buckets = Array.from({ length: bucketCount }, () => ({
      entity: 0,
      edge: 0,
    }));

    timelineAuditEntries.forEach((entry, index) => {
      const position = getTimelineEntryVisiblePosition(entry, index);
      if (position < 0 || position > 100) return;
      const bucket = Math.min(
        bucketCount - 1,
        Math.max(0, Math.round((position / 100) * (bucketCount - 1)))
      );
      buckets[bucket][entry.kind] += 1;
    });

    const max = Math.max(
      1,
      ...buckets.map((bucket) => bucket.entity + bucket.edge)
    );
    return buckets.map((bucket) => ({
      ...bucket,
      total: bucket.entity + bucket.edge,
      height: ((bucket.entity + bucket.edge) / max) * 100,
      entityHeight: (bucket.entity / max) * 100,
      edgeHeight: (bucket.edge / max) * 100,
    }));
  }, [getTimelineEntryVisiblePosition, timelineAuditEntries]);

  const visibleTicks = useMemo(() => {
    if (!timelineAuditEntries.length) {
      return ["Start", "Middle", "Latest"].map((label, index) => ({
        label,
        position: index * 50,
      }));
    }

    return [0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
      const entryIndex = Math.min(
        timelineAuditEntries.length - 1,
        Math.round((timelineAuditEntries.length - 1) * ratio)
      );
      return {
        position: ratio * 100,
        label: formatTickLabel(
          timelineAuditEntries[entryIndex]?.time ?? null,
          index === 0 ? "Start" : index === 4 ? "Latest" : ""
        ),
      };
    });
  }, [timelineAuditEntries]);

  const getScrubPercent = useCallback((event: PointerEvent) => {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    if (!rect.width) return 0;
    return clampPercent(((event.clientX - rect.left) / rect.width) * 100);
  }, []);

  const handleScrubPointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture?.(event.pointerId);
      setIsScrubbing(true);
      scrubTimelineAtVisiblePercent(getScrubPercent(event));
    },
    [getScrubPercent, scrubTimelineAtVisiblePercent]
  );

  const handleScrubPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!isScrubbing) return;
      scrubTimelineAtVisiblePercent(getScrubPercent(event));
    },
    [getScrubPercent, isScrubbing, scrubTimelineAtVisiblePercent]
  );

  const handleScrubPointerEnd = useCallback((event: PointerEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.releasePointerCapture?.(event.pointerId);
    setIsScrubbing(false);
  }, []);

  return (
    <section
      className="pointer-events-auto absolute bottom-0 left-10 right-0 z-[950] h-[240px] overflow-hidden border-t border-ink-hard/12 bg-cod-950/92 text-ink shadow-[0_-12px_40px_rgba(0,0,0,0.42)] backdrop-blur-sm"
      aria-label="Case graph audit history"
    >
      <style>{`
        .audit-timeline-scrollbar,
        .audit-timeline-scrollbar:focus,
        .audit-timeline-scrollbar:focus-visible {
          appearance: none;
          background: transparent;
          border: 0;
          box-shadow: none;
          display: block;
          height: 12px;
          margin: 0;
          outline: none;
          padding: 0;
        }

        .audit-timeline-scrollbar::-webkit-slider-runnable-track {
          height: 4px;
          background: transparent;
          border: 0;
          border-radius: 2px;
        }

        .audit-timeline-scrollbar::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
          background: var(--color-sea);
          border: 1px solid var(--color-sea);
          border-radius: 9999px;
          box-shadow: none;
        }

        .audit-timeline-scrollbar:focus::-webkit-slider-runnable-track,
        .audit-timeline-scrollbar:focus-visible::-webkit-slider-runnable-track,
        .audit-timeline-scrollbar:focus::-webkit-slider-thumb,
        .audit-timeline-scrollbar:focus-visible::-webkit-slider-thumb {
          box-shadow: none;
          outline: none;
        }

        .audit-timeline-scrollbar::-moz-range-track {
          height: 4px;
          background: transparent;
          border: 0;
          border-radius: 2px;
        }

        .audit-timeline-scrollbar::-moz-range-progress {
          height: 4px;
          background: var(--color-sea);
          border-radius: 2px;
        }

        .audit-timeline-scrollbar::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: var(--color-sea);
          border: 1px solid var(--color-sea);
          border-radius: 9999px;
          box-shadow: none;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-size-[56px_56px] opacity-35" />
      <div className="relative grid h-full grid-cols-[minmax(0,1fr)_10rem_2.5rem] items-stretch">
        <div
          className="relative min-w-0 border-r border-ink-hard/10 px-5 pb-5 pt-0"
          onWheel={handleTimelineWheel}
        >
          <div className="absolute left-1/2 top-1 z-30 flex -translate-x-1/2 items-center border border-ink-hard/12 bg-paper/80 shadow-[0_8px_18px_rgba(0,0,0,0.25)] backdrop-blur-sm">
            <button
              type="button"
              disabled={timelineCursorIndex <= 0}
              onClick={() => jumpToTimelineEntry(0)}
              className="grid h-6 w-6 place-items-center border-r border-ink-hard/10 text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Rewind to first graph audit event"
              aria-label="Rewind to first graph audit event"
            >
              <Icon icon="player-skip-back" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={timelineCursorIndex <= 0}
              onClick={() => jumpToTimelineEntry(timelineCursorIndex - 1)}
              className="grid h-6 w-6 place-items-center border-r border-ink-hard/10 text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Step back"
              aria-label="Step back"
            >
              <Icon icon="chevron-left" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTimelineZoomFromCenter(timelineZoom / 1.35)}
              disabled={timelineZoom <= 1}
              className="grid h-6 w-6 place-items-center border-r border-ink-hard/10 text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Zoom audit timeline out"
              aria-label="Zoom audit timeline out"
            >
              <Icon icon="minus" className="h-3.5 w-3.5" />
            </button>
            <div className="h-6 min-w-14 border-r border-ink-hard/10 px-2 text-center font-mono text-[8px] leading-6 text-ink-hard/65">
              {Math.round(timelineVisibleWindow.zoom * 100)}%
            </div>
            <button
              type="button"
              onClick={() => setTimelineZoomFromCenter(timelineZoom * 1.35)}
              disabled={timelineZoom >= 12}
              className="grid h-6 w-6 place-items-center border-r border-ink-hard/10 text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Zoom audit timeline in"
              aria-label="Zoom audit timeline in"
            >
              <Icon icon="plus" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={
                !timelineAuditEntries.length ||
                timelineCursorIndex >= timelineAuditEntries.length - 1
              }
              onClick={() => jumpToTimelineEntry(timelineCursorIndex + 1)}
              className="grid h-6 w-6 place-items-center border-r border-ink-hard/10 text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Step forward"
              aria-label="Step forward"
            >
              <Icon icon="chevron-right" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={
                !timelineAuditEntries.length ||
                timelineCursorIndex >= timelineAuditEntries.length - 1
              }
              onClick={() =>
                jumpToTimelineEntry(timelineAuditEntries.length - 1)
              }
              className="grid h-6 w-6 place-items-center text-ink-hard/65 transition-colors enabled:hover:bg-sea/8 enabled:hover:text-sea disabled:cursor-not-allowed disabled:opacity-30"
              title="Fast forward to latest graph audit event"
              aria-label="Fast forward to latest graph audit event"
            >
              <Icon icon="player-skip-forward" className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="pointer-events-none absolute left-5 top-2 z-20 flex items-center gap-2">
            <span className="font-display text-[9px] uppercase tracking-[0.22em] text-ink">
              Audit History
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-hard/55">
              {timelineAuditEntries.length} changes
            </span>
          </div>
          <div className="absolute inset-x-5 top-0 h-px bg-sea/30" />
          <div className="absolute inset-x-5 bottom-5 h-px bg-ink-hard/12" />

          <div className="pointer-events-none absolute inset-x-5 top-0 bottom-5">
            {visibleTicks.map((tick, index) => (
              <div
                key={`${tick.label}-${index}`}
                className="absolute top-0 bottom-0 w-px bg-ink-hard/10"
                style={{ left: `${tick.position}%` }}
                aria-hidden="true"
              >
                <span className="absolute top-1 ml-1 whitespace-nowrap font-mono text-[8px] text-ink-hard/55">
                  {tick.label}
                </span>
              </div>
            ))}
          </div>

          {timelineAuditEntries.length === 0 ? (
            <div className="grid h-full place-items-center">
              <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-ink-hard/60">
                no graph audit points
              </p>
            </div>
          ) : (
            <div
              className="absolute inset-x-5 top-0 bottom-5 z-10 cursor-ew-resize"
              onPointerDown={handleScrubPointerDown}
              onPointerMove={handleScrubPointerMove}
              onPointerUp={handleScrubPointerEnd}
              onPointerCancel={handleScrubPointerEnd}
              aria-label="Drag audit timeline"
              role="slider"
              aria-valuemin={1}
              aria-valuemax={timelineAuditEntries.length}
              aria-valuenow={timelineCursorIndex + 1}
            >
              {visualizationMethod === "timebar" && (
                <div className="absolute inset-x-0 bottom-0 flex h-20 items-end gap-1">
                  {visibleActivity.map((bucket, index) => (
                    <span
                      key={index}
                      className="relative min-w-0 flex-1 bg-ink/10"
                      style={{
                        height: `${Math.max(4, bucket.height * 0.74)}px`,
                      }}
                      aria-hidden="true"
                    >
                      {bucket.entity > 0 && (
                        <span
                          className="absolute bottom-0 left-0 right-0 bg-sea/70"
                          style={{
                            height: `${Math.max(2, bucket.entityHeight * 0.74)}px`,
                          }}
                        />
                      )}
                      {bucket.edge > 0 && (
                        <span
                          className="absolute left-0 right-0 top-0 bg-danger/70"
                          style={{
                            height: `${Math.max(2, bucket.edgeHeight * 0.74)}px`,
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}

              {visualizationMethod === "rings" && (
                <div className="absolute inset-x-0 bottom-1 top-4">
                  {visibleActivity.map((bucket, index) => {
                    const position =
                      (index / Math.max(1, visibleActivity.length - 1)) * 100;
                    const size = Math.max(8, bucket.height * 0.32);
                    return (
                      <span
                        key={index}
                        className="absolute bottom-3 -translate-x-1/2 rounded-full border border-sea/55 bg-sea/10"
                        style={{
                          left: `${position}%`,
                          height: `${size}px`,
                          width: `${size}px`,
                          boxShadow:
                            bucket.edge > 0
                              ? "inset 0 0 0 2px rgba(248,113,113,0.5)"
                              : undefined,
                        }}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
              )}

              {visualizationMethod === "layers" && (
                <div className="absolute inset-x-0 bottom-1 top-5">
                  {[0, 1, 2].map((layer) => (
                    <div
                      key={layer}
                      className="absolute left-0 right-0 h-5 border-t border-ink-hard/12"
                      style={{ bottom: `${layer * 1.25 + 0.35}rem` }}
                    >
                      {visibleActivity.map((bucket, index) => {
                        if (bucket.total <= layer) return null;
                        return (
                          <span
                            key={`${layer}-${index}`}
                            className={`absolute bottom-0 h-3 -translate-x-1/2 ${
                              layer % 2 === 0 ? "bg-sea/65" : "bg-danger/60"
                            }`}
                            style={{
                              left: `${
                                (index / Math.max(1, visibleActivity.length - 1)) *
                                100
                              }%`,
                              width: `${Math.max(3, bucket.height * 0.08)}px`,
                            }}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {visualizationMethod === "matrix" && (
                <div className="absolute inset-x-0 bottom-1 grid h-20 grid-rows-4 gap-1">
                  {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="grid grid-cols-[repeat(42,1fr)] gap-1">
                      {visibleActivity.map((bucket, index) => {
                        const active = bucket.total > row;
                        return (
                          <span
                            key={`${row}-${index}`}
                            className={
                              active
                                ? row % 2 === 0
                                  ? "bg-sea/70"
                                  : "bg-danger/60"
                                : "bg-ink/8"
                            }
                            aria-hidden="true"
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {visualizationMethod === "gantt" && (
                <div className="absolute inset-x-0 bottom-2 top-4">
                  {timelineAuditEntries.map((entry, index) => {
                    const position = getTimelineEntryVisiblePosition(entry, index);
                    if (position < -8 || position > 108) return null;
                    return (
                      <span
                        key={entry.id}
                        className={`absolute h-2 rounded-full ${
                          entry.kind === "edge" ? "bg-danger/65" : "bg-sea/70"
                        }`}
                        style={{
                          left: `${position}%`,
                          top: `${(index % 6) * 0.62 + 0.25}rem`,
                          width: `${Math.max(14, 28 - (index % 5) * 3)}px`,
                        }}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
              )}

              {timelineAuditEntries.map((entry, index) => {
                const position = getTimelineEntryVisiblePosition(entry, index);
                if (position < -2 || position > 102) return null;
                const isActive = index === timelineCursorIndex;
                return (
                  <span
                    key={entry.id}
                    className="pointer-events-none absolute top-3 bottom-1 -translate-x-1/2"
                    style={{ left: `${position}%` }}
                    title={`${entry.label} - ${formatAuditTime(entry.time)}`}
                  >
                    <span
                      className={`block h-full w-px ${
                        isActive
                          ? "bg-ink"
                          : entry.kind === "edge"
                            ? "bg-danger/60"
                            : "bg-sea/60"
                      }`}
                    />
                    <span
                      className={`absolute left-1/2 top-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full border ${
                        isActive
                          ? "border-ink bg-ink"
                          : entry.kind === "edge"
                            ? "border-danger-soft bg-danger"
                            : "border-sea bg-sea"
                      }`}
                    />
                  </span>
                );
              })}

              {timelineActiveEntry && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-20 -translate-x-1/2"
                  style={{ left: `${activePosition}%` }}
                  aria-hidden="true"
                >
                  <span className="block h-full w-0.5 bg-ink shadow-[0_0_12px_rgba(47,211,190,0.45)]" />
                  <span className="absolute left-1/2 top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-sea bg-cod-950">
                    <span className="h-2.5 w-0.5 bg-sea" />
                  </span>
                </div>
              )}
            </div>
          )}

          {timelineVisibleWindow.zoom > 1 && (
            <div className="absolute inset-x-5 bottom-1 h-3 rounded-sm bg-black px-1">
              <span
                className="pointer-events-none absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-sm bg-sea"
                style={{
                  width: `calc((100% - 0.5rem) * ${timelineScrollbarProgress / 100})`,
                }}
                aria-hidden="true"
              />
              <input
                type="range"
                min={0}
                max={timelineVisibleWindow.maxPan}
                step={0.1}
                value={timelineVisibleWindow.start}
                onInput={(event) =>
                  setTimelinePan(
                    Number((event.currentTarget as HTMLInputElement).value)
                  )
                }
                className="audit-timeline-scrollbar relative z-10 h-3 w-full cursor-ew-resize"
                aria-label="Scroll zoomed audit timeline"
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center bg-paper/20 px-3">
          <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-ink-hard/55">
            {timelineActiveEntry
              ? `${timelineCursorIndex + 1}/${timelineAuditEntries.length}`
              : "0/0"}
          </p>
          <p className="mt-2 truncate font-display text-[9px] uppercase tracking-[0.18em] text-ink">
            {timelineActiveEntry?.label ?? "No audit event"}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-ink-hard/60">
            {timelineActiveEntry?.meta ??
              "Create graph entities to populate history"}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-sea">
            {formatAuditTime(timelineActiveEntry?.time ?? null)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[8px] uppercase tracking-[0.18em] text-ink-hard/60">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sea" />
              Entity
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-danger" />
              Edge
            </span>
          </div>
        </div>

        <div className="flex w-10 shrink-0 flex-col items-stretch border-l border-ink-hard/12 bg-paper/30">
          <button
            type="button"
            onClick={closeTimelineBar}
            className="relative grid h-10 w-10 place-items-center border-b border-ink-hard/12 text-ink-hard/60 transition-colors duration-150 hover:bg-sea/8 hover:text-sea focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sea"
            title="Hide audit history"
            aria-label="Hide audit history"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
            <Icon icon="x" className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col items-stretch justify-start">
            {timelineVisualizationMethods.map((method) => {
              const active = visualizationMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setVisualizationMethod(method.id)}
                  className={`relative grid h-10 w-10 place-items-center border-b border-ink-hard/12 text-ink-hard/60 transition-colors duration-150 hover:bg-sea/8 hover:text-sea focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sea ${
                    active ? "bg-sea/8 text-sea" : ""
                  }`}
                  title={`Use ${method.label} timeline visualization`}
                  aria-label={`Use ${method.label} timeline visualization`}
                  aria-pressed={active}
                >
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
                  <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
                  <Icon icon={method.icon} className="h-3.5 w-3.5 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
