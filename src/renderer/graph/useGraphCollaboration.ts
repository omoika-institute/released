import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { Edge, MarkerType, Node, type Viewport } from "@xyflow/react";
import { useFlowStore } from "@/stores";
import {
  GRAPH_COLLABORATION_DISABLED,
  GRAPH_ACCESS_CODE_STORAGE_PREFIX,
  GRAPH_COLLAB_FORCE_CODE_STORAGE_PREFIX,
  GRAPH_COLLAB_SET_INVITE_CODE_EVENT,
  GRAPH_COLLAB_SUBMIT_CODE_EVENT,
  type GraphCollaborationSetInviteCodeDetail,
  type GraphCollaborationSubmitCodeDetail,
} from "@/lib/graphCollaboration";

type GraphOperation =
  | {
      kind: "entity:create";
      graphId: string;
      entity: {
        id: string;
        label: string;
        position: { x: number; y: number };
        data?: Record<string, any>;
        type?: string;
      };
    }
  | {
      kind: "entity:update";
      graphId: string;
      entityId: string;
      updates: {
        x?: number;
        y?: number;
        data?: Record<string, any>;
      };
    }
  | { kind: "entity:delete"; graphId: string; entityId: string }
  | {
      kind: "edge:create";
      graphId: string;
      edge: {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any>;
        type?: string;
      };
    }
  | {
      kind: "edge:update";
      graphId: string;
      edgeId: string;
      updates: {
        source?: string;
        target?: string;
        data?: Record<string, any>;
      };
    }
  | { kind: "edge:delete"; graphId: string; edgeId: string };

type CollaborationMessage =
  | {
      type: "graph-operation";
      operationId: string;
      senderId: string;
      operation: GraphOperation;
    }
  | {
      type: "entity-display-mode";
      senderId: string;
      graphId: string;
      entityId: string;
      mode: "view" | "edit";
    }
  | {
      type: "entity-selection";
      senderId: string;
      graphId: string;
      entityIds: string[];
    }
  | {
      type: "entity-selection-box";
      senderId: string;
      graphId: string;
      label: string;
      phase: "start" | "update" | "end";
      start: { x: number; y: number };
      end: { x: number; y: number };
    }
  | {
      type: "entity-drag";
      senderId: string;
      graphId: string;
      phase: "update" | "end";
      positions: Array<{
        entityId: string;
        position: { x: number; y: number };
      }>;
    }
  | {
      type: "graph-transform";
      senderId: string;
      detail: GraphTransformCollaborationDetail;
    }
  | {
      type: "graph-follow-request";
      senderId: string;
      graphId: string;
      targetPeerId: string;
    }
  | {
      type: "graph-unfollow-request";
      senderId: string;
      graphId: string;
      targetPeerId: string;
    }
  | {
      type: "graph-viewport";
      senderId: string;
      graphId: string;
      viewport: Viewport;
    }
  | {
      type: "cursor";
      senderId: string;
      graphId?: string | null;
      x: number;
      y: number;
      label: string;
    }
  | { type: "presence"; senderId: string };

type SignalMessage =
  | {
      type: "join";
      roomId: string;
      peerId: string;
      accessCode?: string | null;
      requiresAccessCode?: boolean;
    }
  | {
      type: "join-accepted";
      peerId: string;
      accessCode: string;
      peers?: string[];
    }
  | { type: "join-rejected"; reason: string }
  | { type: "access-code"; accessCode: string }
  | { type: "join-requested"; peerId: string }
  | {
      type: "set-access-code";
      roomId: string;
      peerId: string;
      accessCode: string;
    }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; to: string; data: any };

export type RemoteGraphCursor = {
  peerId: string;
  label: string;
  x: number;
  y: number;
  updatedAt: number;
};

export type RemoteGraphSelectionBox = {
  peerId: string;
  label: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  updatedAt: number;
};

export type RemoteGraphSelection = {
  peerId: string;
  label: string;
  entityIds: string[];
  updatedAt: number;
};

export type RemoteGraphViewport = {
  peerId: string;
  viewport: Viewport;
  updatedAt: number;
};

export type GraphTransformCollaborationDetail = {
  graphId: string;
  jobId: string;
  phase: "progress" | "result" | "error" | "complete";
  message?: string;
  progress?: number;
  nodes?: any[];
  edges?: any[];
  error?: unknown;
};

export const GRAPH_TRANSFORM_BROADCAST_EVENT =
  "omoika:graph-transform-broadcast";
export const GRAPH_TRANSFORM_REMOTE_EVENT = "omoika:graph-transform-remote";

const markerEnd = {
  type: MarkerType.ArrowClosed,
  color: "#535045",
  width: 16,
  height: 16,
};

const defaultSignalingUrl = "ws://127.0.0.1:8787/ws";
export const GRAPH_SIGNALING_URL_STORAGE_KEY = "omoika:graph-signaling-url";
export const GRAPH_SIGNALING_URL_CHANGED_EVENT =
  "omoika:graph-signaling-url-changed";
const DISABLED_REMOTE_CURSORS: RemoteGraphCursor[] = [];
const DISABLED_REMOTE_SELECTIONS: RemoteGraphSelection[] = [];
const DISABLED_REMOTE_SELECTION_BOXES: RemoteGraphSelectionBox[] = [];
const getSignalingUrl = () => {
  const env = (import.meta as any).env ?? {};
  const configuredUrl =
    typeof window !== "undefined"
      ? window.localStorage.getItem(GRAPH_SIGNALING_URL_STORAGE_KEY)?.trim()
      : "";

  return (
    configuredUrl ||
    env.VITE_GRAPH_SIGNALING_URL ||
    env.VITE_COLLAB_SIGNALING_URL ||
    defaultSignalingUrl
  );
};

const logCollaboration = (
  message: string,
  details?: Record<string, unknown>,
) => {
  console.info(`[graph-collab] ${message}`, details ?? {});
};

const createPeerId = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const getNodeLabel = (node: Node) =>
  String(
    (node.data as Record<string, any> | undefined)?.label ||
      node.type ||
      "unknown",
  );

const resolveNodeType = (data: Record<string, any> = {}, fallback?: string) => {
  if (data.__nodeType === "unverifiedNodeType") return "unverifiedNodeType";
  return fallback || "view";
};

export const graphOperationFromNodeCreate = (
  graphId: string,
  node: Node,
): GraphOperation => ({
  kind: "entity:create",
  graphId,
  entity: {
    id: node.id,
    label: getNodeLabel(node),
    position: node.position ?? { x: 0, y: 0 },
    data: (node.data ?? {}) as Record<string, any>,
    type: node.type,
  },
});

export const graphOperationFromEdgeCreate = (
  graphId: string,
  edge: Edge,
): GraphOperation => ({
  kind: "edge:create",
  graphId,
  edge: {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: (edge.data ?? {}) as Record<string, any>,
    type: edge.type,
  },
});

export function useGraphCollaboration(graphId?: string | null) {
  const clientId = useMemo(createPeerId, []);
  const [signalingUrl, setSignalingUrl] = useState(getSignalingUrl);
  const [peerCount, setPeerCount] = useState(0);
  const [accessCode, setAccessCode] = useState("");
  const [accessRequired, setAccessRequired] = useState(false);
  const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<RemoteGraphCursor[]>([]);
  const [remoteSelections, setRemoteSelections] = useState<
    RemoteGraphSelection[]
  >([]);
  const [remoteSelectionBoxes, setRemoteSelectionBoxes] = useState<
    RemoteGraphSelectionBox[]
  >([]);
  const [followedPeerId, setFollowedPeerId] = useState<string | null>(null);
  const [remoteViewport, setRemoteViewport] =
    useState<RemoteGraphViewport | null>(null);
  const [viewportBroadcastEnabled, setViewportBroadcastEnabled] =
    useState(false);
  const roomPeersRef = useRef(new Set<string>());
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const channelsRef = useRef(new Map<string, RTCDataChannel>());
  const pendingIceCandidatesRef = useRef(
    new Map<string, RTCIceCandidateInit[]>(),
  );
  const socketRef = useRef<WebSocket | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const seenOperationsRef = useRef(new Set<string>());
  const accessCodeRef = useRef("");
  const followedPeerIdRef = useRef<string | null>(null);
  const viewportBroadcastEnabledRef = useRef(false);
  const cursorThrottleRef = useRef(0);
  const latestCursorRef = useRef<{ x: number; y: number } | null>(null);

  const applyRemoteOperation = useCallback((operation: GraphOperation) => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const state = useFlowStore.getState();

    switch (operation.kind) {
      case "entity:create": {
        if (state.nodes.some((node) => node.id === operation.entity.id)) break;
        state.addEntity({
          id: operation.entity.id,
          label: operation.entity.label,
          position: operation.entity.position,
          data: operation.entity.data ?? {},
          type: resolveNodeType(operation.entity.data, operation.entity.type),
        } as Node);
        break;
      }
      case "entity:update":
        state.updateEntity(operation.entityId, {
          ...(operation.updates.x !== undefined ||
          operation.updates.y !== undefined
            ? {
                position: {
                  x:
                    operation.updates.x ??
                    state.nodes.find((node) => node.id === operation.entityId)
                      ?.position.x ??
                    0,
                  y:
                    operation.updates.y ??
                    state.nodes.find((node) => node.id === operation.entityId)
                      ?.position.y ??
                    0,
                },
              }
            : {}),
          ...(operation.updates.data
            ? {
                data: {
                  ...(state.nodes.find((node) => node.id === operation.entityId)
                    ?.data ?? {}),
                  ...operation.updates.data,
                },
              }
            : {}),
        });
        break;
      case "entity:delete":
        state.removeEntity(operation.entityId);
        break;
      case "edge:create":
        if (state.edges.some((edge) => edge.id === operation.edge.id)) break;
        state.addRelationship({
          id: operation.edge.id,
          source: operation.edge.source,
          target: operation.edge.target,
          data: operation.edge.data ?? {},
          type: operation.edge.type || "sfloat",
          markerEnd,
        } as Edge);
        break;
      case "edge:update":
        state.updateRelationship(operation.edgeId, operation.updates);
        break;
      case "edge:delete":
        state.removeRelationship(operation.edgeId);
        break;
    }

    window.api.graph.applyRemoteOperation(operation).catch((error) => {
      console.warn("Failed to persist remote graph operation:", error);
    });
  }, []);

  const applyRemoteTransformGraph = useCallback(
    (nodes: any[] = [], edges: any[] = []) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const state = useFlowStore.getState();
      const existingNodeIds = new Set(state.nodes.map((node) => node.id));
      const existingEdgeIds = new Set(state.edges.map((edge) => edge.id));

      for (const node of nodes) {
        if (!node?.id) continue;
        const data = (node.data ?? {}) as Record<string, any>;
        if (existingNodeIds.has(node.id)) {
          state.updateEntity(node.id, {
            ...node,
            position: node.position ?? { x: node.x ?? 0, y: node.y ?? 0 },
            data,
          });
          if (node.type) state.setEntityType(node.id, node.type);
          applyRemoteOperation({
            kind: "entity:update",
            graphId: graphId ?? "",
            entityId: node.id,
            updates: {
              x: node.position?.x ?? node.x,
              y: node.position?.y ?? node.y,
              data,
            },
          });
        } else {
          applyRemoteOperation(
            graphOperationFromNodeCreate(graphId ?? "", {
              ...node,
              position: node.position ?? { x: node.x ?? 0, y: node.y ?? 0 },
              type: node.type ?? resolveNodeType(data),
              data,
            } as Node),
          );
        }
      }

      for (const edge of edges) {
        if (!edge?.id) continue;
        const data = (edge.data ?? {}) as Record<string, any>;
        if (existingEdgeIds.has(edge.id)) {
          state.updateRelationship(edge.id, {
            ...edge,
            data,
            type: edge.type || "sfloat",
            markerEnd,
          });
          applyRemoteOperation({
            kind: "edge:update",
            graphId: graphId ?? "",
            edgeId: edge.id,
            updates: {
              source: edge.source,
              target: edge.target,
              data,
            },
          });
        } else {
          applyRemoteOperation(
            graphOperationFromEdgeCreate(graphId ?? "", {
              ...edge,
              data,
              type: edge.type || "sfloat",
              markerEnd,
            } as Edge),
          );
        }
      }
    },
    [applyRemoteOperation, graphId],
  );

  const handleDataMessage = useCallback(
    (raw: string) => {
      let message: CollaborationMessage;
      if (GRAPH_COLLABORATION_DISABLED) return;

      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }

      if (message.senderId === clientId) {
        return;
      }

      if (
        message.type === "cursor" &&
        (!message.graphId || message.graphId === graphId)
      ) {
        setRemoteCursors((current) => {
          const next = current.filter(
            (cursor) => cursor.peerId !== message.senderId,
          );
          next.push({
            peerId: message.senderId,
            label: message.label,
            x: message.x,
            y: message.y,
            updatedAt: Date.now(),
          });
          return next;
        });
        return;
      }

      if (
        message.type === "graph-operation" &&
        message.operation.graphId === graphId &&
        !seenOperationsRef.current.has(message.operationId)
      ) {
        seenOperationsRef.current.add(message.operationId);
        applyRemoteOperation(message.operation);
      }

      if (
        message.type === "entity-display-mode" &&
        message.graphId === graphId
      ) {
        useFlowStore.getState().setEntityType(message.entityId, message.mode);
      }

      if (message.type === "entity-selection" && message.graphId === graphId) {
        const entityIds = Array.from(new Set(message.entityIds));
        setRemoteSelections((current) => {
          const next = current.filter(
            (selection) => selection.peerId !== message.senderId,
          );
          if (entityIds.length) {
            next.push({
              peerId: message.senderId,
              label: message.senderId.slice(0, 4).toUpperCase(),
              entityIds,
              updatedAt: Date.now(),
            });
          }
          return next;
        });
      }

      if (
        message.type === "entity-selection-box" &&
        message.graphId === graphId
      ) {
        if (message.phase === "end") {
          setRemoteSelectionBoxes((current) =>
            current.filter((box) => box.peerId !== message.senderId),
          );
          return;
        }

        setRemoteSelectionBoxes((current) => {
          const next = current.filter((box) => box.peerId !== message.senderId);
          next.push({
            peerId: message.senderId,
            label: message.label,
            start: message.start,
            end: message.end,
            updatedAt: Date.now(),
          });
          return next;
        });
      }

      if (message.type === "entity-drag" && message.graphId === graphId) {
        const state = useFlowStore.getState();
        const currentPositions = new Map(
          state.nodes.map((node) => [node.id, node.position]),
        );

        for (const item of message.positions) {
          if (!item.entityId || !item.position) continue;
          const nextX = item.position.x;
          const nextY = item.position.y;
          if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) continue;

          const current = currentPositions.get(item.entityId);
          if (current?.x === nextX && current?.y === nextY) continue;

          state.updateEntity(item.entityId, {
            position: { x: nextX, y: nextY },
          });
        }
      }

      if (
        message.type === "graph-transform" &&
        message.detail.graphId === graphId
      ) {
        if (
          (message.detail.phase === "result" ||
            message.detail.phase === "complete") &&
          (Array.isArray(message.detail.nodes) ||
            Array.isArray(message.detail.edges))
        ) {
          applyRemoteTransformGraph(
            Array.isArray(message.detail.nodes) ? message.detail.nodes : [],
            Array.isArray(message.detail.edges) ? message.detail.edges : [],
          );
        }

        window.dispatchEvent(
          new CustomEvent<GraphTransformCollaborationDetail>(
            GRAPH_TRANSFORM_REMOTE_EVENT,
            { detail: message.detail },
          ),
        );
      }

      if (
        message.type === "graph-follow-request" &&
        message.graphId === graphId &&
        message.targetPeerId === clientId
      ) {
        viewportBroadcastEnabledRef.current = true;
        setViewportBroadcastEnabled(true);
      }

      if (
        message.type === "graph-unfollow-request" &&
        message.graphId === graphId &&
        message.targetPeerId === clientId
      ) {
        viewportBroadcastEnabledRef.current = false;
        setViewportBroadcastEnabled(false);
      }

      if (
        message.type === "graph-viewport" &&
        message.graphId === graphId &&
        message.senderId === followedPeerIdRef.current
      ) {
        setRemoteViewport({
          peerId: message.senderId,
          viewport: message.viewport,
          updatedAt: Date.now(),
        });
      }
    },
    [applyRemoteOperation, applyRemoteTransformGraph, clientId, graphId],
  );

  const sendSignal = useCallback((message: SignalMessage) => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }, []);

  const sendCursorToChannel = useCallback(
    (channel: RTCDataChannel, position: { x: number; y: number }) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (channel.readyState !== "open") return;
      channel.send(
        JSON.stringify({
          type: "cursor",
          senderId: clientId,
          graphId,
          label: clientId.slice(0, 4).toUpperCase(),
          x: position.x,
          y: position.y,
        } satisfies CollaborationMessage),
      );
    },
    [clientId, graphId],
  );

  const wireChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      channel.onopen = () => {
        channelsRef.current.set(peerId, channel);
        roomPeersRef.current.add(peerId);
        setPeerCount(roomPeersRef.current.size);
        logCollaboration("data channel open", {
          graphId,
          peerId,
          peerCount: roomPeersRef.current.size,
        });
        channel.send(JSON.stringify({ type: "presence", senderId: clientId }));
        const latestCursor = latestCursorRef.current;
        if (latestCursor) {
          sendCursorToChannel(channel, latestCursor);
        }
      };
      channel.onclose = () => {
        channelsRef.current.delete(peerId);
        logCollaboration("data channel closed", { graphId, peerId });
      };
      channel.onmessage = (event) => {
        if (typeof event.data === "string") handleDataMessage(event.data);
      };
    },
    [clientId, graphId, handleDataMessage, sendCursorToChannel],
  );

  const createPeer = useCallback(
    (peerId: string, initiator: boolean) => {
      if (GRAPH_COLLABORATION_DISABLED) return null;

      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      if (typeof RTCPeerConnection === "undefined") {
        console.warn(
          "[graph-collab] RTCPeerConnection is unavailable; room presence will work but cursors cannot connect.",
        );
        return null;
      }

      const peer = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });
      peersRef.current.set(peerId, peer);
      logCollaboration("creating peer", { graphId, peerId, initiator });

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignal({
          type: "signal",
          from: clientId,
          to: peerId,
          data: { candidate: event.candidate },
        });
      };
      peer.ondatachannel = (event) => wireChannel(peerId, event.channel);
      peer.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(peer.connectionState)) {
          channelsRef.current.delete(peerId);
          peersRef.current.delete(peerId);
          pendingIceCandidatesRef.current.delete(peerId);
        }
      };

      if (initiator) {
        const channel = peer.createDataChannel("graph");
        wireChannel(peerId, channel);
        peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() =>
            sendSignal({
              type: "signal",
              from: clientId,
              to: peerId,
              data: { description: peer.localDescription },
            }),
          )
          .catch((error) =>
            console.warn("Failed to create WebRTC offer:", error),
          );
      }

      return peer;
    },
    [clientId, graphId, sendSignal, wireChannel],
  );

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    if (!graphId || typeof WebSocket === "undefined") {
      logCollaboration("signaling skipped", {
        graphId,
        hasWebSocket: typeof WebSocket !== "undefined",
        hasRTCPeerConnection: typeof RTCPeerConnection !== "undefined",
      });
      return;
    }

    logCollaboration("signaling connecting", {
      graphId,
      signalingUrl,
      clientId,
      hasRTCPeerConnection: typeof RTCPeerConnection !== "undefined",
    });
    const socket = new WebSocket(signalingUrl);
    socketRef.current = socket;

    socket.onopen = async () => {
      logCollaboration("signaling open", { graphId, signalingUrl, clientId });
      try {
        const config = await window.api.p2p.iceServers({ signalingUrl });
        if (Array.isArray(config?.iceServers) && config.iceServers.length > 0) {
          iceServersRef.current = config.iceServers;
        }
      } catch (error) {
        console.warn("[graph-collab] Failed to load ICE config:", error);
        // Keep the default public STUN server if the signaling server does not expose config.
      }
      const forceCode =
        window.localStorage.getItem(
          `${GRAPH_COLLAB_FORCE_CODE_STORAGE_PREFIX}${graphId}`,
        ) === "1";
      const storedCode = forceCode
        ? ""
        : window.localStorage
            .getItem(`${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`)
            ?.trim() || "";
      accessCodeRef.current = storedCode;
      setAccessRequired(forceCode);
      sendSignal({
        type: "join",
        roomId: graphId,
        peerId: clientId,
        accessCode: storedCode || undefined,
        requiresAccessCode: forceCode,
      });
      logCollaboration("join sent", {
        graphId,
        clientId,
        hasAccessCode: Boolean(storedCode),
        requiresAccessCode: forceCode,
      });
    };
    socket.onmessage = async (event) => {
      let message: SignalMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "join-accepted") {
        logCollaboration("join accepted", {
          graphId,
          clientId,
          peers: message.peers ?? [],
        });
        setAccessRequired(false);
        setAccessCode(message.accessCode);
        accessCodeRef.current = message.accessCode;
        window.localStorage.removeItem(
          `${GRAPH_COLLAB_FORCE_CODE_STORAGE_PREFIX}${graphId}`,
        );
        window.localStorage.setItem(
          `${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`,
          message.accessCode,
        );
        roomPeersRef.current = new Set(
          (message.peers ?? []).filter((peerId) => peerId !== clientId),
        );
        setPeerCount(roomPeersRef.current.size);
        return;
      }

      if (message.type === "join-rejected") {
        logCollaboration("join rejected", { graphId, clientId });
        accessCodeRef.current = "";
        window.localStorage.removeItem(
          `${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`,
        );
        setAccessRequired(true);
        return;
      }

      if (message.type === "access-code") {
        setAccessCode(message.accessCode);
        accessCodeRef.current = message.accessCode;
        window.localStorage.setItem(
          `${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`,
          message.accessCode,
        );
        return;
      }

      if (message.type === "join-requested") {
        setPendingPeerId(message.peerId);
        return;
      }

      if (message.type === "peer-joined") {
        roomPeersRef.current.add(message.peerId);
        setPeerCount(roomPeersRef.current.size);
        createPeer(message.peerId, true);
        logCollaboration("peer joined", {
          graphId,
          peerId: message.peerId,
          peerCount: roomPeersRef.current.size,
        });
        setPendingPeerId(null);
        return;
      }

      if (message.type === "peer-left") {
        peersRef.current.get(message.peerId)?.close();
        peersRef.current.delete(message.peerId);
        channelsRef.current.delete(message.peerId);
        roomPeersRef.current.delete(message.peerId);
        setRemoteCursors((current) =>
          current.filter((cursor) => cursor.peerId !== message.peerId),
        );
        setRemoteSelections((current) =>
          current.filter((selection) => selection.peerId !== message.peerId),
        );
        setRemoteSelectionBoxes((current) =>
          current.filter((box) => box.peerId !== message.peerId),
        );
        setPeerCount(roomPeersRef.current.size);
        logCollaboration("peer left", {
          graphId,
          peerId: message.peerId,
          peerCount: roomPeersRef.current.size,
        });
        return;
      }

      if (message.type !== "signal" || message.to !== clientId) return;

      const peer = createPeer(message.from, false);
      if (!peer) return;
      if (message.data.description) {
        await peer.setRemoteDescription(message.data.description);
        const pendingCandidates =
          pendingIceCandidatesRef.current.get(message.from) ?? [];
        pendingIceCandidatesRef.current.delete(message.from);
        for (const candidate of pendingCandidates) {
          await peer.addIceCandidate(candidate).catch((error) => {
            console.warn("Failed to add queued ICE candidate:", error);
          });
        }
        if (message.data.description.type === "offer") {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal({
            type: "signal",
            from: clientId,
            to: message.from,
            data: { description: peer.localDescription },
          });
        }
      } else if (message.data.candidate) {
        if (!peer.remoteDescription) {
          const pending =
            pendingIceCandidatesRef.current.get(message.from) ?? [];
          pending.push(message.data.candidate);
          pendingIceCandidatesRef.current.set(message.from, pending);
          return;
        }
        await peer.addIceCandidate(message.data.candidate).catch((error) => {
          console.warn("Failed to add ICE candidate:", error);
        });
      }
    };
    socket.onerror = () => {
      console.warn("Graph collaboration signaling connection failed.");
    };
    socket.onclose = (event) => {
      logCollaboration("signaling closed", {
        graphId,
        code: event.code,
        reason: event.reason,
      });
    };

    return () => {
      socket.close();
      socketRef.current = null;
      for (const channel of channelsRef.current.values()) channel.close();
      for (const peer of peersRef.current.values()) peer.close();
      channelsRef.current.clear();
      peersRef.current.clear();
      roomPeersRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      followedPeerIdRef.current = null;
      viewportBroadcastEnabledRef.current = false;
      setPeerCount(0);
      setRemoteCursors([]);
      setRemoteSelections([]);
      setRemoteSelectionBoxes([]);
      setFollowedPeerId(null);
      setRemoteViewport(null);
      setViewportBroadcastEnabled(false);
    };
  }, [clientId, createPeer, graphId, sendSignal, signalingUrl]);

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const handleSignalingUrlChange = () => setSignalingUrl(getSignalingUrl());
    window.addEventListener(
      GRAPH_SIGNALING_URL_CHANGED_EVENT,
      handleSignalingUrlChange,
    );
    window.addEventListener("storage", handleSignalingUrlChange);

    return () => {
      window.removeEventListener(
        GRAPH_SIGNALING_URL_CHANGED_EVENT,
        handleSignalingUrlChange,
      );
      window.removeEventListener("storage", handleSignalingUrlChange);
    };
  }, []);

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    if (!graphId) return;

    let cancelled = false;
    const syncRoomPeers = () => {
      void window.api.p2p
        .roomPeers({ signalingUrl, graphId })
        .then((body) => {
          if (cancelled || !Array.isArray(body?.peers)) return;
          roomPeersRef.current = new Set(
            body.peers.filter((peerId) => peerId !== clientId),
          );
          setPeerCount(roomPeersRef.current.size);
          logCollaboration("room peers synced", {
            graphId,
            peers: Array.from(roomPeersRef.current),
          });
        })
        .catch((error) => {
          console.warn("[graph-collab] Failed to sync room peers:", error);
          // The websocket remains authoritative if this HTTP status check fails.
        });
    };

    syncRoomPeers();
    const interval = window.setInterval(syncRoomPeers, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [clientId, graphId, signalingUrl]);

  const broadcastOperation = useCallback(
    (operation: GraphOperation) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const operationId = createPeerId();
      seenOperationsRef.current.add(operationId);
      const message = JSON.stringify({
        type: "graph-operation",
        operationId,
        senderId: clientId,
        operation,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId],
  );

  const broadcastEntityDisplayMode = useCallback(
    (entityId: string, mode: "view" | "edit") => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId) return;
      const message = JSON.stringify({
        type: "entity-display-mode",
        senderId: clientId,
        graphId,
        entityId,
        mode,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  const broadcastEntitySelection = useCallback(
    (entityIds: string[]) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId) return;
      const uniqueEntityIds = Array.from(new Set(entityIds));
      const message = JSON.stringify({
        type: "entity-selection",
        senderId: clientId,
        graphId,
        entityIds: uniqueEntityIds,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  const broadcastEntitySelectionBox = useCallback(
    (
      phase: "start" | "update" | "end",
      start: { x: number; y: number },
      end: { x: number; y: number },
    ) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId) return;
      const message = JSON.stringify({
        type: "entity-selection-box",
        senderId: clientId,
        graphId,
        label: clientId.slice(0, 4).toUpperCase(),
        phase,
        start,
        end,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  const broadcastEntityDrag = useCallback(
    (
      phase: "update" | "end",
      positions: Array<{
        entityId: string;
        position: { x: number; y: number };
      }>,
    ) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId || !positions.length) return;
      const message = JSON.stringify({
        type: "entity-drag",
        senderId: clientId,
        graphId,
        phase,
        positions,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  const broadcastGraphTransform = useCallback(
    (detail: GraphTransformCollaborationDetail) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId || detail.graphId !== graphId) return;
      const message = JSON.stringify({
        type: "graph-transform",
        senderId: clientId,
        detail,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const handleTransformBroadcast = (event: Event) => {
      const detail = (event as CustomEvent<GraphTransformCollaborationDetail>)
        .detail;
      if (!detail) return;
      broadcastGraphTransform(detail);
    };

    window.addEventListener(
      GRAPH_TRANSFORM_BROADCAST_EVENT,
      handleTransformBroadcast as EventListener,
    );
    return () =>
      window.removeEventListener(
        GRAPH_TRANSFORM_BROADCAST_EVENT,
        handleTransformBroadcast as EventListener,
      );
  }, [broadcastGraphTransform]);

  const sendPeerControlMessage = useCallback(
    (message: CollaborationMessage) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const raw = JSON.stringify(message);
      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(raw);
      }
    },
    [],
  );

  const followPeer = useCallback(
    (peerId: string) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId) return;
      followedPeerIdRef.current = peerId;
      setFollowedPeerId(peerId);
      setRemoteViewport(null);
      sendPeerControlMessage({
        type: "graph-follow-request",
        senderId: clientId,
        graphId,
        targetPeerId: peerId,
      });
    },
    [clientId, graphId, sendPeerControlMessage],
  );

  const unfollowPeer = useCallback(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const peerId = followedPeerIdRef.current;
    if (!graphId || !peerId) return;
    followedPeerIdRef.current = null;
    setFollowedPeerId(null);
    setRemoteViewport(null);
    sendPeerControlMessage({
      type: "graph-unfollow-request",
      senderId: clientId,
      graphId,
      targetPeerId: peerId,
    });
  }, [clientId, graphId, sendPeerControlMessage]);

  const broadcastViewport = useCallback(
    (viewport: Viewport) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      if (!graphId || !viewportBroadcastEnabledRef.current) return;
      const message = JSON.stringify({
        type: "graph-viewport",
        senderId: clientId,
        graphId,
        viewport,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  const broadcastCursor = useCallback(
    (position: { x: number; y: number }) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const now = Date.now();
      if (now - cursorThrottleRef.current < 40) return;
      cursorThrottleRef.current = now;
      latestCursorRef.current = position;

      const message = JSON.stringify({
        type: "cursor",
        senderId: clientId,
        graphId,
        label: clientId.slice(0, 4).toUpperCase(),
        x: position.x,
        y: position.y,
      } satisfies CollaborationMessage);

      for (const channel of channelsRef.current.values()) {
        if (channel.readyState === "open") channel.send(message);
      }
    },
    [clientId, graphId],
  );

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const interval = window.setInterval(() => {
      const latestCursor = latestCursorRef.current;
      if (!latestCursor) return;
      for (const channel of channelsRef.current.values()) {
        sendCursorToChannel(channel, latestCursor);
      }
    }, 750);

    return () => window.clearInterval(interval);
  }, [sendCursorToChannel]);

  const submitAccessCode = useCallback(
    (nextCode: string) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const code = nextCode.trim();
      if (!graphId || !code) return;
      accessCodeRef.current = code;
      window.localStorage.setItem(
        `${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`,
        code,
      );
      sendSignal({
        type: "join",
        roomId: graphId,
        peerId: clientId,
        accessCode: code,
        requiresAccessCode: true,
      });
    },
    [clientId, graphId, sendSignal],
  );

  const setInviteCode = useCallback(
    (nextCode: string) => {
      if (GRAPH_COLLABORATION_DISABLED) return;

      const code = nextCode.trim();
      if (!graphId || !code) return;
      setAccessCode(code);
      accessCodeRef.current = code;
      window.localStorage.setItem(
        `${GRAPH_ACCESS_CODE_STORAGE_PREFIX}${graphId}`,
        code,
      );
      sendSignal({
        type: "set-access-code",
        roomId: graphId,
        peerId: clientId,
        accessCode: code,
      });
    },
    [clientId, graphId, sendSignal],
  );

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const handleSubmitCode = (event: Event) => {
      const detail = (event as CustomEvent<GraphCollaborationSubmitCodeDetail>)
        .detail;
      if (!detail || detail.graphId !== graphId) return;
      submitAccessCode(detail.code);
    };

    window.addEventListener(
      GRAPH_COLLAB_SUBMIT_CODE_EVENT,
      handleSubmitCode as EventListener,
    );
    return () =>
      window.removeEventListener(
        GRAPH_COLLAB_SUBMIT_CODE_EVENT,
        handleSubmitCode as EventListener,
      );
  }, [graphId, submitAccessCode]);

  useEffect(() => {
    if (GRAPH_COLLABORATION_DISABLED) return;

    const handleSetInviteCode = (event: Event) => {
      const detail = (
        event as CustomEvent<GraphCollaborationSetInviteCodeDetail>
      ).detail;
      if (!detail || detail.graphId !== graphId) return;
      setInviteCode(detail.code);
    };

    window.addEventListener(
      GRAPH_COLLAB_SET_INVITE_CODE_EVENT,
      handleSetInviteCode as EventListener,
    );
    return () =>
      window.removeEventListener(
        GRAPH_COLLAB_SET_INVITE_CODE_EVENT,
        handleSetInviteCode as EventListener,
      );
  }, [graphId, setInviteCode]);

  return {
    accessCode: GRAPH_COLLABORATION_DISABLED ? "" : accessCode,
    accessRequired: GRAPH_COLLABORATION_DISABLED ? false : accessRequired,
    broadcastEntityDisplayMode,
    broadcastEntityDrag,
    broadcastEntitySelection,
    broadcastEntitySelectionBox,
    broadcastCursor,
    broadcastOperation,
    broadcastViewport,
    followedPeerId: GRAPH_COLLABORATION_DISABLED ? null : followedPeerId,
    followPeer,
    peerCount: GRAPH_COLLABORATION_DISABLED ? 0 : peerCount,
    pendingPeerId: GRAPH_COLLABORATION_DISABLED ? null : pendingPeerId,
    remoteCursors: GRAPH_COLLABORATION_DISABLED
      ? DISABLED_REMOTE_CURSORS
      : remoteCursors,
    remoteSelections: GRAPH_COLLABORATION_DISABLED
      ? DISABLED_REMOTE_SELECTIONS
      : remoteSelections,
    remoteSelectionBoxes: GRAPH_COLLABORATION_DISABLED
      ? DISABLED_REMOTE_SELECTION_BOXES
      : remoteSelectionBoxes,
    remoteViewport: GRAPH_COLLABORATION_DISABLED ? null : remoteViewport,
    submitAccessCode,
    unfollowPeer,
    viewportBroadcastEnabled: GRAPH_COLLABORATION_DISABLED
      ? false
      : viewportBroadcastEnabled,
  };
}
