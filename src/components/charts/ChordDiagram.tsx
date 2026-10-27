import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";

type Node = {
  id: string;
  label: string;
  color: string;
};

type Link = {
  source: string;
  target: string;
  value: number;
};

interface ChordDiagramProps {
  width: number;
  height: number;
  nodes: Node[];
  links: Link[];
  innerRadius?: number;
  outerRadius?: number;
  scale?: number;
  panX?: number;
  panY?: number;
  rotation?: number;
}

const toCartesian = (
  cx: number,
  cy: number,
  r: number,
  angle: number
): { x: number; y: number } => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
});

const donutSegmentPath = (
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  start: number,
  end: number
) => {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const startOuter = toCartesian(cx, cy, outerR, start);
  const endOuter = toCartesian(cx, cy, outerR, end);
  const startInner = toCartesian(cx, cy, innerR, end);
  const endInner = toCartesian(cx, cy, innerR, start);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
};

export default function ChordDiagram({
  width,
  height,
  nodes,
  links,
  innerRadius,
  outerRadius,
  scale = 1,
  panX = 0,
  panY = 0,
  rotation = 0,
}: ChordDiagramProps) {
  const margin = 12;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2 - margin;
  const oR = outerRadius ?? maxR;
  const iR = innerRadius ?? Math.max(0, oR - 22);

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<string>();

  const tooltipContainerRef = useRef<HTMLDivElement>(null);

  const showTooltipAtEvent = (event: any, content: string) => {
    const container = tooltipContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    showTooltip({
      tooltipLeft: (event?.clientX ?? 0) - rect.left,
      tooltipTop: (event?.clientY ?? 0) - rect.top,
      tooltipData: content,
    });
  };

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n) => map.set(n.id, 0));
    links.forEach((l) => {
      map.set(l.source, (map.get(l.source) || 0) + l.value);
      map.set(l.target, (map.get(l.target) || 0) + l.value);
    });
    return map;
  }, [nodes, links]);

  const layout = useMemo(() => {
    const count = nodes.length;
    if (count === 0) return { arcs: [], nodeById: new Map<string, any>() };

    const grandTotal = Array.from(totals.values()).reduce(
      (sum, val) => sum + val,
      0
    );

    if (grandTotal === 0) {
      const padding = Math.PI * 2 * 0.02;
      const step = (Math.PI * 2 - padding * count) / count;
      const arcs = nodes.map((n, i) => {
        const start = i * (step + padding);
        const end = start + step;
        const mid = (start + end) / 2;
        return { id: n.id, label: n.label, color: n.color, start, end, mid };
      });
      const nodeById = new Map(arcs.map((a) => [a.id, a]));
      return { arcs, nodeById };
    }

    const paddingPerArc = 0.01;
    const totalPadding = paddingPerArc * count;
    const availableSpace = Math.PI * 2 - totalPadding;

    const arcs = [];
    let currentAngle = 0;

    for (const node of nodes) {
      const nodeTotal = totals.get(node.id) || 0;
      const proportion = nodeTotal / grandTotal;
      const arcSize = availableSpace * proportion;

      const start = currentAngle;
      const end = start + arcSize;
      const mid = (start + end) / 2;

      arcs.push({
        id: node.id,
        label: node.label,
        color: node.color,
        start,
        end,
        mid,
      });

      currentAngle = end + paddingPerArc;
    }

    const nodeById = new Map(arcs.map((a) => [a.id, a]));
    return { arcs, nodeById };
  }, [nodes, totals]);

  const widthScale = useMemo(() => {
    const vals = links.map((l) => l.value);
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 1;
    return scaleLinear<number>({ domain: [min, max], range: [2, 12] });
  }, [links]);

  const s = Math.max(0.2, Math.min(2, scale));

  const [selectedArc, setSelectedArc] = useState<string | null>(null);

  const [dragPan, setDragPan] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragDistRef = useRef(0);
  const pendingArcRef = useRef<string | null>(null);

  useEffect(() => {
    if (panX === 0 && panY === 0) {
      setDragPan({ x: 0, y: 0 });
    }
  }, [panX, panY]);

  const onPointerDown = (e: any) => {
    isDraggingRef.current = true;
    dragDistRef.current = 0;
    pendingArcRef.current =
      (e.target as Element)?.getAttribute?.("data-arc-id") ?? null;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    if (e?.currentTarget?.setPointerCapture && e?.pointerId != null) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (e?.preventDefault) e.preventDefault();
  };

  const onPointerMove = (e: any) => {
    if (!isDraggingRef.current) return;
    const dx = (e.clientX ?? 0) - lastPosRef.current.x;
    const dy = (e.clientY ?? 0) - lastPosRef.current.y;
    dragDistRef.current += Math.abs(dx) + Math.abs(dy);
    lastPosRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
    // Convert screen-pixel delta to SVG-coordinate delta so the diagram
    // tracks the mouse 1:1 regardless of how the SVG is scaled to fit its container.
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const svgDx = rect.width > 0 ? dx * (vbW / rect.width) : dx;
    const svgDy = rect.height > 0 ? dy * (vbH / rect.height) : dy;
    setDragPan((p) => ({ x: p.x + svgDx, y: p.y + svgDy }));
    if (e?.preventDefault) e.preventDefault();
  };

  const endDrag = (e?: any) => {
    isDraggingRef.current = false;
    if (dragDistRef.current <= 4) {
      const arcId = pendingArcRef.current;
      if (arcId) {
        setSelectedArc((prev) => (prev === arcId ? null : arcId));
      } else {
        setSelectedArc(null);
      }
    }
    pendingArcRef.current = null;
    if (e?.preventDefault) e.preventDefault();
  };

  const combinedPanX = panX + dragPan.x;
  const combinedPanY = panY + dragPan.y;

  const vbW = width + 42;
  const vbH = height + 42;

  return (
    <>
      {tooltipOpen &&
        tooltipData &&
        tooltipTop != null &&
        tooltipLeft != null && (
          <TooltipWithBounds
            key={Math.random()}
            top={tooltipTop}
            left={tooltipLeft}
            className="tooltip backdrop-blur-xl"
            style={{
              width: (tooltipData?.length ?? 6) ? tooltipData.length * 10 : 30,
            }}
          >
            <div className="flex rounded-sm border items-center justify-center border-slate-700/60 backdrop-blur-xl bg-slate-900/80 px-2 py-3 font-mono text-[10px] tracking-[0.25em] text-slate-350 uppercase absolute top-3 bottom-3 w-full">
              {tooltipData}
            </div>
          </TooltipWithBounds>
        )}
      <div
        ref={tooltipContainerRef}
        className="relative w-full h-full"
        onMouseLeave={hideTooltip as any}
      >
        <svg
          className="cursor-grab active:cursor-grabbing absolute inset-0"
          width="100%"
          height="100%"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown as any}
          onPointerMove={onPointerMove as any}
          onPointerUp={endDrag as any}
          onPointerCancel={endDrag as any}
          onPointerLeave={(event) => {
            setTimeout(() => endDrag(event), 400);
          }}
        >
          <defs>
            <radialGradient id="chord-center-fade" cx="50%" cy="50%">
              <stop offset="0%" stopColor="rgba(0,0,0,0.0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
            </radialGradient>
          </defs>
          <g
            transform={`translate(${cx + combinedPanX},${cy + combinedPanY}) rotate(${rotation}) scale(${s}) translate(${-cx},${-cy})`}
          >
            {/* soft center vignette */}
            <circle
              cx={cx}
              cy={cy}
              r={iR * 0.75}
              fill="url(#chord-center-fade)"
            />

            {/* links as curved strokes */}
            <Group>
              <g fill="none" strokeLinecap="round">
                {links.map((l, idx) => {
                  const a = layout.nodeById.get(l.source);
                  const b = layout.nodeById.get(l.target);
                  if (!a || !b) return null;
                  const p1 = toCartesian(cx, cy, iR, a.mid);
                  const p2 = toCartesian(cx, cy, iR, b.mid);
                  const c1 = { x: (p1.x + cx * 2) / 3, y: (p1.y + cy * 2) / 3 };
                  const c2 = { x: (p2.x + cx * 2) / 3, y: (p2.y + cy * 2) / 3 };
                  const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
                  const color = a.color;
                  const tooltipText = `${a.label} ⇝ ${b.label} (${l.value})`;
                  const connected =
                    !selectedArc ||
                    l.source === selectedArc ||
                    l.target === selectedArc;
                  const strokeOpacity = selectedArc
                    ? connected
                      ? 0.7
                      : 0.05
                    : 0.6;

                  return (
                    <path
                      key={idx}
                      d={d}
                      stroke={color}
                      strokeWidth={widthScale(l.value)}
                      strokeOpacity={strokeOpacity}
                      onMouseEnter={(e: any) =>
                        showTooltipAtEvent(e, tooltipText)
                      }
                      onMouseOut={hideTooltip}
                      style={{
                        pointerEvents: "stroke",
                        cursor: "pointer",
                        transition: "stroke-opacity 0.2s ease",
                      }}
                    />
                  );
                })}
              </g>
            </Group>

            {/* outer arcs */}
            <Group>
              {layout.arcs.map((arc) => {
                const total = totals.get(arc.id) || 0;
                const tooltipText = `${arc.label} // total ${total}`;
                const isSelected = arc.id === selectedArc;
                const fillOpacity = selectedArc
                  ? isSelected
                    ? 0.5
                    : 0.05
                  : 0.2;
                const strokeOpacity = selectedArc
                  ? isSelected
                    ? 1.0
                    : 0.15
                  : 0.8;

                return (
                  <path
                    key={arc.id}
                    data-arc-id={arc.id}
                    d={donutSegmentPath(cx, cy, iR, oR, arc.start, arc.end)}
                    fill={arc.color}
                    fillOpacity={fillOpacity}
                    stroke={arc.color}
                    strokeOpacity={strokeOpacity}
                    onMouseEnter={(e: any) =>
                      showTooltipAtEvent(e, tooltipText)
                    }
                    onMouseOut={hideTooltip}
                    style={{
                      cursor: "pointer",
                      transition:
                        "fill-opacity 0.2s ease, stroke-opacity 0.2s ease",
                    }}
                  />
                );
              })}
            </Group>

            {/* labels */}
            <Group>
              {layout.arcs.map((arc) => {
                const labelR = oR + 8;
                const p = toCartesian(cx, cy, labelR, arc.mid);
                const arcAngle = (arc.mid * 180) / Math.PI;

                let effectiveAngle = (arcAngle + rotation) % 360;
                if (effectiveAngle < 0) effectiveAngle += 360;

                const flip = effectiveAngle > 90 && effectiveAngle < 270;
                const textAnchor = flip ? "end" : "start";
                const inverseScale = 1 / s;
                const labelOpacity = selectedArc
                  ? arc.id === selectedArc
                    ? 1
                    : 0.2
                  : 1;

                return (
                  <g
                    key={arc.id}
                    transform={`translate(${p.x},${p.y}) scale(${inverseScale})`}
                    style={{
                      opacity: labelOpacity,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <text
                      transform={`rotate(${arcAngle + (flip ? 180 : 0)})`}
                      fill={arc.color}
                      fontSize={7}
                      fontWeight={600}
                      textAnchor={textAnchor}
                      style={{
                        textRendering: "optimizeLegibility",
                        letterSpacing: "0.3px",
                      }}
                      className="font-display"
                    >
                      {arc.label}
                    </text>
                  </g>
                );
              })}
            </Group>
          </g>
        </svg>
      </div>
    </>
  );
}
