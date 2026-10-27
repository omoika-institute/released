import { OpenDialogReturnValue } from "electron";
import type { JSX as PreactJSX } from "preact";
import type { BaseEditor } from "slate";
import type { ReactEditor } from "slate-react";
import type {
  DatabaseCreateRequest,
  DatabaseCreateResult,
  DatabaseDeleteRequest,
  DatabaseDeleteResult,
  DatabaseExportResult,
  DatabaseImportResult,
  DatabaseMetadata,
  DatabaseVerifyPasswordRequest,
  DatabaseVerifyPasswordResult,
} from "./types/database";
import { GraphDetails } from "./api";
import type {
  DeeplinkPayload,
  InstallerDownloadProgress,
  InstallerDownloadResult,
} from "./types/onboarding";
import type { BrowserTorStatus } from "./lib/browser";
import type {
  AosintWorkflowEvent,
  BrowserCommand,
  BrowserResult,
  RunOsintWorkflowPayload,
  RunOsintWorkflowResult,
} from "./lib/aosint/agentTypes";
import type {
  BuiltinToolInfo,
  UserToolDefinition,
  UserToolSavePayload,
} from "./lib/userTools";
import type { Settings, SettingsDiagnostics } from "./types/settings";

export interface PaginatePayload {
  skip: number;
  limit: number;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

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

interface Api {
  getVersion: () => Promise<string>;
  openFolderDialog: () => Promise<OpenDialogReturnValue>;
  openExternal: (url: string) => Promise<void>;
  openInEditor: (payload: {
    path: string;
    lineNumber?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  createNewGarden: (data: CreateGarden) => Promise<CreateGardenResult>;
  onJobEvents: (callback: (data: any) => void) => () => void;
  onTransformCompleted: (callback: (data: any) => void) => () => void;
  workspace: {
    listJson: () => Promise<EntityFile[]>;
    listPython: () => Promise<EntityFile[]>;
    saveJson: (label: string, content: string) => Promise<EntityFile>;
    savePython: (label: string, content: string) => Promise<EntityFile>;
    loadJson: (label: string) => Promise<string>;
    loadPython: (label: string) => Promise<string>;
    deleteEntity: (label: string, type: "json" | "python") => Promise<void>;
    getEntitiesDir: () => Promise<string | null>;
  };
  database: {
    list: () => Promise<DatabaseMetadata[]>;
    create: (payload: DatabaseCreateRequest) => Promise<DatabaseCreateResult>;
    import: () => Promise<DatabaseImportResult>;
    export: (databaseId: string) => Promise<DatabaseExportResult>;
    delete: (payload: DatabaseDeleteRequest) => Promise<DatabaseDeleteResult>;
    verifyPassword: (
      payload: DatabaseVerifyPasswordRequest,
    ) => Promise<DatabaseVerifyPasswordResult>;
    open: (databaseId: string) => Promise<{ success: boolean; error?: string }>;
  };
  entities: {
    create: (payload: CreateEntityPayload) => Entity;
    list: (payload: Paginate) => ListEntitiesResponse;
    getById: (id: string) => EntityWithTransforms;
    update: (payload: UpdateEntityPayload) => Entity;
    delete: (payload: DeleteEntityPayload) => null;
    favorite: (payload: FavoriteEntityPayload) => null;
    listAttachments: (
      graph_id: string,
      entity_id: string,
    ) => Promise<AttachmentItem[]>;
  };
  cases: {
    create: (payload: CreateGraphPayload) => Promise<Graph>;
    list: (payload: Paginate) => Promise<ListGraphsResponse>;
    getById: (id: string) => Promise<GraphDetails>;
    update: (payload: UpdateGraphPayload) => Promise<Graph>;
    delete: (payload: DeleteGraphPayload) => Promise<void>;
    favorite: (payload: {
      graph_id: string;
      is_favorite: boolean;
    }) => Promise<void>;
    exportShare: (payload: {
      kind: "graph" | "database";
      graphId?: string;
      signalingUrl?: string;
      accessCode?: string;
    }) => Promise<{
      url: string;
      shareId: string;
      server: string;
      kind: "graph" | "database";
      caseCount: number;
      eventCount: number;
    }>;
    importShare: (payload: {
      url: string;
      preserveCaseIds?: boolean;
    }) => Promise<{
      kind: "graph" | "database";
      imported: { sourceId: string; localId: string; label: string }[];
      caseCount: number;
      eventCount: number;
    }>;
    activity: (payload: {
      graphId: string;
      skip: number;
      limit: number;
    }) => Promise<{ events: any[] }>;
    activitySummary: (payload: { graphId: string; days: number }) => Promise<{
      start: string;
      end: string;
      buckets: { date: string; count: number }[];
    }>;
    chord: (payload: {
      graphId: string;
    }) => Promise<{ nodes: any[]; links: any[] }>;
  };
  graph: {
    load: (graphId: string) => Promise<{ nodes: any[]; edges: any[] }>;
    createEntity: (payload: {
      graphId: string;
      entity: { label: string; x: number; y: number; data?: any };
    }) => Promise<Graph>;
    updateEntity: (payload: {
      graphId: string;
      entityId: string;
      updates: { x?: number; y?: number; data?: any };
    }) => Promise<void>;
    deleteEntity: (payload: {
      graphId: string;
      entityId: string;
    }) => Promise<void>;
    createEdge: (payload: {
      graphId: string;
      edge: { source: string; target: string; data?: any; temp_id?: string };
    }) => Promise<any>;
    updateEdge: (payload: {
      graphId: string;
      edgeId: string;
      updates: { source?: string; target?: string; data?: any };
    }) => Promise<void>;
    deleteEdge: (payload: { graphId: string; edgeId: string }) => Promise<void>;
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
    }) => Promise<void>;
    transform: (payload: {
      graphId: string;
      entity: any;
      transformLabel: string;
      extraPluginDirs?: string[];
    }) => Promise<{ jobId: string }>;
  };
  transforms: {
    run: (payload: { transformLabel: string; input: any }) => Promise<string>;
  };
  plugins: {
    list: (payload?: { extraPluginDirs?: string[] }) => Promise<any[]>;
    blueprints: (payload?: {
      extraPluginDirs?: string[];
    }) => Promise<Record<string, any>>;
    transforms: (payload: {
      entityLabel: string;
      extraPluginDirs?: string[];
    }) => Promise<any[]>;
    settingsDefinitions: (payload?: {
      extraPluginDirs?: string[];
    }) => Promise<any[]>;
    listTransformFiles: () => Promise<
      {
        label: string;
        filename: string;
        path: string;
        mtime: string;
      }[]
    >;
    readTransformFile: (path: string) => Promise<string>;
    saveTransformFile: (payload: {
      label: string;
      content: string;
    }) => Promise<{
      label: string;
      filename: string;
      path: string;
      mtime: string;
    }>;
    deleteTransformFile: (payload: {
      label?: string;
      path?: string;
    }) => Promise<{ success: boolean }>;
  };
  market: {
    listCommunityPlugins: () => Promise<
      {
        id: string;
        name: string;
        author: string;
        description: string;
        repo: string;
        installed?: boolean;
        license?: string;
        tags?: string[];
        min_app_version?: string;
        homepage?: string;
      }[]
    >;
    installCommunityPlugin: (repoUrl: string) => Promise<{
      success: boolean;
      alreadyInstalled: boolean;
      installPath: string;
      pluginsRoot: string;
    }>;
    uninstallCommunityPlugin: (repoUrl: string) => Promise<{
      success: boolean;
      removed: boolean;
      installPath: string;
      pluginsRoot: string;
    }>;
    scanRepo: (repoUrl: string) => Promise<{
      files: string[];
      manifest: JsonObject | null;
      readme: string | null;
      branch: string;
    }>;
    validateLocalDir: (dirPath: string) => Promise<{ success: boolean }>;
    fetchRepoFile: (payload: {
      repoUrl: string;
      filePath: string;
      branch: string;
    }) => Promise<string>;
    scanLocalDir: (dirPath: string) => Promise<{
      files: string[];
      manifest: any;
      readme: string | null;
      branch: string;
    }>;
    readLocalFile: (payload: {
      dirPath: string;
      filePath: string;
    }) => Promise<string>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (partial: Partial<Settings>) => Promise<Settings>;
    setVenvPath: (path: string | undefined) => Promise<Settings>;
    diagnose: () => Promise<SettingsDiagnostics>;
  };
  installer: {
    download: (url: string) => Promise<InstallerDownloadResult>;
    execute: (path: string) => Promise<{ success: boolean; error?: string }>;
    onProgress: (
      callback: (progress: InstallerDownloadProgress) => void,
    ) => () => void;
    onDeeplink: (callback: (data: DeeplinkPayload) => void) => () => void;
  };
  builder: {
    saveEntity: (payload: {
      content: string;
      defaultPath?: string;
    }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    generateEntity: (payload: { entity: any; outputDir?: string }) => Promise<{
      success: boolean;
      slug?: string;
      targetDir?: string;
      jsonPath?: string;
      pythonPath?: string;
      canceled?: boolean;
    }>;
    onGenerated: (callback: (data: any) => void) => () => void;
  };
  browser: {
    getTorStatus: () => Promise<BrowserTorStatus>;
    readClipboardText: () => Promise<string>;
    writeClipboardText: (text: string) => Promise<void>;
    configureSession: (payload: {
      partition: string;
      onionMode: boolean;
    }) => Promise<{ partition: string; onionMode: boolean }>;
    command: (command: BrowserCommand) => Promise<BrowserResult>;
    completeAgentCommand: (payload: {
      requestId: string;
      result?: BrowserResult;
      error?: string;
    }) => Promise<{ ok: boolean; reason?: string }>;
    onAgentCommand: (
      callback: (payload: {
        requestId: string;
        command: BrowserCommand;
        targetTabId?: string;
      }) => void,
    ) => () => void;
  };
  aosint: {
    listLmStudioModels: (payload?: {
      baseUrl?: string;
    }) => Promise<{ modelKey: string; displayName: string }[]>;
    runWorkflow: (
      payload: RunOsintWorkflowPayload,
    ) => Promise<RunOsintWorkflowResult>;
    cancelWorkflows: (payload?: {
      caseId?: string;
      caseIdPrefix?: string;
    }) => Promise<{ canceled: number }>;
    onWorkflowEvent: (
      callback: (event: AosintWorkflowEvent) => void,
    ) => () => void;
  };
  agents: {
    listSessions: (payload?: {
      skip?: number;
      limit?: number;
      caseId?: string;
    }) => Promise<any[]>;
    getSession: (sessionId: string) => Promise<any | null>;
    getStats: (payload?: { caseId?: string }) => Promise<any>;
  };
  p2p: {
    serverStatus: () => Promise<{
      running: boolean;
      host: string;
      port: number;
      signalingUrl: string;
      shareReady?: boolean;
      pid?: number;
      error?: string;
    }>;
    checkUrl: (payload: { signalingUrl: string }) => Promise<{
      running: boolean;
      host: string;
      port: number;
      signalingUrl: string;
      shareReady?: boolean;
      pid?: number;
      error?: string;
    }>;
    iceServers: (payload: { signalingUrl: string }) => Promise<{
      iceServers: {
        urls: string | string[];
        username?: string;
        credential?: string;
      }[];
    }>;
    roomPeers: (payload: {
      signalingUrl: string;
      graphId: string;
    }) => Promise<{ peers: string[] }>;
    startServer: (payload?: { host?: string; port?: number }) => Promise<{
      running: boolean;
      host: string;
      port: number;
      signalingUrl: string;
      shareReady?: boolean;
      pid?: number;
      error?: string;
    }>;
    stopServer: () => Promise<{
      running: boolean;
      host: string;
      port: number;
      signalingUrl: string;
      shareReady?: boolean;
      pid?: number;
      error?: string;
    }>;
  };
  tools: {
    listBuiltin: () => Promise<BuiltinToolInfo[]>;
    setBuiltinEnabled: (name: string, enabled: boolean) => Promise<void>;
    list: () => Promise<UserToolDefinition[]>;
    save: (payload: UserToolSavePayload) => Promise<UserToolDefinition>;
    delete: (id: string) => Promise<void>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    activate: (payload: {
      licenseKey: string;
      deviceLabel?: string;
    }) => Promise<LicenseStatus>;
    importSigned: (payload: {
      signedLicense: unknown;
    }) => Promise<LicenseStatus>;
    revalidate: () => Promise<LicenseStatus>;
    clear: () => Promise<LicenseStatus>;
  };
}

interface BrowserWebViewElement extends HTMLElement {
  src: string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  loadURL: (url: string) => Promise<void>;
  executeJavaScript: <T>(code: string, userGesture?: boolean) => Promise<T>;
  reload: () => void;
  stop: () => void;
  getURL: () => string;
  getTitle: () => string;
  isLoading: () => boolean;
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      webview: PreactJSX.HTMLAttributes<BrowserWebViewElement> & {
        partition?: string;
        src?: string;
      };
    }
  }
}

interface EntityFile {
  label: string;
  filename: string;
  path: string;
  mtime: string;
}

declare global {
  type JSONObject = JsonObject;

  interface Window {
    api: Api;
  }
}
window.api = window.api || {};

export {};

export type { DatabaseMetadata, DatabaseCreateRequest, DatabaseCreateResult };
