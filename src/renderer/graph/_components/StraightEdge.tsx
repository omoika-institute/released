import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  EdgeLabelRenderer,
  getStraightPath,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps as ReactFlowEdgeProps,
} from "@xyflow/react";
import { Icon } from "@/components/icons";
import { useParams } from "react-router-dom";
import { getFloatingEdgeParams } from "../utils";

interface GraphexaStraightEdgeProps extends ReactFlowEdgeProps {
  showLabel?: boolean;
  sourceHandle?: Edge["sourceHandle"];
  targetHandle?: Edge["targetHandle"];
}

const EMPTY_LABEL_SIZE = 10;
const MAX_LABEL_SIZE = 26;
const zoomSelector = (state: any) => state.transform[2] >= 0.75;

function GraphexaStraightEdge({
  id,
  source,
  target,
  selected,
  markerEnd,
  style,
  sourceHandleId,
  sourceHandle,
  targetHandleId,
  targetHandle,
  showLabel = false,
  data,
}: GraphexaStraightEdgeProps) {
  const { hid } = useParams();
  const { updateEdge } = useReactFlow();
  const showEdgeLabel = useStore(zoomSelector);
  const [showEdgePanel, setShowEdgePanel] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState((data?.label ?? "") as string);

  const sourceNode = useStore(
    useCallback((store) => store.nodeLookup.get(source), [source])
  );
  const targetNode = useStore(
    useCallback((store) => store.nodeLookup.get(target), [target])
  );
  const edgeParams = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    return getFloatingEdgeParams(sourceNode, targetNode);
  }, [sourceNode, targetNode]);

  const edgePathParams = useMemo(() => {
    if (!edgeParams) return null;

    const [edgePath, labelX, labelY] = getStraightPath({
      sourceX: edgeParams.sx,
      sourceY: edgeParams.sy,
      targetX: edgeParams.tx,
      targetY: edgeParams.ty,
    });

    return { edgePath, labelX, labelY };
  }, [edgeParams]);

  const edgeInputSize =
    edgeLabel.length === 0
      ? EMPTY_LABEL_SIZE
      : Math.min(edgeLabel.length + 2, MAX_LABEL_SIZE);
  const isUnverifiedResolutionEdge = Boolean(data?.isUnverifiedResolution);
  const edgeClasses = [
    "react-flow__edge-path",
    data?.isActivated ? "connected" : "",
    selected ? "selected" : "",
    isUnverifiedResolutionEdge ? "unverified-resolution-edge" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const pathStyle = {
    ...style,
    strokeWidth: isUnverifiedResolutionEdge ? 1.75 : 2,
    stroke: "#53504500",
  };
  const shouldRenderLabel =
    showLabel &&
    showEdgeLabel &&
    (edgeLabel.length > 0 || selected || showEdgePanel);

  useEffect(() => {
    const sourcePos = edgeParams?.sourcePos;
    const targetPos = edgeParams?.targetPos;
    if (!sourcePos || !targetPos) return;

    const currentSourceHandle = sourceHandleId ?? sourceHandle;
    const currentTargetHandle = targetHandleId ?? targetHandle;
    const sourceNodeHandle = sourceNode?.internals?.handleBounds?.source?.find(
      ({ position }) => position === sourcePos
    );
    const targetNodeHandle = targetNode?.internals?.handleBounds?.source?.find(
      ({ position }) => position === targetPos
    );

    const updates: Pick<Edge, "sourceHandle" | "targetHandle"> = {};

    if (sourceNodeHandle && sourceNodeHandle.id !== currentSourceHandle) {
      updates.sourceHandle = sourceNodeHandle.id;
    }

    if (targetNodeHandle && targetNodeHandle.id !== currentTargetHandle) {
      updates.targetHandle = targetNodeHandle.id;
    }

    if (updates.sourceHandle || updates.targetHandle) {
      updateEdge(id, updates);
    }
  }, [
    edgeParams?.sourcePos,
    edgeParams?.targetPos,
    id,
    sourceHandle,
    sourceHandleId,
    sourceNode,
    targetHandle,
    targetHandleId,
    targetNode,
    updateEdge,
  ]);

  const handleOnBlur = useCallback(
    async (event: any) => {
      const label = event.currentTarget?.value;
      updateEdge(id, { data: { ...data, label } });
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
    [data, hid, id, source, target, updateEdge]
  );

  if (!edgePathParams) return null;

  const { edgePath, labelX, labelY } = edgePathParams;

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
            className="graph-edge-label relative flex max-w-32"
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
                class="nopan nodrag hover:outline-mirage-500/70 focus:outline-primary-400 outline-mirage-600/10 pointer-events-auto absolute flex field-sizing-content max-w-44 !cursor-text items-center justify-center rounded-xs bg-slate-950/20 bg-gradient-to-br p-px px-1 text-sm leading-none overflow-ellipsis text-slate-500 outline backdrop-blur-lg backdrop-brightness-95 ease-in placeholder:text-slate-800 hover:from-black/30 hover:to-black/25 hover:text-slate-400 hover:placeholder:text-slate-800 focus:bg-black/30 focus:from-black/30 focus:to-black/35 focus:text-slate-400 focus:placeholder:text-slate-800"
              />
              {showEdgePanel && (
                <div
                  title="View and edit this edges properties"
                  className="nopan pointer-events-auto absolute -mt-8 items-end"
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
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(GraphexaStraightEdge);
