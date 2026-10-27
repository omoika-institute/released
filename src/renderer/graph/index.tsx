import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "preact/hooks";
import { FitViewOptions, ReactFlowInstance, Viewport } from "@xyflow/react";
import { useParams, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import Graph, {
  GRAPHEXA_ALGORITHM_OPTIONS,
  GRAPHEXA_ALGORITHM_PREFIX,
  GRAPHEXA_STRAIGHT_EDGE_TYPE,
} from "./_components/Graph";
import initGraphexa, {
  layout_react_flow_graph,
} from "../../../graphexa/pkg/graphexa.js";
import graphexaWasmUrl from "../../../graphexa/pkg/graphexa_bg.wasm?url";
import TransformErrorToast from "@/components/toasts/TransformErrorToast";
import {
  useGraphStore,
  useFlowStore,
  useEntitiesStore,
  usePropertiesStore,
} from "@/stores";
import "@xyflow/react/dist/style.css";
import SettingsModal from "@/components/modals/SettingsModal";
import GlobeCard from "@/components/Globe";
import { layoutTransformGraph, mergeGraphItemsById } from "./transformLayout";
import {
  GRAPH_TRANSFORM_BROADCAST_EVENT,
  GRAPH_TRANSFORM_REMOTE_EVENT,
  type GraphTransformCollaborationDetail,
} from "./useGraphCollaboration";
import {
  getLocalPluginDirs,
  PLUGIN_CATALOG_CHANGED_EVENT,
  refreshPluginCatalog,
} from "@/renderer/plugins/catalog";

const DEFAULT_GRAPHEXA_NODE_WIDTH = 150;
const DEFAULT_GRAPHEXA_NODE_HEIGHT = 50;
const DEFAULT_GRAPHEXA_SCALE = 720;
const DEFAULT_GRAPHEXA_FORCEATLAS2_SCALING_RATIO = 1200;
const FLOATING_EDGE_TYPE = "sfloat";
let graphexaInitPromise: Promise<unknown> | null = null;

const dispatchGraphTransformBroadcast = (
  detail: GraphTransformCollaborationDetail,
) => {
  window.dispatchEvent(
    new CustomEvent<GraphTransformCollaborationDetail>(
      GRAPH_TRANSFORM_BROADCAST_EVENT,
      { detail },
    ),
  );
};

const getLayoutErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
};

const hasUsableEndpoint = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isGraphexaAlgorithm = (algorithmId: string) =>
  algorithmId.startsWith(GRAPHEXA_ALGORITHM_PREFIX);

const toGraphexaAlgorithm = (algorithmId: string) =>
  algorithmId.slice(GRAPHEXA_ALGORITHM_PREFIX.length);

const numberOption = (
  options: Record<string, unknown>,
  key: string,
  fallback: number,
) => {
  const value = Number(options[key]);
  return Number.isFinite(value) ? value : fallback;
};

const optionalNumberOption = (
  options: Record<string, unknown>,
  key: string,
) => {
  const value = Number(options[key]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const booleanOption = (
  options: Record<string, unknown>,
  key: string,
  fallback = false,
) => {
  const value = options[key];
  return typeof value === "boolean" ? value : fallback;
};

const isFinitePosition = (
  position: unknown,
): position is { x: number; y: number } => {
  const point = position as { x?: unknown; y?: unknown } | null;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
};

const samePosition = (a: any, b: any) =>
  Number.isFinite(a?.x) &&
  Number.isFinite(a?.y) &&
  Number.isFinite(b?.x) &&
  Number.isFinite(b?.y) &&
  a.x === b.x &&
  a.y === b.y;

const sameJson = (a: unknown, b: unknown) => {
  if (a === b) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
};

const stabilizeGraphCommit = (
  currentGraph: { nodes: any[]; edges: any[] },
  nextGraph: { nodes: any[]; edges: any[] },
) => {
  const currentNodeById = new Map(
    currentGraph.nodes.map((node: any) => [node.id, node]),
  );
  const currentEdgeById = new Map(
    currentGraph.edges.map((edge: any) => [edge.id, edge]),
  );

  const nodes = nextGraph.nodes.map((node: any) => {
    const current = currentNodeById.get(node.id);
    if (
      current &&
      current.type === node.type &&
      current.selected === node.selected &&
      samePosition(current.position, node.position) &&
      sameJson(current.data, node.data)
    ) {
      return current;
    }
    return node;
  });

  const edges = nextGraph.edges.map((edge: any) => {
    const current = currentEdgeById.get(edge.id);
    if (
      current &&
      current.source === edge.source &&
      current.target === edge.target &&
      current.type === edge.type &&
      current.sourceHandle === edge.sourceHandle &&
      current.targetHandle === edge.targetHandle &&
      sameJson(current.data, edge.data)
    ) {
      return current;
    }
    return edge;
  });

  return { nodes, edges };
};

const hasSubsetValue = (node: any, subsetKey: string) => {
  const directValue = node?.[subsetKey];
  const dataValue = node?.data?.[subsetKey];
  return (
    (typeof directValue === "string" && directValue.trim()) ||
    Number.isFinite(directValue) ||
    (typeof dataValue === "string" && dataValue.trim()) ||
    Number.isFinite(dataValue)
  );
};

const buildMultipartiteSubsetMap = (nodes: any[], edges: any[]) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  if (!queue.length) queue.push(...nodes.map((node) => node.id));

  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const nextRank = (rank.get(source) ?? 0) + 1;
    for (const target of outgoing.get(source) ?? []) {
      if (nextRank > (rank.get(target) ?? 0)) rank.set(target, nextRank);
      incomingCount.set(
        target,
        Math.max((incomingCount.get(target) ?? 1) - 1, 0),
      );
      if (incomingCount.get(target) === 0) queue.push(target);
    }
  }

  return nodes.reduce<Record<string, string[]>>((layers, node) => {
    const key = String(rank.get(node.id) ?? 0);
    layers[key] = [...(layers[key] ?? []), node.id];
    return layers;
  }, {});
};

const ensureGraphexaReady = () => {
  if (!graphexaInitPromise) {
    graphexaInitPromise = initGraphexa(graphexaWasmUrl);
  }
  return graphexaInitPromise;
};

export default function Graphing({ isActive = true }: { isActive?: boolean }) {
  const { hid } = useParams();
  const location = useLocation();

  const { graph, getGraph, isLoading, isError } = useGraphStore();
  const { blueprints } = useEntitiesStore();
  const {
    nodes,
    edges,
    setGraph,
    setActiveGraph,
    setPositionMode,
    setViewport,
    positionMode,
  } = useFlowStore();
  const savedViewport = useFlowStore((state) =>
    hid ? state.viewports[hid] : undefined,
  );

  const { clearTransforms } = useEntitiesStore();

  const graphRef = useRef<HTMLDivElement>(null);
  const [graphInstance, setGraphInstance] = useState<ReactFlowInstance>();
  const layoutAlgorithms = GRAPHEXA_ALGORITHM_OPTIONS;
  const [isGraphLoaded, setIsGraphLoaded] = useState(false);
  const [graphLoadingOverlayVisible, setGraphLoadingOverlayVisible] =
    useState(true);
  const [graphLoadingOverlayLeaving, setGraphLoadingOverlayLeaving] =
    useState(false);
  const [graphLoadingProgress, setGraphLoadingProgress] = useState(0);
  const initialViewportAppliedForRef = useRef<string | null>(null);
  const previousPositionModeRef = useRef(positionMode);

  const [nodesBeforeLayout, setNodesBeforeLayout] = useState(nodes);
  const [edgesBeforeLayout, setEdgesBeforeLayout] = useState(edges);
  const graphLoadRequestRef = useRef(0);
  const transformLayoutTargetRef = useRef<{
    nodes: any[];
    edges: any[];
  } | null>(null);
  const transformLayoutSessionRef = useRef<{
    id: string;
    base: { nodes: any[]; edges: any[] };
    incomingNodes: any[];
    incomingEdges: any[];
  } | null>(null);
  const transformLayoutQueueRef = useRef<Promise<any>>(Promise.resolve(null));
  const graphLoadingOverlayTimerRef = useRef<number | null>(null);
  const graphLoadingProgressFrameRef = useRef<number | null>(null);

  const completeGraphLoadingOverlay = useCallback(() => {
    if (graphLoadingOverlayTimerRef.current) {
      window.clearTimeout(graphLoadingOverlayTimerRef.current);
    }

    setGraphLoadingOverlayLeaving(true);
    graphLoadingOverlayTimerRef.current = window.setTimeout(() => {
      setGraphLoadingOverlayVisible(false);
      graphLoadingOverlayTimerRef.current = null;
    }, 1400);
  }, []);

  useEffect(
    () => () => {
      if (graphLoadingOverlayTimerRef.current) {
        window.clearTimeout(graphLoadingOverlayTimerRef.current);
      }
      if (graphLoadingProgressFrameRef.current) {
        window.cancelAnimationFrame(graphLoadingProgressFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!graphLoadingOverlayVisible || graphLoadingOverlayLeaving) return;

    if (graphLoadingProgressFrameRef.current) {
      window.cancelAnimationFrame(graphLoadingProgressFrameRef.current);
    }

    const duration = 2000;
    const targetProgress = 80;
    const startedAt = performance.now();
    setGraphLoadingProgress(0);

    const tick = (now: number) => {
      const elapsed = Math.min(now - startedAt, duration);
      const progress = Math.round((elapsed / duration) * targetProgress);
      setGraphLoadingProgress(progress);

      if (elapsed < duration) {
        graphLoadingProgressFrameRef.current =
          window.requestAnimationFrame(tick);
      } else {
        graphLoadingProgressFrameRef.current = null;
      }
    };

    graphLoadingProgressFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (graphLoadingProgressFrameRef.current) {
        window.cancelAnimationFrame(graphLoadingProgressFrameRef.current);
        graphLoadingProgressFrameRef.current = null;
      }
    };
  }, [graphLoadingOverlayLeaving, graphLoadingOverlayVisible]);

  const applyTransformResultsToGraph = useCallback(
    (
      incomingNodes: any[] = [],
      incomingEdges: any[] = [],
      options: {
        sessionId?: string;
        complete?: boolean;
        suppressBroadcast?: boolean;
      } = {},
    ) => {
      if (!incomingNodes.length && !incomingEdges.length) {
        if (options.complete) {
          transformLayoutSessionRef.current = null;
        }
        return Promise.resolve(null);
      }

      transformLayoutQueueRef.current = transformLayoutQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const flowState = useFlowStore.getState();
          const layoutBase = transformLayoutTargetRef.current ?? {
            nodes: flowState.nodes,
            edges: flowState.edges,
          };
          let layoutIncomingNodes = incomingNodes;
          let layoutIncomingEdges = incomingEdges;

          if (options.sessionId) {
            if (transformLayoutSessionRef.current?.id !== options.sessionId) {
              transformLayoutSessionRef.current = {
                id: options.sessionId,
                base: layoutBase,
                incomingNodes: [],
                incomingEdges: [],
              };
            }

            const session = transformLayoutSessionRef.current;
            session.incomingNodes = mergeGraphItemsById(
              session.incomingNodes,
              incomingNodes,
            );
            session.incomingEdges = mergeGraphItemsById(
              session.incomingEdges,
              incomingEdges,
            );
            layoutIncomingNodes = session.incomingNodes;
            layoutIncomingEdges = session.incomingEdges;
          }

          const lockedBase =
            options.sessionId && transformLayoutSessionRef.current
              ? transformLayoutSessionRef.current.base
              : layoutBase;

          try {
            const nextGraph = await layoutTransformGraph({
              currentNodes: lockedBase.nodes,
              currentEdges: lockedBase.edges,
              incomingNodes: layoutIncomingNodes,
              incomingEdges: layoutIncomingEdges,
              algorithm: flowState.transformLayoutAlgorithm,
            });
            transformLayoutTargetRef.current = nextGraph;
            if (options.complete) {
              transformLayoutSessionRef.current = null;
            }
            const commitGraph = stabilizeGraphCommit(flowState, nextGraph);
            setGraph(commitGraph);
            setNodesBeforeLayout(commitGraph.nodes);
            setEdgesBeforeLayout(commitGraph.edges);
            if (!options.suppressBroadcast && hid) {
              dispatchGraphTransformBroadcast({
                graphId: hid,
                jobId: options.sessionId ?? `transform-${Date.now()}`,
                phase: options.complete ? "complete" : "result",
                message: options.complete
                  ? "Transform completed!"
                  : "Transform results updated.",
                nodes: commitGraph.nodes,
                edges: commitGraph.edges,
              });
            }
            return commitGraph;
          } catch (error) {
            console.error("[Graphexa] Failed to apply transform layout", error);
            const fallbackGraph = {
              nodes: mergeGraphItemsById(lockedBase.nodes, layoutIncomingNodes),
              edges: mergeGraphItemsById(lockedBase.edges, layoutIncomingEdges),
            };
            transformLayoutTargetRef.current = fallbackGraph;
            if (options.complete) {
              transformLayoutSessionRef.current = null;
            }
            const commitGraph = stabilizeGraphCommit(flowState, fallbackGraph);
            setGraph(commitGraph);
            setNodesBeforeLayout(commitGraph.nodes);
            setEdgesBeforeLayout(commitGraph.edges);
            if (!options.suppressBroadcast && hid) {
              dispatchGraphTransformBroadcast({
                graphId: hid,
                jobId: options.sessionId ?? `transform-${Date.now()}`,
                phase: options.complete ? "complete" : "result",
                message: options.complete
                  ? "Transform completed!"
                  : "Transform results updated.",
                nodes: commitGraph.nodes,
                edges: commitGraph.edges,
              });
            }
            return commitGraph;
          }
        });

      return transformLayoutQueueRef.current;
    },
    [hid, setGraph],
  );

  useEffect(() => {
    transformLayoutTargetRef.current = { nodes, edges };
  }, [edges, nodes]);

  // initial graph load
  useEffect(() => {
    if (!isActive || !hid) return;

    const cachedGraph = useFlowStore.getState().graphSnapshots[hid];
    if (graphLoadingOverlayTimerRef.current) {
      window.clearTimeout(graphLoadingOverlayTimerRef.current);
      graphLoadingOverlayTimerRef.current = null;
    }
    setGraphLoadingOverlayVisible(true);
    setGraphLoadingOverlayLeaving(false);
    setGraphLoadingProgress(0);
    setActiveGraph(hid);
    setIsGraphLoaded(false);
    initialViewportAppliedForRef.current = null;
    const loadRequestId = graphLoadRequestRef.current + 1;
    graphLoadRequestRef.current = loadRequestId;
    let cancelled = false;
    const isStaleLoad = () =>
      cancelled || graphLoadRequestRef.current !== loadRequestId;

    const loadGraph = async () => {
      try {
        toast.loading("Please wait while we load your graph...", {
          closeButton: true,
          isLoading: true,
          toastId: "graph",
        });
        const graphState = await window.api.graph.load(hid as string);

        if (isStaleLoad()) return;

        const { nodes, edges } = graphState;
        transformLayoutTargetRef.current = { nodes, edges };
        setGraph({ nodes, edges });
        setNodesBeforeLayout(nodes);
        setEdgesBeforeLayout(edges);
        setIsGraphLoaded(true);

        // Sync properties tabs with fresh node data
        try {
          const props = usePropertiesStore.getState();
          if (props.tabs.length) {
            for (const t of props.tabs) {
              const node = nodes.find((n: any) => n.id === t.entityId);
              if (node?.data) {
                const currStr = JSON.stringify(t.data ?? {});
                const nextStr = JSON.stringify(node.data);
                if (currStr !== nextStr) props.setData(t.entityId, node.data);
              }
            }
          }
        } catch (_) {}

        // Load plugins and blueprints after the graph is visible so plugin IO
        // cannot block reopening a graph tab indefinitely.
        void refreshPluginCatalog(getLocalPluginDirs())
          .catch((error) => {
            console.error("[FLOW] Failed to load graph plugins:", error);
          });
        void getGraph(hid);
        toast.dismiss("graph");
      } catch (error) {
        if (isStaleLoad()) return;
        console.error("[FLOW] Failed to load flow:", error);
        toast.dismiss("graph");
        toast.error(
          "We ran into an error loading your flow. If this issue persists email support@osintbuddy.com",
        );
      }
    };

    if (cachedGraph) {
      transformLayoutTargetRef.current = cachedGraph;
      setGraph(cachedGraph);
      setNodesBeforeLayout(cachedGraph.nodes);
      setEdgesBeforeLayout(cachedGraph.edges);
      setIsGraphLoaded(true);
      void refreshPluginCatalog(getLocalPluginDirs()).catch((error) => {
        console.error("[FLOW] Failed to load graph plugins:", error);
      });
      void getGraph(hid);
      toast.dismiss("graph");
    } else {
      loadGraph();
    }

    if (location.state?.showGuide) {
      // TODO
      // setCurrentTourStep(0);
      // setIsTourOpen(true);
    }
    setPositionMode("manual");

    // Subscribe and handle job events (progress, result, error)
    const unsubJob = window.api.onJobEvents((data) => {
      if (data?.events) {
        for (const event of data.events) {
          if (event.type === "progress") {
            const message =
              event.data?.message || event.data?.note || "Processing...";
            const rawPercent = event.data?.percent;
            const percent =
              typeof rawPercent === "number"
                ? rawPercent
                : rawPercent != null
                  ? Number(rawPercent)
                  : null;
            const progress =
              typeof percent === "number" &&
              Number.isFinite(percent) &&
              percent >= 0
                ? Math.min(percent, 100) / 100
                : undefined;
            if (toast.isActive(data.jobId)) {
              toast.update(data.jobId, {
                render: message,
                isLoading: true,
                progress,
                closeButton: true,
                progressClassName: "",
              });
            } else {
              toast.loading(message, {
                closeButton: true,
                isLoading: true,
                toastId: data.jobId,
                progress,
              });
            }
            if (hid) {
              dispatchGraphTransformBroadcast({
                graphId: hid,
                jobId: data.jobId,
                phase: "progress",
                message,
                progress,
              });
            }
          } else if (event.type === "result") {
            applyTransformResultsToGraph(
              Array.isArray(event.data?.entities) ? event.data.entities : [],
              Array.isArray(event.data?.edges) ? event.data.edges : [],
              { sessionId: data.jobId },
            );
          } else if (event.type === "error") {
            if (hid) {
              dispatchGraphTransformBroadcast({
                graphId: hid,
                jobId: data.jobId,
                phase: "error",
                error: event.data || "Transform failed!",
              });
            }
            toast.dismiss(data.jobId);
            toast.error(
              <TransformErrorToast error={event.data || "Transform failed!"} />,
              {
                icon: false,
                closeButton: true,
              },
            );
          }
        }
      }
    });

    const unsubTransform = window.api.onTransformCompleted((data) => {
      const { entities, edges, jobId } = data;
      applyTransformResultsToGraph(
        Array.isArray(entities) ? entities : [],
        Array.isArray(edges) ? edges : [],
        { sessionId: jobId, complete: true },
      );
      toast.dismiss(jobId);
      toast.success("Transform completed!");
    });

    const handleRemoteTransform = (event: Event) => {
      const detail = (event as CustomEvent<GraphTransformCollaborationDetail>)
        .detail;
      if (!detail || detail.graphId !== hid) return;
      const toastId = `peer-transform-${detail.jobId}`;

      if (detail.phase === "progress") {
        const message = detail.message || "Peer transform running...";
        if (toast.isActive(toastId)) {
          toast.update(toastId, {
            render: message,
            isLoading: true,
            progress: detail.progress,
            closeButton: true,
            progressClassName: "",
          });
        } else {
          toast.loading(message, {
            closeButton: true,
            isLoading: true,
            toastId,
            progress: detail.progress,
          });
        }
        return;
      }

      if (detail.phase === "error") {
        toast.dismiss(toastId);
        toast.error(
          <TransformErrorToast
            error={detail.error || "Peer transform failed!"}
          />,
          {
            icon: false,
            closeButton: true,
          },
        );
        return;
      }

      if (detail.phase === "complete") {
        toast.dismiss(toastId);
        toast.success(detail.message || "Peer transform completed!");
      }
    };

    window.addEventListener(
      GRAPH_TRANSFORM_REMOTE_EVENT,
      handleRemoteTransform as EventListener,
    );

    return () => {
      cancelled = true;
      if (graphLoadRequestRef.current === loadRequestId) {
        graphLoadRequestRef.current += 1;
      }
      unsubJob();
      unsubTransform();
      window.removeEventListener(
        GRAPH_TRANSFORM_REMOTE_EVENT,
        handleRemoteTransform as EventListener,
      );
      toast.dismiss("connection-lost");
      toast.dismiss("connection-error");
      toast.dismiss("reconnect-failed");
      toast.dismiss("graph");
      transformLayoutTargetRef.current = null;
      transformLayoutSessionRef.current = null;
      clearTransforms();
      setIsGraphLoaded(false);
    };
  }, [
    applyTransformResultsToGraph,
    clearTransforms,
    hid,
    isActive,
    setActiveGraph,
  ]);

  useEffect(() => {
    const handlePluginCatalogChanged = () => {
      void refreshPluginCatalog(getLocalPluginDirs()).catch((error) => {
        console.error("[FLOW] Failed to refresh graph plugins:", error);
      });
    };

    window.addEventListener(
      PLUGIN_CATALOG_CHANGED_EVENT,
      handlePluginCatalogChanged,
    );
    return () => {
      window.removeEventListener(
        PLUGIN_CATALOG_CHANGED_EVENT,
        handlePluginCatalogChanged,
      );
    };
  }, []);

  useEffect(
    () => () => {
      if (hid && graphInstance?.getViewport) {
        setViewport(hid, graphInstance.getViewport() as Viewport);
      }
    },
    [graphInstance, hid, setViewport],
  );

  const fitView = useCallback(
    (fitViewOptions?: FitViewOptions) => {
      if (graphInstance?.fitView) graphInstance.fitView(fitViewOptions);
    },
    [graphInstance],
  );

  useEffect(() => {
    if (!hid || !graphInstance || !isGraphLoaded) return;
    if (initialViewportAppliedForRef.current === hid) return;

    initialViewportAppliedForRef.current = hid;
    window.requestAnimationFrame(() => {
      if (!graphInstance) return;

      if (savedViewport && graphInstance.setViewport) {
        graphInstance.setViewport(savedViewport, { duration: 0 });
        window.requestAnimationFrame(completeGraphLoadingOverlay);
        return;
      }

      if (graphInstance.fitView) {
        graphInstance.fitView();
        window.requestAnimationFrame(() => {
          if (graphInstance.getViewport) {
            setViewport(hid, graphInstance.getViewport() as Viewport);
          }
          completeGraphLoadingOverlay();
        });
        return;
      }

      completeGraphLoadingOverlay();
    });
  }, [
    completeGraphLoadingOverlay,
    graphInstance,
    hid,
    isGraphLoaded,
    savedViewport,
    setViewport,
  ]);

  const resetEdgesToBezier = useCallback(
    (layoutEdges: any[]) =>
      layoutEdges.map((edge: any) => {
        const nextEdge = { ...edge };
        if (nextEdge.type === GRAPHEXA_STRAIGHT_EDGE_TYPE) {
          nextEdge.type = FLOATING_EDGE_TYPE;
        }
        delete nextEdge.sections;
        delete nextEdge.sourcePoint;
        delete nextEdge.targetPoint;
        delete nextEdge.bendPoints;

        if (nextEdge.data && typeof nextEdge.data === "object") {
          const nextData = { ...nextEdge.data };
          delete nextData.sections;
          nextEdge.data = nextData;
        }

        return nextEdge;
      }),
    [],
  );

  const setEdgesToGraphexaStraight = useCallback(
    (layoutEdges: any[]) =>
      layoutEdges.map((edge: any) => {
        const nextData =
          edge.data && typeof edge.data === "object"
            ? { ...edge.data, graphexaLayoutEdge: true }
            : { graphexaLayoutEdge: true };

        return {
          ...edge,
          type: GRAPHEXA_STRAIGHT_EDGE_TYPE,
          data: nextData,
          sections: undefined,
          sourcePoint: undefined,
          targetPoint: undefined,
          bendPoints: undefined,
        };
      }),
    [],
  );

  const applyGraphexaLayout = useCallback(
    (toNodes: any[], nextEdges: any[], fitAfterLayout = true) => {
      setGraph({ nodes: toNodes, edges: nextEdges });
      if (fitAfterLayout) {
        window.requestAnimationFrame(() => {
          fitView && fitView({ padding: 0.25 });
        });
      }
    },
    [fitView, setGraph],
  );

  // TODO: Also implement d3-hierarchy, entitree-flex, dagre, webcola, and graphology layout modes
  //       Once implemented measure performance and deprecate whatever performs worse for duplicated layouts

  const setGraphexaLayout = useCallback(
    (options: any) => {
      const layoutOptions = {
        "layout.algorithm": "graphexa.layered",
        "layout.direction": "RIGHT",
        "layout.layerSpacing": 220,
        "layout.nodeSpacing": 180,
        ...options,
      };
      const algorithmId = String(
        layoutOptions["layout.algorithm"] ?? "graphexa.layered",
      );
      const graphexaAlgorithm = toGraphexaAlgorithm(algorithmId);
      const snapshotNodes = structuredClone(nodes);
      const snapshotEdges = resetEdgesToBezier(structuredClone(edges));
      setNodesBeforeLayout(snapshotNodes);
      setEdgesBeforeLayout(snapshotEdges);

      const layoutNodes = snapshotNodes.map((node: any) => ({
        ...node,
        width:
          node.measured?.width || node.width || DEFAULT_GRAPHEXA_NODE_WIDTH,
        height:
          node.measured?.height || node.height || DEFAULT_GRAPHEXA_NODE_HEIGHT,
      }));
      const nodeIds = new Set(layoutNodes.map((node: any) => node.id));
      const layoutEdges = snapshotEdges.filter(
        (edge: any) =>
          hasUsableEndpoint(edge?.source) &&
          hasUsableEndpoint(edge?.target) &&
          nodeIds.has(edge.source) &&
          nodeIds.has(edge.target),
      );
      const skippedEdges = snapshotEdges.filter(
        (edge: any) => !layoutEdges.includes(edge),
      );

      if (skippedEdges.length) {
        console.warn(
          "[Graphexa] Skipping edges with missing or unknown endpoints",
          skippedEdges.map((edge: any) => ({
            id: edge?.id,
            source: edge?.source,
            target: edge?.target,
          })),
        );
      }

      const requestedSubsetKey =
        typeof layoutOptions["graphexa.subsetKey"] === "string" &&
        layoutOptions["graphexa.subsetKey"].trim()
          ? layoutOptions["graphexa.subsetKey"].trim()
          : "subset";
      const multipartiteSubsetKey =
        graphexaAlgorithm === "multipartite" &&
        !layoutNodes.every((node: any) =>
          hasSubsetValue(node, requestedSubsetKey),
        )
          ? buildMultipartiteSubsetMap(layoutNodes, layoutEdges)
          : requestedSubsetKey;

      const graphexaOptions = {
        algorithm: graphexaAlgorithm,
        direction: String(layoutOptions["layout.direction"] ?? "RIGHT"),
        spacingX: numberOption(layoutOptions, "layout.nodeSpacing", 180),
        spacingY: numberOption(layoutOptions, "layout.layerSpacing", 220),
        nodeWidth: DEFAULT_GRAPHEXA_NODE_WIDTH,
        nodeHeight: DEFAULT_GRAPHEXA_NODE_HEIGHT,
        iterations: numberOption(layoutOptions, "graphexa.iterations", 120),
        maxIter: numberOption(layoutOptions, "graphexa.maxIter", 100),
        jitterTolerance: numberOption(
          layoutOptions,
          "graphexa.jitterTolerance",
          1,
        ),
        scalingRatio: numberOption(
          layoutOptions,
          "graphexa.scalingRatio",
          DEFAULT_GRAPHEXA_FORCEATLAS2_SCALING_RATIO,
        ),
        gravity: numberOption(layoutOptions, "graphexa.gravity", 1),
        k: optionalNumberOption(layoutOptions, "graphexa.k"),
        threshold: numberOption(layoutOptions, "graphexa.threshold", 0.0001),
        method:
          typeof layoutOptions["graphexa.method"] === "string"
            ? layoutOptions["graphexa.method"]
            : "auto",
        distributedAction: booleanOption(
          layoutOptions,
          "graphexa.distributedAction",
        ),
        strongGravity: booleanOption(layoutOptions, "graphexa.strongGravity"),
        linlog: booleanOption(layoutOptions, "graphexa.linlog"),
        seed: numberOption(layoutOptions, "graphexa.seed", 1),
        rotate: optionalNumberOption(layoutOptions, "graphexa.rotate"),
        subsetKey: multipartiteSubsetKey,
        resolution: numberOption(layoutOptions, "graphexa.resolution", 0.35),
        equidistant: booleanOption(layoutOptions, "graphexa.equidistant"),
        start:
          typeof layoutOptions["graphexa.start"] === "string"
            ? layoutOptions["graphexa.start"]
            : undefined,
        align:
          typeof layoutOptions["graphexa.align"] === "string"
            ? layoutOptions["graphexa.align"]
            : "vertical",
        scale: numberOption(
          layoutOptions,
          "graphexa.scale",
          DEFAULT_GRAPHEXA_SCALE,
        ),
      };
      const graphexaEdgeStyle =
        layoutOptions["graphexa.edgeStyle"] === "bezier"
          ? "bezier"
          : "straight";

      ensureGraphexaReady()
        .then(() => {
          const layoutedGraph = JSON.parse(
            layout_react_flow_graph(
              JSON.stringify({ nodes: layoutNodes, edges: layoutEdges }),
              JSON.stringify(graphexaOptions),
            ),
          );
          const layoutedNodes = (layoutedGraph.nodes ?? []).map((node: any) => {
            const position =
              graphexaAlgorithm === "random" && isFinitePosition(node.position)
                ? {
                    x: (node.position.x - 0.5) * graphexaOptions.scale * 2,
                    y: (node.position.y - 0.5) * graphexaOptions.scale * 2,
                  }
                : node.position;
            return { ...node, position, width: undefined, height: undefined };
          });

          applyGraphexaLayout(
            layoutedNodes,
            graphexaEdgeStyle === "straight"
              ? setEdgesToGraphexaStraight(snapshotEdges)
              : resetEdgesToBezier(snapshotEdges),
          );
        })
        .catch((error) => {
          console.error(
            "[Graphexa] Failed to apply layout algorithm '" + algorithmId + "'",
            error,
          );
          toast.error(
            "Unable to apply '" +
              algorithmId +
              "': " +
              getLayoutErrorMessage(error),
          );
        });
    },
    [
      applyGraphexaLayout,
      edges,
      nodes,
      resetEdgesToBezier,
      setEdgesToGraphexaStraight,
    ],
  );

  const handlePositionChange = useCallback(() => {
    if (positionMode === "manual") {
      setGraph({
        nodes: nodesBeforeLayout,
        edges: resetEdgesToBezier(edgesBeforeLayout),
      });
    }
    fitView({ duration: 300 });
  }, [
    positionMode,
    setGraph,
    nodesBeforeLayout,
    edgesBeforeLayout,
    fitView,
    resetEdgesToBezier,
  ]);

  useEffect(() => {
    const previousPositionMode = previousPositionModeRef.current;
    previousPositionModeRef.current = positionMode;

    if (positionMode === "manual" && previousPositionMode !== "manual") {
      handlePositionChange();
    }
  }, [handlePositionChange, positionMode]);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <></>
      <div className="relative h-full w-full overflow-hidden" ref={graphRef}>
        {/* {isError && <h2>Error</h2>} */}
        <Graph
          toggleSettings={() => setShowSettings(!showSettings)}
          graphInstance={graphInstance}
          setGraphInstance={setGraphInstance}
          graph={graph}
          setLayout={setGraphexaLayout}
          layoutAlgorithms={layoutAlgorithms}
          fitView={fitView}
          blueprints={blueprints}
          applyTransformResultsToGraph={applyTransformResultsToGraph}
        />
        {graphLoadingOverlayVisible && (
          <div aria-hidden="true" class="">
            <div className="graph-loading-panel ">
              <div className="graph-loading-copy">
                <p className="graph-loading-title">Building network graph</p>
                <p className="graph-loading-subtitle">
                  Loading entities and connections...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <SettingsModal
        graphId={hid as string}
        isOpen={showSettings}
        closeModal={() => setShowSettings(false)}
      />
    </>
  );
}
