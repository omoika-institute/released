import {
  GRAPH_COLLAB_PENDING_LINK_EVENT,
  type GraphCollaborationPendingLinkDetail,
} from "@/lib/graphCollaboration";

const GRAPH_SIGNALING_URL_STORAGE_KEY = "omoika:graph-signaling-url";
const DEFAULT_GRAPH_SIGNALING_URL = "ws://127.0.0.1:8787/ws";

export function formatNumber(value: number) {
  return String(value).padStart(3, "0");
}

export function getShareSignalingUrl() {
  return (
    window.localStorage.getItem(GRAPH_SIGNALING_URL_STORAGE_KEY)?.trim() ||
    DEFAULT_GRAPH_SIGNALING_URL
  );
}

export function isGraphCollaborationLink(value: string) {
  try {
    return new URL(value.trim()).hostname === "graph-collab";
  } catch {
    return false;
  }
}

export async function openGraphCollaborationLink(
  value: string,
  onStatus?: (status: string) => void
) {
  const url = new URL(value.trim());
  const graphId = url.searchParams.get("graphId")?.trim();
  const shareId = url.searchParams.get("shareId")?.trim();
  const signalingUrl = url.searchParams.get("server")?.trim();

  if (!graphId) {
    throw new Error("Graph collaboration link is missing a graph id.");
  }

  if (signalingUrl) {
    const nextUrl =
      signalingUrl.startsWith("ws://") || signalingUrl.startsWith("wss://")
        ? signalingUrl
        : signalingUrl
            .replace(/^http:\/\//, "ws://")
            .replace(/^https:\/\//, "wss://");
    const normalized = nextUrl.endsWith("/ws")
      ? nextUrl
      : `${nextUrl.replace(/\/$/, "")}/ws`;
    window.localStorage.setItem(GRAPH_SIGNALING_URL_STORAGE_KEY, normalized);
    window.dispatchEvent(new CustomEvent("omoika:graph-signaling-url-changed"));
  }

  onStatus?.("Waiting for one-time code...");
  window.dispatchEvent(
    new CustomEvent<GraphCollaborationPendingLinkDetail>(
      GRAPH_COLLAB_PENDING_LINK_EVENT,
      {
        detail: {
          graphId,
          shareId: shareId || undefined,
          signalingUrl: signalingUrl || undefined,
        },
      }
    )
  );
}
