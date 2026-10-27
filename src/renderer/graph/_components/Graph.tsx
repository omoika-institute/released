import { createContext } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "preact/hooks";
import { DragEventHandler } from "preact";
import {
  Edge,
  Node,
  Background,
  BackgroundVariant,
  FitViewOptions,
  Connection,
  ReactFlowInstance,
  ReactFlow,
  OnNodeDrag,
  NodeMouseHandler,
  ConnectionMode,
  IsValidConnection,
  reconnectEdge,
  Panel,
  ReactFlowProps,
  OnReconnect,
  XYPosition,
  OnConnect,
  FinalConnectionState,
  NodeChange,
  EdgeChange,
  NodeSelectionChange,
  EdgeReplaceChange,
  EdgeMarker,
  HandleType,
  EdgeProps,
} from "@xyflow/react";
import EditEntityNode from "./EntityEditNode";
import { toast } from "react-toastify";
import { ViewEntityNode } from "./EntityViewNode";
import { useParams } from "react-router-dom";
import { useShallow } from "zustand/shallow";
import NewConnectionLine from "./ConnectionLine";
import FloatingEdge from "./FloatingEdge";
import GraphexaStraightEdge from "./StraightEdge";
import { useFlowStore } from "@/stores";
import ContextMenu from "./ContextMenu";
import OverlayMenus from "./OverlayMenus";
import SuccessToast from "@/components/toasts/SuccessToast";
import { Graph as GraphState } from "@/api";
import "@xyflow/react/dist/style.css";
import LoadingNode from "./LoadingNode";

export interface CtxPosition {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface CtxMenu {
  selection?: Node | Node[] | null;
  position?: CtxPosition;
}

const GRAPH_EDGE_Z_INDEX = 0;
const GRAPH_ACTIVE_EDGE_Z_INDEX = 1;
const GRAPH_ACTIVE_EDGE_ENDPOINT_Z_INDEX = 2;

interface Blueprint {
  [any: string]: {
    [any: string]: any;
    value?: string;
  };
}

export interface LayoutAlgorithmOption {
  label: string;
  value: string;
  description?: string;
  category?: string;
  supportedFeatures?: string[];
}

export type LayoutConfig = Record<string, unknown>;

export const GRAPHEXA_ALGORITHM_PREFIX = "graphexa.";
export const GRAPHEXA_STRAIGHT_EDGE_TYPE = "graphexaStraight";

export const GRAPHEXA_ALGORITHM_OPTIONS: LayoutAlgorithmOption[] = [
  {
    value: "graphexa.layered",
    label: "Layered",
    description:
      "Fast deterministic directed layout from the local graphexa WASM package.",
  },
  {
    value: "graphexa.grid",
    label: "Grid",
    description:
      "Compact deterministic row and column placement from the local graphexa WASM package.",
  },
  {
    value: "graphexa.bfs",
    label: "BFS",
    description:
      "Breadth-first multipartite placement from a selected start node.",
  },
  {
    value: "graphexa.circular",
    label: "Circular",
    description:
      "NetworkX-style circular placement with a configurable layout scale.",
  },
  {
    value: "graphexa.radial",
    label: "Radial",
    description:
      "Hub-oriented circular placement from the local graphexa WASM package.",
  },
  {
    value: "graphexa.force",
    label: "Force",
    description:
      "Deterministic force-directed pass from the local graphexa WASM package.",
  },
  {
    value: "graphexa.forceatlas2",
    label: "ForceAtlas2",
    description:
      "Weighted ForceAtlas2-inspired force-directed placement with deterministic seeding.",
  },
  {
    value: "graphexa.kamada_kawai",
    label: "Kamada-Kawai",
    description:
      "Weighted shortest-path cost-function layout with configurable iterations.",
  },
  {
    value: "graphexa.planar",
    label: "Planar",
    description:
      "Planar graph placement with guard checks for non-planar graphs.",
  },
  {
    value: "graphexa.random",
    label: "Random",
    description:
      "Deterministic seeded random placement from the local graphexa WASM package.",
  },
  {
    value: "graphexa.rescale",
    label: "Rescale",
    description: "Rescales current node positions around the graph center.",
  },
  {
    value: "graphexa.shell",
    label: "Shell",
    description: "Concentric shell placement with configurable rotation.",
  },
  {
    value: "graphexa.spectral",
    label: "Spectral",
    description: "Spectral layout based on the graph Laplacian.",
  },
  {
    value: "graphexa.spiral",
    label: "Spiral",
    description:
      "Spiral placement with configurable resolution and equidistant mode.",
  },
  {
    value: "graphexa.spring",
    label: "Spring",
    description:
      "Fruchterman-Reingold spring layout with configurable iterations and method.",
  },
  {
    value: "graphexa.multipartite",
    label: "Multipartite",
    description:
      "Layered multipartite placement using a subset field from each node.",
  },
  {
    value: "graphexa.investigation_hierarchy",
    label: "Investigation Hierarchy",
    description: "Tree-like layered placement for investigative graphs.",
  },
  {
    value: "graphexa.investigation_organic",
    label: "Investigation Organic",
    description: "Force-directed clustering for dense investigative graphs.",
  },
  {
    value: "graphexa.investigation_hub_rings",
    label: "Investigation Hub Rings",
    description: "Hub-first circular and radial placement for investigations.",
  },
  {
    value: "graphexa.investigation_orthogonal",
    label: "Investigation Orthogonal",
    description:
      "Structured grid placement for right-angle investigation maps.",
  },
];

interface ProjectGraphProps {
  graphInstance?: ReactFlowInstance;
  setGraphInstance: ReactFlowProps["onInit"];
  setLayout: (args: LayoutConfig) => void;
  layoutAlgorithms: LayoutAlgorithmOption[];
  graph: GraphState | null;
  fitView: (fitViewOptions?: FitViewOptions | undefined) => void;
  blueprints: { [any: string]: Blueprint };
  toggleSettings: () => void;
  applyTransformResultsToGraph: (
    incomingNodes?: any[],
    incomingEdges?: any[],
  ) => Promise<any>;
}

const flattenGraphBlueprintElements = (elements: unknown) =>
  Array.isArray(elements)
    ? elements.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    : [];

const isMarkdownElement = (element: any) =>
  element?.type === "md" || element?.type === "markdown";

const isSingleMarkdownBlueprint = (blueprint: any) => {
  const elements = flattenGraphBlueprintElements(blueprint?.elements);
  return elements.length === 1 && isMarkdownElement(elements[0]);
};

type ResolveUnverifiedEntityToBlueprint = (
  entity: any,
  resolvedItems: Array<{
    index: number;
    resolution: Record<string, unknown>;
    blueprintLabel: string;
    title: string;
    canResolve: boolean;
  }>,
  options?: {
    duplicateMode?: "queueSimilar" | "forceCreate" | "mergeBest";
    suppressSuccessToast?: boolean;
  },
) => Promise<unknown>;

interface GraphNodeRenderContextValue {
  blueprints: Record<string, any>;
  hasBlueprints: boolean;
  investigatingNodeId: string | null;
}

const GraphNodeRenderContext = createContext<GraphNodeRenderContextValue>({
  blueprints: {},
  hasBlueprints: false,
  investigatingNodeId: null,
});

const getNodeBlueprintState = (
  entity: any,
  context: GraphNodeRenderContextValue,
) => {
  const label = entity?.data?.label ?? entity?.label;
  const blueprint = label ? context.blueprints[label] : null;
  const isInvestigating = entity.id === context.investigatingNodeId;

  return { label, blueprint, isInvestigating };
};

const GraphEditNode = (entity: any) => {
  const context = useContext(GraphNodeRenderContext);
  const { label, blueprint, isInvestigating } = getNodeBlueprintState(
    entity,
    context,
  );

  if (!label || !blueprint) {
    return <LoadingNode entity={entity} warn={context.hasBlueprints} />;
  }

  return (
    <EditEntityNode
      ctx={entity}
      blueprint={blueprint}
      isInvestigating={isInvestigating}
    />
  );
};

const GraphViewNode = (entity: any) => {
  const context = useContext(GraphNodeRenderContext);
  const { label, blueprint, isInvestigating } = getNodeBlueprintState(
    entity,
    context,
  );

  if (!label || !blueprint) {
    return <LoadingNode entity={entity} warn={context.hasBlueprints} />;
  }

  return (
    <ViewEntityNode
      ctx={entity}
      blueprint={blueprint}
      isInvestigating={isInvestigating}
    />
  );
};

const graphNodeTypes = {
  edit: GraphEditNode,
  view: GraphViewNode,
};

const graphEdgeTypes = {
  [GRAPHEXA_STRAIGHT_EDGE_TYPE]: (edge: EdgeProps) => (
    <GraphexaStraightEdge {...edge} showLabel />
  ),
  sfloat: (edge: EdgeProps) => {
    const { data, ...edg } = edge;
    return (
      <FloatingEdge
        {...edg}
        data={{
          ...data,
          sourceX: edge.sourceX,
          sourceY: edge.sourceY,
          targetX: edge.targetX,
          targetY: edge.targetY,
        }}
        showLabel
      />
    );
  },
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const GRAPH_PASTE_OFFSET: XYPosition = { x: 48, y: 48 };
const viewOptions: FitViewOptions = {
  padding: 50,
};

type GraphClipboardNode = {
  id: string;
  label: string;
  type?: string;
  position: XYPosition;
  data?: Record<string, unknown>;
};

type GraphClipboardEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: Record<string, unknown>;
};

type GraphClipboardPayload = {
  sourceGraphId: string;
  nodes: GraphClipboardNode[];
  edges: GraphClipboardEdge[];
  copiedAt: number;
};

let graphClipboard: GraphClipboardPayload | null = null;

const cloneGraphClipboardValue = <T,>(value: T): T => {
  if (value === null || value === undefined) return value;

  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }
};

const getClipboardNodeLabel = (node: Node) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return String(data.label || (node as any).label || node.type || "Entity");
};

export default function Graph({
  graphInstance,
  setGraphInstance,
  graph,
  setLayout,
  layoutAlgorithms,
  fitView,
  blueprints,
  toggleSettings,
  applyTransformResultsToGraph,
}: ProjectGraphProps) {
  const { hid } = useParams();
  const hasBlueprints = Object.keys(blueprints ?? {}).length > 0;

  const {
    setEntityEdit,
    setEntityView,
    removeRelationship,
    setRelationships,
    onRelationshipConnect,
    handleRelationshipsChange,
    handleEntityChange,
    positionMode,
    clearGraph,
    nodes,
    edges,
    addEntity,
    removeEntity,
    addRelationship,
    updateRelationship,
    updateEntity,
    setViewport,
    setGraph,
    timelinePlaybackReadOnly,
  } = useFlowStore(
    useShallow((state) => ({
      setEntityEdit: state.setEntityEdit,
      setEntityView: state.setEntityView,
      removeRelationship: state.removeRelationship,
      setRelationships: state.setRelationships,
      onRelationshipConnect: state.onRelationshipConnect,
      handleRelationshipsChange: state.handleRelationshipsChange,
      handleEntityChange: state.handleEntityChange,
      positionMode: state.positionMode,
      clearGraph: state.clearGraph,
      nodes: state.nodes,
      edges: state.edges,
      addEntity: state.addEntity,
      removeEntity: state.removeEntity,
      addRelationship: state.addRelationship,
      updateRelationship: state.updateRelationship,
      updateEntity: state.updateEntity,
      setViewport: state.setViewport,
      setGraph: state.setGraph,
      timelinePlaybackReadOnly: state.timelinePlaybackReadOnly,
    })),
  );

  const ref = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [investigatingNodeId, setInvestigatingNodeId] = useState<string | null>(
    null,
  );

  const selectedNodeIds = useMemo(
    () => new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
    [nodes],
  );

  const activeEdgeEndpointNodeIds = useMemo(() => {
    const next = new Set<string>();
    for (const edge of edges) {
      const isActivated =
        Boolean(edge.data?.isActivated) ||
        selectedNodeIds.has(edge.source) ||
        selectedNodeIds.has(edge.target);

      if (isActivated) {
        next.add(edge.source);
        next.add(edge.target);
      }
    }
    return next;
  }, [edges, selectedNodeIds]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const isActiveEdgeEndpoint = activeEdgeEndpointNodeIds.has(node.id);
        const isTypeFiltered =
          typeFilters.length > 0 &&
          !typeFilters.includes(node.data?.label as string);

        if (!isTypeFiltered && !isActiveEdgeEndpoint) return node;

        return {
          ...node,
          zIndex: isActiveEdgeEndpoint
            ? Math.max(
                node.zIndex ?? GRAPH_EDGE_Z_INDEX,
                GRAPH_ACTIVE_EDGE_ENDPOINT_Z_INDEX,
              )
            : node.zIndex,
          data: {
            ...node.data,
          },
          style: {
            ...node.style,
            ...(isTypeFiltered
              ? {
                  opacity: 0.12,
                  transition: "opacity 0.15s",
                }
              : {}),
          },
        };
      }),
    [activeEdgeEndpointNodeIds, nodes, typeFilters],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const isLocallyActivated =
          selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
        const baseEdge = {
          ...edge,
          zIndex:
            edge.data?.isActivated || isLocallyActivated
              ? GRAPH_ACTIVE_EDGE_Z_INDEX
              : GRAPH_EDGE_Z_INDEX,
        };

        if (
          !isLocallyActivated &&
          !edge.data?.isRemoteActivated &&
          !edge.data?.isActivated
        )
          return baseEdge;

        const isActivated = Boolean(
          edge.data?.isActivated || isLocallyActivated,
        );
        return {
          ...baseEdge,
          zIndex: isActivated ? GRAPH_ACTIVE_EDGE_Z_INDEX : GRAPH_EDGE_Z_INDEX,
          data: {
            ...edge.data,
            isActivated,
          },
        };
      }),
    [edges, selectedNodeIds],
  );

  const connectedEdgesByNodeId = useMemo(() => {
    const next = new Map<string, Edge[]>();
    for (const edge of edges) {
      const sourceEdges = next.get(edge.source) ?? [];
      sourceEdges.push(edge);
      next.set(edge.source, sourceEdges);

      const targetEdges = next.get(edge.target) ?? [];
      targetEdges.push(edge);
      next.set(edge.target, targetEdges);
    }
    return next;
  }, [edges]);

  const deleteGraphEntities = useCallback(
    async (entitiesToDelete: Node[]) => {
      if (timelinePlaybackReadOnly) return;
      if (!hid || !entitiesToDelete.length) return;

      const targetIds = Array.from(
        new Set(entitiesToDelete.map((node) => node.id).filter(Boolean)),
      );
      if (!targetIds.length) return;

      const targetIdSet = new Set(targetIds);
      const snapshot = useFlowStore.getState();
      setGraph({
        nodes: snapshot.nodes.filter((node) => !targetIdSet.has(node.id)),
        edges: snapshot.edges.filter(
          (edge) =>
            !targetIdSet.has(edge.source) && !targetIdSet.has(edge.target),
        ),
      });

      const results = await Promise.allSettled(
        targetIds.map((entityId) =>
          window.api.graph.deleteEntity({
            graphId: hid,
            entityId,
          }),
        ),
      );

      const failedIds = targetIds.filter(
        (_, index) => results[index]?.status === "rejected",
      );

      if (!failedIds.length) return;

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error("Failed to delete entity:", {
            graphId: hid,
            entityId: targetIds[index],
            error: result.reason,
          });
        }
      });

      const current = useFlowStore.getState();
      const failedIdSet = new Set(failedIds);
      const currentNodeIds = new Set(current.nodes.map((node) => node.id));
      const restoredNodes = snapshot.nodes.filter(
        (node) => failedIdSet.has(node.id) && !currentNodeIds.has(node.id),
      );
      const nextNodes = [...current.nodes, ...restoredNodes];
      const nextNodeIds = new Set(nextNodes.map((node) => node.id));
      const currentEdgeIds = new Set(current.edges.map((edge) => edge.id));
      const restoredEdges = snapshot.edges.filter(
        (edge) =>
          !currentEdgeIds.has(edge.id) &&
          nextNodeIds.has(edge.source) &&
          nextNodeIds.has(edge.target),
      );

      setGraph({
        nodes: nextNodes,
        edges: [...current.edges, ...restoredEdges],
      });

      toast.error(
        failedIds.length === 1
          ? "Failed to delete entity"
          : `Failed to delete ${failedIds.length} entities`,
      );
    },
    [hid, setGraph, timelinePlaybackReadOnly],
  );

  const copySelectedGraphEntities = useCallback(() => {
    if (!hid) return false;

    const snapshot = useFlowStore.getState();
    const selectedNodes = snapshot.nodes.filter((node) => node.selected);
    if (!selectedNodes.length) return false;

    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = snapshot.edges.filter(
      (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
    );

    graphClipboard = {
      sourceGraphId: hid,
      nodes: selectedNodes.map((node) => ({
        id: node.id,
        label: getClipboardNodeLabel(node),
        type: node.type,
        position: cloneGraphClipboardValue(node.position),
        data: cloneGraphClipboardValue(
          (node.data ?? {}) as Record<string, unknown>,
        ),
      })),
      edges: selectedEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        data: cloneGraphClipboardValue(
          (edge.data ?? {}) as Record<string, unknown>,
        ),
      })),
      copiedAt: Date.now(),
    };

    toast.success(
      selectedNodes.length === 1
        ? "Copied 1 entity."
        : `Copied ${selectedNodes.length} entities.`,
    );
    return true;
  }, [hid]);

  const pasteGraphClipboardEntities = useCallback(async () => {
    if (timelinePlaybackReadOnly) return false;
    const clipboard = graphClipboard;
    if (!hid || !clipboard?.nodes.length) return false;

    const minX = Math.min(...clipboard.nodes.map((node) => node.position.x));
    const minY = Math.min(...clipboard.nodes.map((node) => node.position.y));
    const maxX = Math.max(...clipboard.nodes.map((node) => node.position.x));
    const maxY = Math.max(...clipboard.nodes.map((node) => node.position.y));
    const bounds = ref.current?.getBoundingClientRect();
    const viewportCenter =
      bounds && graphInstance
        ? graphInstance.screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          })
        : null;

    const basePosition =
      clipboard.sourceGraphId === hid
        ? {
            x: minX + GRAPH_PASTE_OFFSET.x,
            y: minY + GRAPH_PASTE_OFFSET.y,
          }
        : viewportCenter
          ? {
              x: viewportCenter.x - (maxX - minX) / 2,
              y: viewportCenter.y - (maxY - minY) / 2,
            }
          : {
              x: minX + GRAPH_PASTE_OFFSET.x,
              y: minY + GRAPH_PASTE_OFFSET.y,
            };

    const idMap = new Map<string, string>();
    const createdNodes: Node[] = [];
    const createdEdges: Edge[] = [];

    try {
      for (const copiedNode of clipboard.nodes) {
        const position = {
          x: basePosition.x + (copiedNode.position.x - minX),
          y: basePosition.y + (copiedNode.position.y - minY),
        };
        const copiedData = cloneGraphClipboardValue(copiedNode.data ?? {});
        const createdEntity = await window.api.graph.createEntity({
          graphId: hid,
          entity: {
            label: copiedNode.label,
            x: position.x,
            y: position.y,
            data: copiedData,
          },
        });
        const node = {
          ...createdEntity,
          position,
          type: copiedNode.type || "view",
          data: {
            ...((createdEntity.data ?? {}) as Record<string, unknown>),
            ...copiedData,
          },
          selected: true,
        };

        idMap.set(copiedNode.id, node.id);
        createdNodes.push(node);
      }

      for (const copiedEdge of clipboard.edges) {
        const source = idMap.get(copiedEdge.source);
        const target = idMap.get(copiedEdge.target);
        if (!source || !target) continue;

        const copiedData = cloneGraphClipboardValue(copiedEdge.data ?? {});
        const createdEdge = await window.api.graph.createEdge({
          graphId: hid,
          edge: {
            source,
            target,
            data: copiedData,
          },
        });
        const edge = {
          ...createdEdge,
          source,
          target,
          type: copiedEdge.type || "sfloat",
          data: {
            ...((createdEdge.data ?? {}) as Record<string, unknown>),
            ...copiedData,
          },
          selected: false,
        };

        createdEdges.push(edge);
      }
    } catch (error) {
      console.error("Failed to paste copied graph entities:", error);
      if (!createdNodes.length && !createdEdges.length) {
        toast.error("Failed to paste copied entities.");
        return false;
      }
      toast.error("Some copied entities could not be pasted.");
    }

    if (!createdNodes.length && !createdEdges.length) return false;

    const current = useFlowStore.getState();
    setGraph({
      nodes: [
        ...current.nodes.map((node) => ({ ...node, selected: false })),
        ...createdNodes,
      ],
      edges: [
        ...current.edges.map((edge) => ({ ...edge, selected: false })),
        ...createdEdges,
      ],
    });

    toast.success(
      createdNodes.length === 1
        ? "Pasted 1 entity."
        : `Pasted ${createdNodes.length} entities.`,
    );
    return true;
  }, [graphInstance, hid, setGraph, timelinePlaybackReadOnly]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]',
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const isShortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
      if (isShortcut && key === "c") {
        if (copySelectedGraphEntities()) event.preventDefault();
        return;
      }

      if (isShortcut && key === "v") {
        event.preventDefault();
        void pasteGraphClipboardEntities();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const selectedNodes = useFlowStore
        .getState()
        .nodes.filter((node) => node.selected);
      if (!selectedNodes.length) return;

      event.preventDefault();
      void deleteGraphEntities(selectedNodes);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    copySelectedGraphEntities,
    deleteGraphEntities,
    pasteGraphClipboardEntities,
  ]);

  const getEdgeActivationChange = useCallback(
    (edge: Edge, isActivated: boolean): EdgeChange | null => {
      const color = isActivated ? "var(--color-review-border)" : "#535045";
      const markerEndValue = edge.markerEnd as EdgeMarker | undefined;
      const markerEnd =
        markerEndValue && typeof markerEndValue === "object"
          ? {
              ...markerEndValue,
              color,
            }
          : markerEndValue;

      if (
        edge.data?.isActivated === isActivated &&
        edge.zIndex ===
          (isActivated ? GRAPH_ACTIVE_EDGE_Z_INDEX : GRAPH_EDGE_Z_INDEX) &&
        (!markerEnd ||
          typeof markerEnd !== "object" ||
          markerEnd.color === color)
      ) {
        return null;
      }

      return {
        id: edge.id,
        type: "replace",
        item: {
          ...edge,
          markerEnd,
          zIndex: isActivated ? GRAPH_ACTIVE_EDGE_Z_INDEX : GRAPH_EDGE_Z_INDEX,
          data: {
            ...edge.data,
            isActivated,
          },
        },
      } as EdgeChange;
    },
    [],
  );

  /*
   * Handles edge highlighting when a node is selected/unselected
   **/
  const handleEdgeHighlightingOnNodeSelection = useCallback(
    (changes: NodeSelectionChange[]) => {
      const selectChanges = changes.filter(
        (change): change is NodeSelectionChange => change.type === "select",
      );
      if (!selectChanges.length) return;

      const nextSelectedNodeIds = new Set(selectedNodeIds);
      const affectedEdgesById = new Map<string, Edge>();

      for (const change of selectChanges) {
        if (change.selected) {
          nextSelectedNodeIds.add(change.id);
        } else {
          nextSelectedNodeIds.delete(change.id);
        }

        for (const edge of connectedEdgesByNodeId.get(change.id) ?? []) {
          affectedEdgesById.set(edge.id, edge);
        }
      }

      const edgeChanges: EdgeChange[] = [];
      for (const edge of affectedEdgesById.values()) {
        const isActivated =
          nextSelectedNodeIds.has(edge.source) ||
          nextSelectedNodeIds.has(edge.target);
        const edgeChange = getEdgeActivationChange(edge, isActivated);
        if (edgeChange) edgeChanges.push(edgeChange);
      }

      if (edgeChanges.length) {
        handleRelationshipsChange(edgeChanges);
      }
    },
    [
      connectedEdgesByNodeId,
      getEdgeActivationChange,
      handleRelationshipsChange,
      selectedNodeIds,
    ],
  );

  /*
   * Handles edge highlighting when edges are connected/disconnected
   **/
  const handleEdgeHighlightingOnEdgeChange = useCallback(
    (changes: EdgeReplaceChange[]): EdgeChange[] => {
      const newChanges: EdgeChange[] = [];
      for (const change of changes) {
        if (!change.item) {
          newChanges.push(change);
          continue;
        }

        const isActivated =
          selectedNodeIds.has(change.item.source) ||
          selectedNodeIds.has(change.item.target);
        newChanges.push(
          getEdgeActivationChange(change.item, isActivated) ?? change,
        );
      }
      return newChanges;
    },
    [getEdgeActivationChange, selectedNodeIds],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const selectionChanges = changes.filter(
        (change): change is NodeSelectionChange => change.type === "select",
      );
      if (timelinePlaybackReadOnly) {
        if (selectionChanges.length) {
          handleEdgeHighlightingOnNodeSelection(selectionChanges);
          handleEntityChange(selectionChanges);
        }
        return;
      }
      const positionChanges = changes.filter(
        (
          change,
        ): change is NodeChange & {
          id: string;
          position: XYPosition;
          dragging?: boolean;
        } =>
          change.type === "position" &&
          Boolean((change as any).position) &&
          Number.isFinite((change as any).position.x) &&
          Number.isFinite((change as any).position.y),
      );

      handleEdgeHighlightingOnNodeSelection(selectionChanges);
      handleEntityChange(changes);

      if (selectionChanges.length) {
        const nextSelectedNodeIds = new Set(selectedNodeIds);
        for (const change of selectionChanges) {
          if (change.selected) nextSelectedNodeIds.add(change.id);
          else nextSelectedNodeIds.delete(change.id);
        }
      }

      const completedMoves = positionChanges.filter(
        (change) => change.dragging === false,
      );

      if (!completedMoves.length) return;

      for (const change of completedMoves) {
        const { position } = change;
        const entityId = change.id;
        if (!entityId) continue;
        if (!position) continue;
        window.api.graph
          .updateEntity({
            graphId: hid as string,
            entityId,
            updates: {
              x: position.x,
              y: position.y,
            },
          })
          .catch(console.error);
      }
    },
    [
      hid,
      handleEdgeHighlightingOnNodeSelection,
      handleEntityChange,
      selectedNodeIds,
      timelinePlaybackReadOnly,
    ],
  );

  const openCtxMenu = useCallback(
    (event: MouseEvent, selection: Node | Node[] | null) => {
      event.preventDefault();
      // Calculate position of the context menu; Ensure we don't position off-screen.
      const pane = ref.current as HTMLDivElement;
      if (!pane) return;
      const bounds = pane.getBoundingClientRect();
      setCtxMenu({
        selection,
        position: {
          top:
            ((event.clientY < bounds.height - 250) as unknown as number) &&
            event.clientY,
          left:
            ((event.clientX < bounds.width - 250) as unknown as number) &&
            event.clientX,
          right:
            ((event.clientX >= bounds.width - 250) as unknown as number) &&
            bounds.width - event.clientX,
          bottom:
            ((event.clientY >= bounds.height - 250) as unknown as number) &&
            bounds.height - event.clientY + 180,
        },
      });
    },
    [],
  );

  // @todo implement support for multi-select transforms -
  // hm, actually, how will the transforms work if different plugin types/nodes are in the selection?
  // just delete/save position on drag/etc?
  const onMultiSelectionCtxMenu = useCallback(
    (event: MouseEvent, selection: Node[]) => {
      event.preventDefault();
      if (!selection?.length) return;
      if (selection.length === 1) {
        openCtxMenu(event, selection[0]);
        return;
      }
      openCtxMenu(event, selection);
    },
    [openCtxMenu],
  );

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node | null) => {
      openCtxMenu(event, node);
    },
    [openCtxMenu],
  );

  const onPaneClick = useCallback(() => setCtxMenu(null), []);

  const onDragOver: DragEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (timelinePlaybackReadOnly) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    },
    [timelinePlaybackReadOnly],
  );

  const onDrop: DragEventHandler<HTMLDivElement> = useCallback(
    async (event) => {
      if (timelinePlaybackReadOnly) return;
      const label =
        event.dataTransfer &&
        event.dataTransfer.getData("application/reactflow");
      if (typeof label === "undefined" || !label) return;

      const position = graphInstance?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) as XYPosition;

      try {
        const entity = await window.api.graph.createEntity({
          graphId: hid as string,
          entity: {
            label,
            ...position,
          },
        });
        const node = { ...entity, type: "edit" };
        addEntity(node);
      } catch (error) {
        console.error(error);
        toast.error(
          `We ran into a problem creating the ${label} entity. Please try again`,
        );
      }
    },
    [addEntity, graphInstance, hid, timelinePlaybackReadOnly],
  );

  const graphNodeRenderContext = useMemo<GraphNodeRenderContextValue>(
    () => ({
      blueprints,
      hasBlueprints,
      investigatingNodeId,
    }),
    [blueprints, hasBlueprints, investigatingNodeId],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    async (_, node) => {
      if (timelinePlaybackReadOnly) return;
      try {
        await window.api.graph.updateEntity({
          graphId: hid as string,
          entityId: node.id,
          updates: {
            x: node.position.x,
            y: node.position.y,
          },
        });
      } catch (error) {
        console.error("Failed to update entity position:", error);
      }
    },
    [hid, timelinePlaybackReadOnly],
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      // Use the store handler if provided, otherwise fallback to WebSocket
      const newChanges = handleEdgeHighlightingOnEdgeChange(changes);
      if (timelinePlaybackReadOnly) {
        handleRelationshipsChange(
          newChanges.filter((change: EdgeChange) => change.type === "select"),
        );
        return;
      }
      handleRelationshipsChange(newChanges);
    },
    [
      handleEdgeHighlightingOnEdgeChange,
      handleRelationshipsChange,
      timelinePlaybackReadOnly,
    ],
  );

  // on double click toggle between entity types
  // (rectangular editable entity vs circlular view entity)
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (event: TouchEvent | MouseEvent, node: Node) => {
      if (timelinePlaybackReadOnly) return;
      if (
        event instanceof MouseEvent &&
        (event.shiftKey || event.ctrlKey || event.metaKey)
      ) {
        return;
      }

      const label = node?.data?.label ?? (node as any)?.label;
      const blueprint =
        label && blueprints && typeof blueprints === "object"
          ? blueprints[String(label)]
          : null;

      if (isSingleMarkdownBlueprint(blueprint)) {
        const nextCompact = !Boolean(
          (node.data as Record<string, unknown> | undefined)?.__markdownCompact,
        );
        updateEntity(node.id, {
          type: "view",
          data: {
            ...(node.data ?? {}),
            __markdownCompact: nextCompact,
          },
        });
        return;
      }

      if (node.type === "view" || node.type === "markdown") {
        setEntityEdit(node.id);
      } else if (node.type === "edit") {
        setEntityView(node.id);
      }
    },
    [
      blueprints,
      setEntityEdit,
      setEntityView,
      timelinePlaybackReadOnly,
      updateEntity,
    ],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (event: TouchEvent | MouseEvent, node: Node) => {
      if (!(event instanceof MouseEvent) || !event.shiftKey) return;

      const changes = nodes
        .map((currentNode) => {
          const selected =
            currentNode.id === node.id
              ? !Boolean(currentNode.selected)
              : Boolean(currentNode.selected);

          if (!selected && currentNode.id !== node.id) return null;

          return {
            id: currentNode.id,
            type: "select",
            selected,
          } as NodeSelectionChange;
        })
        .filter((change): change is NodeSelectionChange => change !== null);

      if (!changes.length) return;
      handleEdgeHighlightingOnNodeSelection(changes);
      handleEntityChange(changes);
    },
    [handleEdgeHighlightingOnNodeSelection, handleEntityChange, nodes],
  );

  const onConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      if (timelinePlaybackReadOnly) return;
      if (!connection.sourceHandle || !connection.targetHandle) return;

      const tempId = `xy-edge__${connection.source}${connection.sourceHandle}-${connection.target}${connection.targetHandle}`;
      onRelationshipConnect(connection);

      try {
        const edge = await window.api.graph.createEdge({
          graphId: hid as string,
          edge: {
            temp_id: tempId,
            source: connection.source,
            target: connection.target,
            data: {},
          },
        });

        // Replace temp edge with real edge
        if (edge?.temp_id && edge?.id) {
          const { removeTempRelationshipId } = useFlowStore.getState();
          removeTempRelationshipId(edge.temp_id, edge.id);
        }
      } catch (error) {
        console.error("Failed to create edge:", error);
        toast.error("Failed to create connection");
      }
    },
    [hid, onRelationshipConnect, timelinePlaybackReadOnly],
  );
  // used for handling edge deletions. e.g. when a user
  // selects and drags  an existing connection line/edge
  // to a blank spot on the graph, the edge will be removed
  const edgeReconnectSuccessful = useRef(true);
  const onReconnectStart: ReactFlowProps["onReconnectStart"] =
    useCallback(() => {
      if (timelinePlaybackReadOnly) return;
      edgeReconnectSuccessful.current = false;
    }, [timelinePlaybackReadOnly]);
  const onReconnect: OnReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      if (timelinePlaybackReadOnly) return;
      if (!newConnection.sourceHandle || !newConnection.targetHandle) return;

      edgeReconnectSuccessful.current = true;
      setRelationships(
        reconnectEdge(oldEdge, newConnection, edges, {
          shouldReplaceId: false,
        }),
      );
      const { id, data = {} } = oldEdge;
      const { source, target } = newConnection;

      try {
        await window.api.graph.updateEdge({
          graphId: hid as string,
          edgeId: id,
          updates: { source: source as string, target: target as string, data },
        });
      } catch (error) {
        console.error("Failed to update edge:", error);
      }
    },
    [setRelationships, reconnectEdge, edges, hid, timelinePlaybackReadOnly],
  );

  const onReconnectEnd = async (
    _: MouseEvent | TouchEvent,
    edge: Edge,
    _handleType: HandleType,
    _state: FinalConnectionState,
  ) => {
    if (timelinePlaybackReadOnly) return;
    if (!edgeReconnectSuccessful.current) {
      removeRelationship(edge.id);
      try {
        await window.api.graph.deleteEdge({
          graphId: hid as string,
          edgeId: edge.id,
        });
      } catch (error) {
        console.error("Failed to delete edge:", error);
      }
    }
    edgeReconnectSuccessful.current = true;
  };

  // depending on where the valid entity connection handle is positioned
  // the connecting edges handle  will be either red, green, or the primary color
  const isValidConnection: IsValidConnection = useCallback(
    (connection) =>
      connection.target !== connection.source &&
      Boolean(connection.sourceHandle) &&
      Boolean(connection.targetHandle),
    [],
  );

  const onPaneCtxMenu: ReactFlowProps["onPaneContextMenu"] = useCallback(
    (event) => openCtxMenu(event, null),
    [openCtxMenu],
  );

  return (
    <GraphNodeRenderContext.Provider value={graphNodeRenderContext}>
      <ReactFlow
        ref={ref}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        minZoom={MIN_ZOOM}
        nodeDragThreshold={2}
        maxZoom={MAX_ZOOM}
        nodeTypes={graphNodeTypes}
        edgeTypes={graphEdgeTypes}
        nodes={displayNodes}
        edges={displayEdges}
        nodesDraggable={!timelinePlaybackReadOnly}
        nodesConnectable={!timelinePlaybackReadOnly}
        edgesReconnectable={!timelinePlaybackReadOnly}
        onDrop={onDrop}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onDragOver={onDragOver}
        isValidConnection={isValidConnection}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onInit={setGraphInstance}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitViewOptions={viewOptions}
        panActivationKeyCode="Space"
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneCtxMenu}
        onNodeContextMenu={onNodeContextMenu}
        onSelectionContextMenu={onMultiSelectionCtxMenu}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        connectionLineComponent={NewConnectionLine}
        elevateNodesOnSelect={true}
        elevateEdgesOnSelect={false}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }} // TODO: If omoika makes $$$, subscribe2reactflow :)
        defaultMarkerColor="#535045"
        onlyRenderVisibleElements
      >
        <Background
          color="#535045"
          bgColor="transparent"
          variant={BackgroundVariant.Dots}
        />
        <Panel
          position="top-left"
          style={{
            margin: 0,
            pointerEvents: "none",
            height: "100%",
            width: "100%",
            zIndex: 50,
          }}
        >
          <OverlayMenus
            toggleSettings={toggleSettings}
            positionMode={positionMode}
            graph={graph}
            setLayout={setLayout}
            layoutAlgorithms={layoutAlgorithms}
            fitView={fitView}
            clearGraph={clearGraph}
            applyTransformResultsToGraph={applyTransformResultsToGraph}
          />
        </Panel>
        <ContextMenu
          selection={ctxMenu?.selection ?? null}
          position={ctxMenu?.position}
          closeMenu={() => setCtxMenu(null)}
          onDeleteEntities={deleteGraphEntities}
        />
      </ReactFlow>
    </GraphNodeRenderContext.Provider>
  );
}
