/**
 * Omoika IPC Integration Module (this is different from Electrons IPC...)
 *
 * Uses a dedicated stdio pipe (fd 3) to communicate with the Python worker. Stdout/stderr remain free for developer logs.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getObEnvironment, resolvePythonExecutable, type ObConfig } from "./ob";
import {
  buildBundledWorkerEnvironment,
  findBundledWorkerPath,
} from "./pythonRuntime";

type ObRuntimeOverrides = {
  venvPath?: string;
  pythonPath?: string;
};

type PluginPathInput = string | string[];
type PluginSettingsMap = Record<string, Record<string, string>>;

export const GLOBAL_PLUGIN_SETTINGS_ID = "__global__";

export function normalizePluginSettingsId(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .replace(/\.py$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildPluginSettingsConfig(
  pluginSettings?: PluginSettingsMap,
  transformLabel?: string | null
) {
  const settings = pluginSettings ?? {};
  const globalSettings = settings[GLOBAL_PLUGIN_SETTINGS_ID] ?? {};
  const transformSettingIds = Array.from(
    new Set(
      [transformLabel, normalizePluginSettingsId(transformLabel)].filter(
        Boolean
      ) as string[]
    )
  );
  const transformSettings =
    transformSettingIds.map((id) => settings[id]).find(Boolean) ?? {};

  return {
    ...globalSettings,
    ...transformSettings,
    pluginSettings: settings,
    plugin_settings: settings,
    globalPluginSettings: globalSettings,
    global_plugin_settings: globalSettings,
  };
}

type ObIpcEvent = {
  id: string;
  type: string;
  event: "response" | "progress" | "result" | "error" | "done";
  ok: boolean;
  payload: any;
};

type ObWorkerError = Error & {
  code?: string;
  details?: Record<string, any>;
};

type ObStreamHandler = (event: ObIpcEvent) => void;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  onEvent?: ObStreamHandler;
};

type WorkerLaunchConfig = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  key: string;
};

function requireVenvPath(overrides?: ObRuntimeOverrides): string {
  const venvPath = overrides?.venvPath?.trim();
  if (!venvPath) {
    throw new Error(
      "Bundled Omoika runtime is unavailable. Build the Python runtime or set a virtual environment path in Settings."
    );
  }
  return venvPath;
}

function resolveObConfig(overrides?: ObRuntimeOverrides): ObConfig {
  const venvPath = requireVenvPath(overrides);
  return { obPath: "ob", venvPath };
}

function resolvePython(config: ObConfig): string {
  return resolvePythonExecutable(config);
}

function resolveWorkerLaunch(overrides?: ObRuntimeOverrides): WorkerLaunchConfig {
  const bundledWorkerPath = findBundledWorkerPath();
  if (bundledWorkerPath) {
    return {
      command: bundledWorkerPath,
      args: [],
      env: buildBundledWorkerEnvironment(),
      key: JSON.stringify({
        mode: "bundled",
        workerPath: bundledWorkerPath,
      }),
    };
  }

  const config = resolveObConfig(overrides);
  const python = overrides?.pythonPath?.trim() || resolvePython(config);
  return {
    command: python,
    args: ["-m", "omoika.ipc_worker"],
    env: getObEnvironment(config),
    key: JSON.stringify({
      mode: "python",
      python,
      venvPath: config.venvPath ?? null,
    }),
  };
}

class ObIpcClient {
  private process: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private pending = new Map<string, PendingRequest>();
  private configKey: string | null = null;

  private start(overrides?: ObRuntimeOverrides): void {
    const launch = resolveWorkerLaunch(overrides);
    const nextKey = launch.key;

    if (this.process && this.configKey === nextKey) return;
    if (this.process && this.configKey !== nextKey) {
      this.reset(new Error("ob worker restarted with updated settings"));
      this.process.kill();
      this.process = null;
    }

    const proc = spawn(launch.command, launch.args, {
      env: launch.env,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    });

    const ipc = proc.stdio[3];
    if (!ipc) {
      throw new Error("Failed to open IPC channel to Omoika worker.");
    }

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      if (text.trim()) {
        console.log("[ob-worker]", text.trim());
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      if (text.trim()) {
        console.warn("[ob-worker]", text.trim());
      }
    });

    ipc.on("data", (data: Buffer) => {
      this.handleData(data);
    });

    proc.on("exit", (code) => {
      const error = new Error(`ob worker exited (code ${code ?? "unknown"})`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.process = null;
    });

    this.process = proc;
    this.configKey = nextKey;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32BE(0);
      if (this.buffer.length < size + 4) break;
      const body = this.buffer.slice(4, 4 + size);
      this.buffer = this.buffer.slice(4 + size);
      try {
        const msg = JSON.parse(body.toString("utf8")) as ObIpcEvent;
        this.handleMessage(msg);
      } catch (error) {
        console.error("[ob-worker] Failed to parse IPC message:", error);
      }
    }
  }

  private handleMessage(msg: ObIpcEvent): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;

    if (pending.onEvent) {
      pending.onEvent(msg);
    }

    if (msg.event === "error") {
      const message = msg.payload?.message || "Worker request failed";
      const error = new Error(message) as ObWorkerError;
      if (typeof msg.payload?.code === "string") {
        error.code = msg.payload.code;
      }
      if (msg.payload?.details && typeof msg.payload.details === "object") {
        error.details = msg.payload.details;
      }
      pending.reject(error);
      this.pending.delete(msg.id);
      return;
    }

    if (msg.event === "response" || msg.event === "done") {
      pending.resolve(msg.payload);
      this.pending.delete(msg.id);
    }
  }

  private reset(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  close(reason = "ob worker closed"): void {
    this.reset(new Error(reason));
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.configKey = null;
    this.buffer = Buffer.alloc(0);
  }

  private sendMessage(
    message: Record<string, any>,
    overrides?: ObRuntimeOverrides
  ): void {
    this.start(overrides);
    if (!this.process) throw new Error("Worker process not available.");
    const stdin = this.process.stdin;
    if (!stdin) throw new Error("Worker stdin not available.");
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    stdin.write(Buffer.concat([header, body]));
  }

  request<T>(
    type: string,
    payload?: Record<string, any>,
    onEvent?: ObStreamHandler,
    overrides?: ObRuntimeOverrides
  ): Promise<T> {
    const id = randomUUID();
    this.sendMessage({ id, type, payload }, overrides);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onEvent });
    });
  }
}

// Metadata lookups and transform execution should not share the same Python
// worker process. The worker handles one IPC request at a time, so a
// long-running transform would otherwise block fast "entities / blueprints /
// transforms" requests and make the context menu appear hung.
const obQueryWorker = new ObIpcClient();

export type ObTransformStreamEvent = ObIpcEvent;

export async function execObTransformStream(
  payload: string,
  options?: {
    pluginsPath?: PluginPathInput;
    cfg?: any;
    venvPath?: string;
    pythonPath?: string;
    onEvent?: (event: ObTransformStreamEvent) => void;
  }
): Promise<{ count?: number }> {
  const client = new ObIpcClient();
  try {
    return await client.request(
      "transform",
      {
        source: payload,
        pluginsPath: options?.pluginsPath,
        cfg: options?.cfg,
      },
      options?.onEvent,
      {
        venvPath: options?.venvPath,
        pythonPath: options?.pythonPath,
      }
    );
  } finally {
    client.close("transform worker closed");
  }
}

export async function execObTransform(
  payload: string,
  options?: {
    cfg?: any;
    pluginsPath?: PluginPathInput;
    venvPath?: string;
    pythonPath?: string;
  }
): Promise<string> {
  const results: any[] = [];
  await execObTransformStream(payload, {
    pluginsPath: options?.pluginsPath,
    venvPath: options?.venvPath,
    pythonPath: options?.pythonPath,
    cfg: options?.cfg,
    onEvent: (event) => {
      if (event.event === "result" && Array.isArray(event.payload)) {
        results.push(...event.payload);
      }
    },
  });
  return results.length ? JSON.stringify(results, null, 2) : "";
}

/**
 * Gets entity blueprints from `ob blueprints`.
 * Returns a map of entity_label -> blueprint.
 */
export async function getEntityBlueprints(
  pluginsPath?: PluginPathInput,
  venvPath?: string,
  pythonPath?: string
): Promise<Record<string, any>> {
  try {
    return await obQueryWorker.request("blueprints", { pluginsPath }, undefined, {
      venvPath,
      pythonPath,
    });
  } catch (error) {
    console.error("[CLI] Failed to get entity blueprints:", error);
    return {};
  }
}

/**
 * Gets available plugins from `ob entities`.
 * Returns an array of plugin metadata.
 */
export async function getAvailablePlugins(
  pluginsPath?: PluginPathInput,
  venvPath?: string,
  pythonPath?: string
): Promise<any[]> {
  try {
    const plugins = await obQueryWorker.request(
      "entities",
      { pluginsPath },
      undefined,
      {
        venvPath,
        pythonPath,
      }
    );
    return Array.isArray(plugins) ? plugins : [];
  } catch (error) {
    console.error("[CLI] Failed to get available plugins:", error);
    return [];
  }
}

/**
 * Gets transforms for a specific entity label.
 * Returns an array of transform metadata.
 */
export async function getEntityTransforms(
  entityLabel: string,
  pluginsPath?: PluginPathInput,
  venvPath?: string,
  pythonPath?: string
): Promise<any[]> {
  try {
    const transforms = await obQueryWorker.request(
      "transforms",
      {
        label: entityLabel,
        pluginsPath,
      },
      undefined,
      {
        venvPath,
        pythonPath,
      }
    );
    return Array.isArray(transforms) ? transforms : [];
  } catch (error) {
    console.error(`Failed to get transforms for ${entityLabel}:`, error);
    return [];
  }
}
