export const GRAPH_COLLAB_STATUS_EVENT = "omoika:graph-collab-status";
export const GRAPH_COLLAB_SUBMIT_CODE_EVENT = "omoika:graph-collab-submit-code";
export const GRAPH_COLLAB_SET_INVITE_CODE_EVENT =
  "omoika:graph-collab-set-invite-code";
export const GRAPH_COLLAB_PENDING_LINK_EVENT =
  "omoika:graph-collab-pending-link";
export const GRAPH_COLLAB_FORCE_CODE_STORAGE_PREFIX =
  "omoika:graph-collab-force-code:";
export const GRAPH_COLLAB_INVITE_CODE_STORAGE_PREFIX =
  "omoika:graph-collab-invite-code:";
export const GRAPH_ACCESS_CODE_STORAGE_PREFIX = "omoika:graph-access-code:";
export const GRAPH_COLLABORATION_DISABLED = true;

export type GraphCollaborationStatus = {
  graphId: string;
  accessCode: string;
  accessRequired: boolean;
  peerCount: number;
  pendingPeerId: string | null;
};

export type GraphCollaborationSubmitCodeDetail = {
  graphId: string;
  code: string;
};

export type GraphCollaborationSetInviteCodeDetail = {
  graphId: string;
  code: string;
};

export type GraphCollaborationPendingLinkDetail = {
  graphId: string;
  shareId?: string;
  signalingUrl?: string;
};
