export interface InstallerDownloadProgress {
  progress: number;
  bytesReceived: number;
  totalBytes: number;
}

export interface InstallerDownloadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface DeeplinkPayload {
  venvPath?: string;
  graphId?: string;
  shareId?: string;
  signalingUrl?: string;
  action?: "graph-collab";
}
