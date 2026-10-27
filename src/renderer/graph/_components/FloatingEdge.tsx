import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { getFloatingSourceToTargetHandleParams } from "../utils";
import {
  EdgeLabelRenderer,
  useStore,
  getBezierPath,
  type Edge,
  type EdgeProps as ReactFlowEdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { useParams } from "react-router-dom";

type Pt = { x: number; y: number };

function buildPolylinePath(points: Pt[]) {
  if (!points.length) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function polylineMidpoint(points: Pt[]) {
  // pick the point at half the total path length (good enough for labels)
  if (points.length < 2) return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 };

  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    total += len;
  }

  const half = total / 2;
  let acc = 0;

  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (acc + len >= half) {
      const t = len === 0 ? 0 : (half - acc) / len;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    acc += len;
  }

  return points[points.length - 1];
}

function getPathFromSections(sections?: any[]) {
  if (!sections?.length) return null;

  // If you ever add multi-section edges later, you can concatenate.
  // For now, your JSON shows one section.
  const s = sections[0];
  const points: Pt[] = [
    s.startPoint,
    ...(s.bendPoints ?? []),
    s.endPoint,
  ].filter(Boolean);

  if (points.length < 2) return null;

  const edgePath = buildPolylinePath(points);
  const { x: labelX, y: labelY } = polylineMidpoint(points);

  return { edgePath, labelX, labelY };
}

const EMPTY_LABEL_SIZE = 16;
const MAX_LABEL_SIZE = 32;
interface FloatingEdgeProps extends ReactFlowEdgeProps {
  showLabel?: boolean;
  targetHandle?: Edge["targetHandle"];
}
const zoomSelector = (s: any) => s.transform[2] >= 0.45;

function FloatingEdge({
  id,
  source,
  target,
  selected,
  markerEnd,
  style,
  targetHandleId,
  targetHandle,
  showLabel = false,
  data,
}: FloatingEdgeProps) {
  const { hid } = useParams();

  const { updateEdge } = useReactFlow();
  const showEdgeLabel = useStore(zoomSelector);
  const [showEdgePanel, setShowEdgePanel] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState((data?.label ?? "") as string);

  const edgeInputSize =
    edgeLabel.length === 0
      ? EMPTY_LABEL_SIZE
      : Math.min(edgeLabel.length + 2, MAX_LABEL_SIZE);

  const sourceNode = useStore(
    useCallback((store) => store.nodeLookup.get(source), [source]),
  );

  const targetNode = useStore(
    useCallback((store) => store.nodeLookup.get(target), [target]),
  );

  const edgeParams = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    return getFloatingSourceToTargetHandleParams(sourceNode, targetNode);
  }, [sourceNode, targetNode]);

  const pathData = useMemo(() => {
    if (edgeParams) {
      const { sx, sy, tx, ty, sourcePos, targetPos } = edgeParams;

      const [edgePath, labelX, labelY] = getBezierPath({
        sourceX: sx,
        sourceY: sy,
        targetX: tx,
        targetY: ty,
        sourcePosition: sourcePos,
        targetPosition: targetPos,
      });
      return { edgePath, labelX, labelY, sourcePos, targetPos };
    }

    if (sourceNode || targetNode) return null;

    const fromSections = getPathFromSections(
      data?.sections as any[] | undefined,
    );
    return fromSections ? { ...fromSections } : null;
  }, [data?.sections, edgeParams, sourceNode, targetNode]);

  useEffect(() => {
    const targetPos = pathData?.targetPos;
    if (!targetPos) return;

    const currentTargetHandle = targetHandleId ?? targetHandle;
    const targetNodeHandle = targetNode?.internals?.handleBounds?.source?.find(
      ({ position }) => position === targetPos,
    );

    const updates: Pick<Edge, "targetHandle"> = {};

    if (targetNodeHandle && targetNodeHandle.id !== currentTargetHandle) {
      updates.targetHandle = targetNodeHandle.id;
    }

    if (updates.targetHandle) {
      updateEdge(id, updates);
    }
  }, [
    id,
    pathData?.targetPos,
    targetHandle,
    targetHandleId,
    targetNode,
    updateEdge,
  ]);

  const pathStyle = useMemo(
    () => ({
      ...style,
      strokeWidth: 2,
      stroke: "var(--color-review-border)",
    }),
    [style],
  );

  const handleOnBlur = useCallback(
    async (event: any) => {
      const label = event.currentTarget?.value;
      updateEdge(id, { data: { label } });
      try {
        await window.api.graph.updateEdge({
          graphId: hid as string,
          edgeId: id,
          updates: {
            data: { ...data, label },
          },
        });
      } catch (error) {
        console.error("Failed to update edge label:", error);
      }
    },
    [updateEdge, hid, id, source, target, data],
  );

  const edgeClasses = [
    "react-flow__edge-path",
    data?.isActivated ? "connected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shouldRenderLabel =
    showLabel &&
    showEdgeLabel &&
    (edgeLabel.length > 0 || selected || showEdgePanel);

  if (!pathData) {
    return null;
  }

  const { edgePath, labelX, labelY } = pathData;

  return (
    <>
      <path
        markerEnd={markerEnd as string}
        class={edgeClasses}
        d={edgePath}
        style={pathStyle}
      />

      {shouldRenderLabel && (
        <EdgeLabelRenderer>
          <div
            className="graph-edge-label relative flex max-w-10"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <div class="group relative">
              <input
                tabIndex={-1}
                value={edgeLabel}
                onBlur={handleOnBlur}
                onChange={(event) => setEdgeLabel(event.currentTarget.value)}
                onFocus={() => setShowEdgePanel(true)}
                onMouseDown={() => setShowEdgePanel(true)}
                placeholder="No label found"
                size={edgeInputSize}
                type="text"
                class="nopan nodrag hover:outline-subtle focus:outline-subtle outline-subtle/50 pointer-events-auto absolute flex field-sizing-content max-w-44 cursor-text! items-center justify-center rounded-xs bg-canvas p-px px-1 leading-none text-ellipsis text-secondary-txt outline backdrop-blur-lg ease-in placeholder:text-terminal-txt  hover:placeholder:text-subtle transition-colors duration-100 focus:text-primary-txt hover:text-secondary-txt focus:placeholder:text-secondary-txt"
              />
              {/* {showEdgePanel && (
                <div
                  title="View and edit this edges properties"
                  className={`nopan pointer-events-auto absolute -mt-8 items-end`}
                >
                  <button
                    onClick={() => setShowEdgePanel(false)}
                    class="bg-slate-925/10 hover:outline-primary/70 outline-mirage-950/70 focus:outline-mirage-500 ocus:text-danger-600 pointer-events-auto flex max-w-44 cursor-grab items-center justify-center rounded-xs bg-gradient-to-br from-black/10 to-black/15 p-1 leading-none overflow-ellipsis text-slate-600 outline backdrop-blur-xs ease-in placeholder:text-slate-800 hover:bg-slate-950/70 hover:text-blue-600/90 hover:placeholder:text-slate-800 focus:bg-black/30 focus:from-black/30 focus:to-black/35 focus:text-blue-600/80 focus:placeholder:text-slate-800"
                  >
                    <Icon
                      icon="braces"
                      className="h-4.5 w-4.5 p-px text-inherit"
                    />
                  </button>
                </div>
              )} */}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(FloatingEdge);
