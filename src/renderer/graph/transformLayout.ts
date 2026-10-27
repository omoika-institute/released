import initGraphexa, {
  layout_react_flow_graph,
} from "../../../graphexa/pkg/graphexa.js";
import graphexaWasmUrl from "../../../graphexa/pkg/graphexa_bg.wasm?url";
import type { TransformLayoutAlgorithm } from "@/stores";

const DEFAULT_GRAPHEXA_NODE_WIDTH = 150;
const DEFAULT_GRAPHEXA_NODE_HEIGHT = 50;
const DEFAULT_TRANSFORM_NODE_WIDTH = 240;
const DEFAULT_TRANSFORM_NODE_HEIGHT = 120;
let graphexaInitPromise: Promise<unknown> | null = null;

const hasUsableEndpoint = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const ensureGraphexaReady = () => {
  if (!graphexaInitPromise) {
    graphexaInitPromise = initGraphexa(graphexaWasmUrl);
  }
  return graphexaInitPromise;
};

const estimateTransformNodeSize = (node: any, isNewNode: boolean) => {
  const measuredWidth = node.measured?.width || node.width;
  const measuredHeight = node.measured?.height || node.height;

  if (!isNewNode) {
    return {
      width: measuredWidth || DEFAULT_GRAPHEXA_NODE_WIDTH,
      height: measuredHeight || DEFAULT_GRAPHEXA_NODE_HEIGHT,
    };
  }

  const data =
    node?.data && typeof node.data === "object" ? node.data : {};
  const visibleFieldCount = Object.keys(data).filter(
    (key) => key !== "label" && !key.startsWith("__")
  ).length;

  return {
    width: measuredWidth || DEFAULT_TRANSFORM_NODE_WIDTH,
    height:
      measuredHeight ||
      Math.max(DEFAULT_TRANSFORM_NODE_HEIGHT, 72 + visibleFieldCount * 34),
  };
};

export const mergeGraphItemsById = <T extends { id?: string }>(
  currentItems: T[],
  incomingItems: T[]
) => {
  const itemById = new Map<string, T>();
  const order: string[] = [];

  for (const item of currentItems) {
    if (!item?.id) continue;
    itemById.set(item.id, item);
    order.push(item.id);
  }

  for (const item of incomingItems) {
    if (!item?.id) continue;
    if (!itemById.has(item.id)) order.push(item.id);
    itemById.set(item.id, item);
  }

  return order
    .map((id) => itemById.get(id))
    .filter((item): item is T => Boolean(item));
};

export const layoutTransformGraph = async ({
  currentNodes,
  currentEdges,
  incomingNodes,
  incomingEdges,
  algorithm = "transform_incremental",
}: {
  currentNodes: any[];
  currentEdges: any[];
  incomingNodes: any[];
  incomingEdges: any[];
  algorithm?: TransformLayoutAlgorithm;
}) => {
  const currentNodeIds = new Set(
    currentNodes
      .map((node) => (typeof node?.id === "string" ? node.id : ""))
      .filter(Boolean)
  );
  const newNodeIds = new Set(
    incomingNodes
      .map((node) => (typeof node?.id === "string" ? node.id : ""))
      .filter((id) => id && !currentNodeIds.has(id))
  );
  const currentNodePositionById = new Map(
    currentNodes
      .filter(
        (node) =>
          typeof node?.id === "string" &&
          Number.isFinite(node?.position?.x) &&
          Number.isFinite(node?.position?.y)
      )
      .map((node) => [node.id, node.position])
  );
  const mergedNodes = mergeGraphItemsById(currentNodes, incomingNodes).map(
    (node) => {
      const isNewNode = newNodeIds.has(node.id);
      const size = estimateTransformNodeSize(node, isNewNode);
      const existingPosition = currentNodePositionById.get(node.id);
      const position =
        existingPosition && !isNewNode
          ? existingPosition
          : node.position;
      const layoutNode = {
        ...node,
        ...(position ? { position } : {}),
        width: size.width,
        height: size.height,
      };

      if (isNewNode) {
        const { position: _position, ...newNode } = layoutNode;
        return newNode;
      }

      return layoutNode;
    }
  );
  const mergedEdges = mergeGraphItemsById(currentEdges, incomingEdges);
  const nodeIds = new Set(mergedNodes.map((node) => node.id));
  const layoutEdges = mergedEdges.filter(
    (edge) =>
      hasUsableEndpoint(edge?.source) &&
      hasUsableEndpoint(edge?.target) &&
      nodeIds.has(edge.source) &&
      nodeIds.has(edge.target)
  );

  await ensureGraphexaReady();
  const layoutedGraph = JSON.parse(
    layout_react_flow_graph(
      JSON.stringify({ nodes: mergedNodes, edges: layoutEdges }),
      JSON.stringify({
        algorithm,
        spacingX: 180,
        spacingY: 220,
        nodeWidth: DEFAULT_GRAPHEXA_NODE_WIDTH,
        nodeHeight: DEFAULT_GRAPHEXA_NODE_HEIGHT,
        iterations: 80,
      })
    )
  );
  const layoutedNodeById = new Map(
    (layoutedGraph.nodes ?? []).map((node: any) => [
      node.id,
      { ...node, width: undefined, height: undefined },
    ])
  );

  return {
    nodes: mergedNodes.map((node) => layoutedNodeById.get(node.id) ?? node),
    edges: mergedEdges,
  };
};
