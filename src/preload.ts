import { contextBridge, ipcRenderer } from "electron";
import type { BrowserTorStatus } from "./lib/browser";
import type { SupportedLanguage } from "./i18n/languages";
import type {
  AgentProvider,
  AosintWorkflowEvent,
  BrowserCommand,
  BrowserResult,
  RunOsintWorkflowPayload,
  RunOsintWorkflowResult,
} from "./lib/aosint/agentTypes";
export type { AgentProvider } from "./lib/aosint/agentTypes";
import type {
  DatabaseCreateRequest,
  DatabaseCreateResult,
  DatabaseDeleteRequest,
  DatabaseDeleteResult,
  DatabaseExportResult,
  DatabaseImportResult,
  DatabaseMetadata,
} from "./main/ipc/database";

/////////////////////////////////
// Types for cases
export interface CaseCreatePayload {
  label: string;
  description: string;
}

export interface CaseUpdatePayload {
  id: string;
  label: string;
  description: string;
}

export interface CaseDeletePayload {
  id: string;
}

export interface CaseFavoritePayload {
  graph_id: string;
  is_favorite: boolean;
}

export interface CaseShareExportResult {
  url: string;
  shareId: string;
  server: string;
  kind: "graph" | "database";
  caseCount: number;
  eventCount: number;
}

export interface CaseShareImportResult {
  kind: "graph" | "database";
  imported: { sourceId: string; localId: string; label: string }[];
  caseCount: number;
  eventCount: number;
}

/////////////////////////////////
// Types for entities
export interface EntityCreatePayload {
  label: string;
  description: string;
  author: string;
  source: string;
}

export interface EntityUpdatePayload {
  id: string;
  label: string;
  description: string;
  author: string;
  source: string;
}

export interface EntityDeletePayload {
  id: string;
}

export interface EntityFavoritePayload {
  entity_id: string;
  is_favorite: boolean;
}

export interface AttachmentsPayload {
  graph_id: string;
  entity_id: string;
}

export interface PaginatePayload {
  skip: number;
  limit: number;
}

export interface Settings {
  language?: SupportedLanguage;
  pythonPath?: string;
  pip3Path?: string;
  venvPath?: string;
  pluginsPath?: string;
  pluginSettings?: Record<string, Record<string, string>>;
  agentProvider?: AgentProvider;
  agentSystemPrompt?: string;
  agentUserPrompt?: string;
  agentLmStudioBaseUrl?: string;
  agentLmStudioModel?: string;
  agentLmStudioTemperature?: number;
  agentLmStudioMaxTurns?: number;
  agentLmStudioContextLength?: number;
  agentLmStudioMaxTokens?: number;
  agentOpenRouterApiKey?: string;
  agentOpenRouterModel?: string;
}

export interface InstallerDownloadRequest {
  url: string;
  destination: string;
}

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

// Settings
export type DiagnosticsStatus = "ok" | "warning" | "error";

export interface DiagnosticsCheck {
  status: DiagnosticsStatus;
  message: string;
  details?: string[];
}

export interface SettingsDiagnostics {
  venv: DiagnosticsCheck;
  plugins: DiagnosticsCheck;
  resolvedPythonPath?: string;
  resolvedPluginsPath?: string;
  detectedPythonPath?: string;
}

export interface P2PServerStatus {
  running: boolean;
  host: string;
  port: number;
  signalingUrl: string;
  shareReady?: boolean;
  pid?: number;
  error?: string;
}

export interface P2PIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface LicenseStatus {
  valid: boolean;
  activated: boolean;
  license_id: string | null;
  plan: string | null;
  email: string | null;
  device_id: string | null;
  updates_until: string | null;
  activated_at: string | null;
  last_validated: string | null;
  error?: string;
}

/**
 * Database Types
 *
 * Type definitions for the OMOIKA database system using @tursodatabase/database.
 * Includes types for event sourcing, graph operations, and job management.
 */

// ============================================================================
// Event Sourcing Types
// ============================================================================
export interface EventStream {
  stream_id: string;
  category: string;
  key: string;
}

export interface AppendEvent {
  category: string;
  key: string;
  event_type: string;
  payload: Record<string, any>;
  valid_from: string;
  valid_to?: string | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  actor_id: string;
  expected_version?: number | null;
}

export interface EventRecord {
  seq: number;
  stream_id: string;
  version: number;
  event_type: string;
  payload: Record<string, any>;
  valid_from: string;
  valid_to: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  actor_id: string;
  created_at: string;
}

export interface EventCheckpoint {
  projection_name: string;
  last_seq: number;
  updated_at: string;
}

// ============================================================================
// Graph Types
// ============================================================================
export interface Position {
  x: number;
  y: number;
}

export interface GraphEntity {
  id: string;
  label: string;
  position?: Position;
  data: Record<string, any>;
  type?: string;
  temp_id?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, any>;
  type?: string;
  label?: string;
  markerEnd?: {
    type: string;
    color: string;
    width: number;
    height: number;
  };
  temp_id?: string;
}

export interface GraphState {
  nodes: GraphEntity[];
  edges: GraphEdge[];
}

// ============================================================================
// Job Management Types
// ============================================================================
export type JobStatus =
  | "enqueued"
  | "leased"
  | "running"
  | "failed"
  | "completed"
  | "canceled"
  | "dead";

export interface Job {
  job_id: string;
  payload: Record<string, any>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewJob {
  payload: Record<string, any>;
  priority?: number;
  max_attempts?: number;
  scheduled_at?: string;
}

// ============================================================================
// Encryption Types
// ============================================================================
export type CipherMode =
  | "aes128gcm"
  | "aes256gcm"
  | "aegis256"
  | "aegis128l"
  | "aegis128x2"
  | "aegis128x4"
  | "aegis256x2"
  | "aegis256x4";

export interface EncryptionConfig {
  cipher: CipherMode;
  hexkey: string;
}

// ============================================================================
// Database Result Types
// ============================================================================
export interface DbRow {
  [key: string]: any;
}

export interface DbResult {
  rows: DbRow[];
  changes: number;
  lastInsertRowid: number | bigint;
}

const database = {
  list: (): Promise<DatabaseMetadata[]> => ipcRenderer.invoke("database:list"),
  create: (payload: DatabaseCreateRequest): Promise<DatabaseCreateResult> =>
    ipcRenderer.invoke("database:create", payload),
  import: (): Promise<DatabaseImportResult> =>
    ipcRenderer.invoke("database:import"),
  export: (databaseId: string): Promise<DatabaseExportResult> =>
    ipcRenderer.invoke("database:export", databaseId),
  delete: (payload: DatabaseDeleteRequest): Promise<DatabaseDeleteResult> =>
    ipcRenderer.invoke("database:delete", payload),
  open: (databaseId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("database:open", databaseId),
};

const cases = {
  list: (
    payload: PaginatePayload,
  ): Promise<{ cases: any[]; favorites: string[] }> =>
    ipcRenderer.invoke("cases:list", payload),
  create: (payload: CaseCreatePayload): Promise<any> =>
    ipcRenderer.invoke("cases:create", payload),
  getById: (uuid: string): Promise<any> =>
    ipcRenderer.invoke("cases:getById", uuid),
  update: (payload: CaseUpdatePayload): Promise<any> =>
    ipcRenderer.invoke("cases:update", payload),
  delete: (payload: CaseDeletePayload): Promise<void> =>
    ipcRenderer.invoke("cases:delete", payload),
  favorite: (payload: CaseFavoritePayload): Promise<void> =>
    ipcRenderer.invoke("cases:favorite", payload),
  exportShare: (payload: {
    kind: "graph" | "database";
    graphId?: string;
    signalingUrl?: string;
    accessCode?: string;
  }): Promise<CaseShareExportResult> =>
    ipcRenderer.invoke("cases:export-share", payload),
  importShare: (payload: {
    url: string;
    preserveCaseIds?: boolean;
  }): Promise<CaseShareImportResult> =>
    ipcRenderer.invoke("cases:import-share", payload),
  activity: (payload: {
    graphId: string;
    skip: number;
    limit: number;
  }): Promise<{ events: any[] }> =>
    ipcRenderer.invoke("cases:activity", payload),
  activitySummary: (payload: {
    graphId: string;
    days: number;
  }): Promise<{
    start: string;
    end: string;
    buckets: { date: string; count: number }[];
  }> => ipcRenderer.invoke("cases:activity-summary", payload),
  chord: (payload: {
    graphId: string;
  }): Promise<{ nodes: any[]; links: any[] }> =>
    ipcRenderer.invoke("cases:chord", payload),
};

const entities = {
  list: (
    payload: PaginatePayload,
  ): Promise<{ entities: any[]; favorites: string[] }> =>
    ipcRenderer.invoke("entities:list", payload),
  create: (payload: EntityCreatePayload): Promise<any> =>
    ipcRenderer.invoke("entities:create", payload),
  getById: (uuid: string): Promise<any> =>
    ipcRenderer.invoke("entities:getById", uuid),
  update: (payload: EntityUpdatePayload): Promise<any> =>
    ipcRenderer.invoke("entities:update", payload),
  delete: (payload: EntityDeletePayload): Promise<void> =>
    ipcRenderer.invoke("entities:delete", payload),
  favorite: (payload: EntityFavoritePayload): Promise<void> =>
    ipcRenderer.invoke("entities:favorite", payload),
  listAttachments: (payload: AttachmentsPayload): Promise<any[]> =>
    ipcRenderer.invoke("entities:listAttachments", payload),
};

// Helper function to parse omoika:// deeplink URLs
// Only parses venvPath - Python and Pip paths are deduced from venv directory
function parseDeeplinkUrl(url: string): DeeplinkPayload {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    if (urlObj.hostname === "graph-collab") {
      return {
        action: "graph-collab",
        graphId: params.get("graphId") || undefined,
        shareId: params.get("shareId") || undefined,
        signalingUrl: params.get("server") || undefined,
      };
    }

    return {
      venvPath: params.get("venvPath") || undefined,
    };
  } catch (error) {
    console.error("Failed to parse deeplink URL:", error);
    return {};
  }
}

const graph = {
  load: (graphId: string): Promise<{ nodes: any[]; edges: any[] }> =>
    ipcRenderer.invoke("graph:load", graphId),

  createEntity: (payload: {
    graphId: string;
    entity: { label: string; x: number; y: number; data?: any };
  }): Promise<any> => ipcRenderer.invoke("graph:create-entity", payload),

  updateEntity: (payload: {
    graphId: string;
    entityId: string;
    updates: { x?: number; y?: number; data?: any };
  }): Promise<void> => ipcRenderer.invoke("graph:update-entity", payload),

  deleteEntity: (payload: {
    graphId: string;
    entityId: string;
  }): Promise<void> => ipcRenderer.invoke("graph:delete-entity", payload),

  createEdge: (payload: {
    graphId: string;
    edge: { source: string; target: string; data?: any; temp_id?: string };
  }): Promise<any> => ipcRenderer.invoke("graph:create-edge", payload),

  updateEdge: (payload: {
    graphId: string;
    edgeId: string;
    updates: { source?: string; target?: string; data?: any };
  }): Promise<void> => ipcRenderer.invoke("graph:update-edge", payload),

  deleteEdge: (payload: { graphId: string; edgeId: string }): Promise<void> =>
    ipcRenderer.invoke("graph:delete-edge", payload),

  applyRemoteOperation: (payload: {
    kind:
      | "entity:create"
      | "entity:update"
      | "entity:delete"
      | "edge:create"
      | "edge:update"
      | "edge:delete";
    graphId: string;
    [key: string]: any;
  }): Promise<void> =>
    ipcRenderer.invoke("graph:apply-remote-operation", payload),

  transform: (payload: {
    graphId: string;
    entity: any;
    transformLabel: string;
    extraPluginDirs?: string[];
  }): Promise<{ jobId: string }> =>
    ipcRenderer.invoke("graph:transform", payload),
};

const plugins = {
  list: (payload?: { extraPluginDirs?: string[] }): Promise<any[]> =>
    ipcRenderer.invoke("plugins:list", payload),
  blueprints: (payload?: {
    extraPluginDirs?: string[];
  }): Promise<Record<string, any>> =>
    ipcRenderer.invoke("plugins:blueprints", payload),
  transforms: (payload: {
    entityLabel: string;
    extraPluginDirs?: string[];
  }): Promise<any[]> => ipcRenderer.invoke("plugins:transforms", payload),
  settingsDefinitions: (payload?: {
    extraPluginDirs?: string[];
  }): Promise<any[]> =>
    ipcRenderer.invoke("plugins:settings-definitions", payload),
  listTransformFiles: (): Promise<EntityFile[]> =>
    ipcRenderer.invoke("plugins:list-transform-files"),
  readTransformFile: (path: string): Promise<string> =>
    ipcRenderer.invoke("plugins:read-transform-file", { path }),
  saveTransformFile: (payload: {
    label: string;
    content: string;
  }): Promise<EntityFile> =>
    ipcRenderer.invoke("plugins:save-transform-file", payload),
  deleteTransformFile: (payload: {
    label?: string;
    path?: string;
  }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("plugins:delete-transform-file", payload),
};

const market = {
  listCommunityPlugins: (): Promise<any[]> =>
    ipcRenderer.invoke("market:list-community-plugins"),
  installCommunityPlugin: (
    repoUrl: string,
  ): Promise<{
    success: boolean;
    alreadyInstalled: boolean;
    installPath: string;
    pluginsRoot: string;
  }> => ipcRenderer.invoke("market:install-community-plugin", repoUrl),
  uninstallCommunityPlugin: (
    repoUrl: string,
  ): Promise<{
    success: boolean;
    removed: boolean;
    installPath: string;
    pluginsRoot: string;
  }> => ipcRenderer.invoke("market:uninstall-community-plugin", repoUrl),
  scanRepo: (repoUrl: string): Promise<any> =>
    ipcRenderer.invoke("market:scan-repo", repoUrl),
  validateLocalDir: (
    dirPath: string,
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("market:validate-local-dir", dirPath),
  fetchRepoFile: (payload: {
    repoUrl: string;
    filePath: string;
    branch: string;
  }): Promise<string> => ipcRenderer.invoke("market:fetch-repo-file", payload),
  scanLocalDir: (
    dirPath: string,
  ): Promise<{
    files: string[];
    manifest: any;
    readme: string | null;
    branch: string;
  }> => ipcRenderer.invoke("market:scan-local-dir", dirPath),
  readLocalFile: (payload: {
    dirPath: string;
    filePath: string;
  }): Promise<string> => ipcRenderer.invoke("market:read-local-file", payload),
};

const transforms = {
  run: (payload: { transformLabel: string; input: any }): Promise<string> =>
    ipcRenderer.invoke("transforms:run", payload),
};

const settings = {
  get: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  update: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke("settings:update", partial),
  setVenvPath: (path: string | undefined): Promise<Settings> =>
    ipcRenderer.invoke("settings:set-venv-path", path),
  diagnose: (): Promise<SettingsDiagnostics> =>
    ipcRenderer.invoke("settings:diagnostics"),
};

const browser = {
  getTorStatus: (): Promise<BrowserTorStatus> =>
    ipcRenderer.invoke("browser:get-tor-status"),
  readClipboardText: (): Promise<string> =>
    ipcRenderer.invoke("browser:clipboard-read-text"),
  writeClipboardText: (text: string): Promise<void> =>
    ipcRenderer.invoke("browser:clipboard-write-text", text),
  configureSession: (payload: {
    partition: string;
    onionMode: boolean;
  }): Promise<{ partition: string; onionMode: boolean }> =>
    ipcRenderer.invoke("browser:configure-session", payload),
  command: (command: BrowserCommand): Promise<BrowserResult> =>
    ipcRenderer.invoke("browser:command", command),
  completeAgentCommand: (payload: {
    requestId: string;
    result?: BrowserResult;
    error?: string;
  }): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke("browser:agent-command-result", payload),
  onAgentCommand: (
    callback: (payload: {
      requestId: string;
      command: BrowserCommand;
      targetTabId?: string;
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: {
        requestId: string;
        command: BrowserCommand;
        targetTabId?: string;
      },
    ) => callback(data);
    ipcRenderer.on("browser:agent-command", handler);
    return () => ipcRenderer.off("browser:agent-command", handler);
  },
};

const aosint = {
  listLmStudioModels: (payload?: {
    baseUrl?: string;
  }): Promise<{ modelKey: string; displayName: string }[]> =>
    ipcRenderer.invoke("aosint:list-lmstudio-models", payload ?? {}),
  runWorkflow: (
    payload: RunOsintWorkflowPayload,
  ): Promise<RunOsintWorkflowResult> =>
    ipcRenderer.invoke("aosint:run-workflow", payload),
  cancelWorkflows: (payload?: {
    caseId?: string;
    caseIdPrefix?: string;
  }): Promise<{ canceled: number }> =>
    ipcRenderer.invoke("aosint:cancel-workflows", payload ?? {}),
  onWorkflowEvent: (callback: (event: AosintWorkflowEvent) => void) => {
    const handler = (_event: unknown, data: AosintWorkflowEvent) =>
      callback(data);
    ipcRenderer.on("aosint:workflow-event", handler);
    return () => ipcRenderer.off("aosint:workflow-event", handler);
  },
};

const agents = {
  listSessions: (payload?: {
    skip?: number;
    limit?: number;
    caseId?: string;
  }) => ipcRenderer.invoke("agents:list-sessions", payload ?? {}),
  getSession: (sessionId: string) =>
    ipcRenderer.invoke("agents:get-session", sessionId),
  getStats: (payload?: { caseId?: string }) =>
    ipcRenderer.invoke("agents:get-stats", payload ?? {}),
};

const p2p = {
  serverStatus: (): Promise<P2PServerStatus> =>
    ipcRenderer.invoke("p2p:server-status"),
  checkUrl: (payload: { signalingUrl: string }): Promise<P2PServerStatus> =>
    ipcRenderer.invoke("p2p:check-url", payload),
  iceServers: (payload: {
    signalingUrl: string;
  }): Promise<{ iceServers: P2PIceServer[] }> =>
    ipcRenderer.invoke("p2p:ice-servers", payload),
  roomPeers: (payload: {
    signalingUrl: string;
    graphId: string;
  }): Promise<{ peers: string[] }> =>
    ipcRenderer.invoke("p2p:room-peers", payload),
  startServer: (payload?: {
    host?: string;
    port?: number;
  }): Promise<P2PServerStatus> =>
    ipcRenderer.invoke("p2p:start-server", payload ?? {}),
  stopServer: (): Promise<P2PServerStatus> =>
    ipcRenderer.invoke("p2p:stop-server"),
};

const tools = {
  listBuiltin: () => ipcRenderer.invoke("tools:list-builtin"),
  setBuiltinEnabled: (name: string, enabled: boolean) =>
    ipcRenderer.invoke("tools:set-builtin-enabled", { name, enabled }),
  list: () => ipcRenderer.invoke("tools:list"),
  save: (payload: {
    id?: string;
    name: string;
    description: string;
    enabled: boolean;
    parameters: {
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
    script: string;
  }) => ipcRenderer.invoke("tools:save", payload),
  delete: (id: string) => ipcRenderer.invoke("tools:delete", id),
};

const license = {
  getStatus: (): Promise<LicenseStatus> =>
    ipcRenderer.invoke("license:get-status"),
  activate: (payload: {
    licenseKey: string;
    deviceLabel?: string;
  }): Promise<LicenseStatus> => ipcRenderer.invoke("license:activate", payload),
  importSigned: (payload: { signedLicense: unknown }): Promise<LicenseStatus> =>
    ipcRenderer.invoke("license:import-signed", payload),
  revalidate: (): Promise<LicenseStatus> =>
    ipcRenderer.invoke("license:revalidate"),
  clear: (): Promise<LicenseStatus> => ipcRenderer.invoke("license:clear"),
};

const installer = {
  download: (url: string): Promise<InstallerDownloadResult> =>
    ipcRenderer.invoke("installer:download", url),
  execute: (path: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("installer:execute", path),
  onProgress: (callback: (progress: InstallerDownloadProgress) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("installer:progress", handler);
    return () => ipcRenderer.off("installer:progress", handler);
  },
  onDeeplink: (callback: (data: DeeplinkPayload) => void) => {
    const handler = (_event: any, url: string) => {
      const parsed = parseDeeplinkUrl(url);
      callback(parsed);
    };
    ipcRenderer.on("deeplink", handler);
    return () => ipcRenderer.off("deeplink", handler);
  },
};

const builder = {
  saveEntity: (payload: { content: string; defaultPath?: string }) =>
    ipcRenderer.invoke("builder:save-entity", payload),
  generateEntity: (payload: { entity: any; outputDir?: string }) =>
    ipcRenderer.invoke("builder:generate-entity", payload),
  onGenerated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("builder:generated", handler);
    return () => ipcRenderer.off("builder:generated", handler);
  },
};

export interface EntityFile {
  label: string;
  filename: string;
  path: string;
  mtime: string;
}

const workspace = {
  listJson: (): Promise<EntityFile[]> =>
    ipcRenderer.invoke("workspace:listJson"),
  listPython: (): Promise<EntityFile[]> =>
    ipcRenderer.invoke("workspace:listPython"),
  saveJson: (label: string, content: string): Promise<EntityFile> =>
    ipcRenderer.invoke("workspace:saveJson", { label, content }),
  savePython: (label: string, content: string): Promise<EntityFile> =>
    ipcRenderer.invoke("workspace:savePython", { label, content }),
  loadJson: (label: string): Promise<string> =>
    ipcRenderer.invoke("workspace:loadJson", label),
  loadPython: (label: string): Promise<string> =>
    ipcRenderer.invoke("workspace:loadPython", label),
  deleteEntity: (label: string, type: "json" | "python"): Promise<void> =>
    ipcRenderer.invoke("workspace:delete", { label, type }),
  getEntitiesDir: (): Promise<string | null> =>
    ipcRenderer.invoke("workspace:getEntitiesDir"),
};

contextBridge.exposeInMainWorld("api", {
  database,
  cases,
  entities,
  graph,
  plugins,
  market,
  transforms,
  settings,
  browser,
  aosint,
  agents,
  p2p,
  tools,
  license,
  installer,
  builder,
  workspace,
  getVersion: async () => ipcRenderer.invoke("app:get-version"),
  openFolderDialog: () => ipcRenderer.invoke("app:open-folder-dialog"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  openInEditor: (payload: { path: string; lineNumber?: number }) =>
    ipcRenderer.invoke("app:open-in-editor", payload),
  onJobEvents: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("job:events", handler);
    return () => ipcRenderer.off("job:events", handler);
  },
  onTransformCompleted: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("transform:completed", handler);
    return () => ipcRenderer.off("transform:completed", handler);
  },
});
