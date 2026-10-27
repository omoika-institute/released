import { FunctionComponent } from "preact";

type ActivityGridProps = {
  data?: Record<string, number>; // Map of ISO date (YYYY-MM-DD) to count
  size?: number; // Cell size in pixels
  gap?: number; // Gap between cells in pixels
  maxCount?: number; // Optional max to normalize color scale
  showHeader?: boolean;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

// Helper to format a Date as YYYY-MM-DD in local time
const fmt = (d: Date) => {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Sea activity scale with stepped opacity for the dark OMOIKA surface.
const COLOR_SCALE = [
  "rgba(29,45,245,0.05)", // 0 (no events)
  "rgba(29,45,245,0.16)", // 1
  "rgba(29,45,245,0.32)", // 2
  "rgba(29,45,245,0.58)", // 3
  "rgba(29,45,245,0.88)", // 4 (many events)
];

const levelFor = (count: number, max: number) => {
  if (max <= 0) return 0;
  // Map count to 0..4
  if (count <= 0) return 0;
  const r = count / max;
  if (r < 0.25) return 1;
  if (r < 0.5) return 2;
  if (r < 0.75) return 3;
  return 4;
};

const ActivityGrid: FunctionComponent<ActivityGridProps> = ({
  data = {},
  size = 16,
  gap = 4,
  maxCount,
  showHeader = true,
  orientation = "horizontal",
  className = "",
}) => {
  // Fixed display window of ~1 year
  const WEEKS = 53;
  // Build a matrix of days ending today, column = week, row = weekday (Sun..Sat)
  const today = new Date();
  // Align to end of current week (so the last column is current week)
  const end = new Date(today);
  const daysToSunday = end.getDay(); // 0=Sun
  // We want last column to end on Saturday; shift to Saturday of current week
  const endShift = 6 - daysToSunday;
  end.setDate(end.getDate() + endShift);

  const totalDays = WEEKS * 7;
  const dates: Date[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    dates.push(d);
  }

  // Compute max for color normalization if not provided
  let computedMax = 0;
  if (maxCount == null) {
    for (const d of dates) {
      const key = fmt(d);
      const v = data[key] ?? 0;
      if (v > computedMax) computedMax = v;
    }
  }
  const MAX = maxCount ?? computedMax;

  // Grid template: columns = weeks, rows = 7
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${WEEKS}, ${size}px)`,
    gridTemplateRows: `repeat(7, ${size}px)`,
    gridAutoFlow: "column",
    gap: `${gap}px`,
  } as any;

  // Left day labels column uses same row sizing to align with grid
  const dayColStyle = {
    display: "grid",
    gridTemplateRows: `repeat(7, ${size}px)`,
    gap: `${gap}px`,
  } as any;

  // Month labels row aligned with columns
  const monthRowStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${WEEKS}, ${size}px)`,
    gap: `${gap}px`,
  } as any;
  const verticalGridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(7, ${size}px)`,
    gridTemplateRows: `repeat(${WEEKS}, ${size}px)`,
    gap: `${gap}px`,
  } as any;
  const verticalDayRowStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(7, ${size}px)`,
    gap: `${gap}px`,
  } as any;
  const verticalMonthColStyle = {
    display: "grid",
    gridTemplateRows: `repeat(${WEEKS}, ${size}px)`,
    gap: `${gap}px`,
  } as any;

  // Compute month segments that span entire month across columns
  type MonthSeg = { startCol: number; span: number; label: string };
  const monthSegs: MonthSeg[] = [];
  for (let c = 0; c < WEEKS; c++) {
    const startIdx = c * 7;
    const startDate = dates[startIdx];
    if (!startDate) continue;
    const curMonth = startDate.getMonth();
    const curYear = startDate.getFullYear();
    const curLabel = `${startDate.toLocaleString(undefined, { month: "short" })}`;
    if (monthSegs.length === 0) {
      monthSegs.push({ startCol: c + 1, span: 1, label: curLabel });
      continue;
    }
    const last = monthSegs[monthSegs.length - 1];
    const lastStartIdx = (last.startCol - 1) * 7;
    const lastDate = dates[lastStartIdx];
    const lastMonth = lastDate?.getMonth();
    const lastYear = lastDate?.getFullYear();
    if (lastMonth === curMonth && lastYear === curYear) {
      last.span += 1;
    } else {
      monthSegs.push({ startCol: c + 1, span: 1, label: curLabel });
    }
  }

  return (
    <div
      className={`relative w-full flex flex-col items-center ${showHeader ? "rounded-sm border border-ink/10  pt-0" : "pt-2"} ${className}`}
    >
      {orientation === "vertical" ? (
        <>
          <div className="relative flex h-full w-full flex-col overflow-hidden px-2 ">
            <div className="relative mb-1 flex items-start justify-between ">
              <div>
                <p className="font-display text-[10px] uppercase tracking-[0.3em] text-ink-hard/65">
                  Activity
                </p>
              </div>
              <div className="rounded-sm border border-sea/12 bg-transparent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-sea/55">
                365d
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 justify-center overflow-hidden">
              <div
                style={verticalMonthColStyle}
                className="mt-6 text-[10px] text-ink-hard/36"
              >
                {monthSegs.map((seg, idx) => (
                  <div
                    key={`${seg.label}-${idx}`}
                    className="flex items-start justify-end pr-3"
                    style={{
                      gridRow: `${seg.startCol} / span ${seg.span}`,
                      height: `${seg.span * size + Math.max(0, seg.span - 1) * gap}px`,
                      width: 42,
                    }}
                    title={seg.label}
                  >
                    {seg.label}
                  </div>
                ))}
              </div>
              <div className="relative">
                <div
                  style={verticalDayRowStyle}
                  className="relative mb-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-ink-hard/32"
                >
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                    <div key={`${day}-${index}`}>{day}</div>
                  ))}
                </div>
                <div
                  style={verticalGridStyle}
                  className="relative"
                  aria-label="Activity heatmap grid"
                >
                  {dates.map((d) => {
                    const key = fmt(d);
                    const count = data[key] ?? 0;
                    const level = levelFor(count, MAX);
                    const bg = COLOR_SCALE[level];
                    return (
                      <div
                        key={key}
                        title={`${key}: ${count} event${count === 1 ? "" : "s"}`}
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          backgroundColor: bg,
                          borderRadius: 2,
                          border:
                            level === 0
                              ? "1px solid rgba(29,45,245,0.08)"
                              : "1px solid rgba(29,45,245,0.22)",
                          boxShadow:
                            level >= 4
                              ? "0 0 6px rgba(29,45,245,0.14)"
                              : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="relative mt-3 flex shrink-0 items-center justify-center gap-2 border-t border-ink/6 pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
              <span>Less</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <span
                    key={lvl}
                    style={{
                      width: `${Math.max(8, size - 1)}px`,
                      height: `${Math.max(8, size - 1)}px`,
                      backgroundColor: COLOR_SCALE[lvl],
                      borderRadius: 2,
                      border:
                        lvl === 0
                          ? "1px solid rgba(29,45,245,0.08)"
                          : "1px solid rgba(29,45,245,0.22)",
                      display: "inline-block",
                    }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Month labels row */}
          <div className="flex items-start">
            <div style={{ width: 26 }} />
            <div
              style={monthRowStyle}
              className="ml-1 mt-0.5 text-[10px] text-ink-hard/50"
            >
              {monthSegs.map((seg, idx) => (
                <div
                  key={`${seg.label}-${idx}`}
                  style={{ gridColumn: `${seg.startCol} / span ${seg.span}` }}
                  className="truncate"
                  title={seg.label}
                >
                  {seg.label}
                </div>
              ))}
            </div>
          </div>

          {/* Grid with left day labels */}
          <div className="mt-1 flex items-start">
            <div style={dayColStyle} className="text-[10px] text-ink-hard/50">
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <div
                  key={row}
                  className="flex items-center justify-end pr-1.5"
                  style={{ width: 26 }}
                >
                  {row === 1
                    ? "Mon"
                    : row === 3
                      ? "Wed"
                      : row === 5
                        ? "Fri"
                        : ""}
                </div>
              ))}
            </div>
            <div style={gridStyle} aria-label="Activity heatmap grid">
              {dates.map((d) => {
                const key = fmt(d);
                const count = data[key] ?? 0;
                const level = levelFor(count, MAX);
                const bg = COLOR_SCALE[level];
                return (
                  <div
                    key={key}
                    title={`${key}: ${count} event${count === 1 ? "" : "s"}`}
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      backgroundColor: bg,
                      borderRadius: 2,
                      border: "1px solid rgba(15,23,42,0.6)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 mr-auto flex items-center gap-2 text-[10px] text-ink-hard/50">
            Less
            {[0, 1, 2, 3, 4].map((lvl) => (
              <span
                key={lvl}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: COLOR_SCALE[lvl],
                  borderRadius: 2,
                  border: "1px solid rgba(15,23,42,0.6)",
                  display: "inline-block",
                }}
              />
            ))}
            More
          </div>
        </>
      )}
    </div>
  );
};

export default ActivityGrid;

// Utility to build a dataset from an array of ISO strings
export const buildActivityData = (
  isoDates: string[]
): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const iso of isoDates) {
    // Normalize to local date (YYYY-MM-DD)
    const d = new Date(iso);
    const key = fmt(d);
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
};
