import { app } from "electron";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export interface P2PServerStatus {
  running: boolean;
  host: string;
  port: number;
  signalingUrl: string;
  shareReady?: boolean;
  pid?: number;
  error?: string;
}

export interface P2PServerStartPayload {
  host?: string;
  port?: number;
}

export interface P2PIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

let serverProcess: ChildProcess | null = null;
let status: P2PServerStatus = {
  running: false,
  host: "127.0.0.1",
  port: 8787,
  signalingUrl: "ws://127.0.0.1:8787/ws",
};

function getSignalingUrl(host: string, port: number) {
  return `ws://${host}:${port}/ws`;
}

function normalizeSignalingUrl(value: string) {
  const clean = value.trim();
  if (!clean) return status.signalingUrl;
  if (clean.startsWith("ws://") || clean.startsWith("wss://")) {
    return clean.endsWith("/ws") ? clean : `${clean.replace(/\/$/, "")}/ws`;
  }
  if (clean.startsWith("http://")) {
    return normalizeSignalingUrl(clean.replace(/^http:\/\//, "ws://"));
  }
  if (clean.startsWith("https://")) {
    return normalizeSignalingUrl(clean.replace(/^https:\/\//, "wss://"));
  }
  return normalizeSignalingUrl(`ws://${clean}`);
}

function signalingUrlToHttpUrl(signalingUrl: string, pathname: string) {
  const normalized = normalizeSignalingUrl(signalingUrl);
  const httpUrl = normalized
    .replace(/^ws:\/\//, "http://")
    .replace(/^wss:\/\//, "https://")
    .replace(/\/ws$/, pathname);
  return new URL(httpUrl);
}

function normalizeHost(host?: string) {
  const clean = host?.trim();
  return clean || "127.0.0.1";
}

function normalizePort(port?: number) {
  if (!Number.isFinite(port)) return 8787;
  return Math.min(Math.max(Math.trunc(port as number), 1), 65535);
}

function getServerBinaryPath() {
  const extension = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    path.join(process.resourcesPath, "server", `server${extension}`),
    path.join(
      app.getAppPath(),
      "server",
      "target",
      "release",
      `server${extension}`,
    ),
    path.join(
      app.getAppPath(),
      "server",
      "target",
      "debug",
      `server${extension}`,
    ),
    path.join(
      process.cwd(),
      "server",
      "target",
      "release",
      `server${extension}`,
    ),
    path.join(process.cwd(), "server", "target", "debug", `server${extension}`),
  ];

  const sourcePath = path.join(app.getAppPath(), "server", "src", "main.rs");
  const sourceMtime = fs.existsSync(sourcePath)
    ? fs.statSync(sourcePath).mtimeMs
    : 0;

  return (
    candidates.find((candidate) => {
      if (!fs.existsSync(candidate)) return false;
      return sourceMtime === 0 || fs.statSync(candidate).mtimeMs >= sourceMtime;
    }) ?? null
  );
}

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 400);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

function canHttpGet(signalingUrl: string, pathname: string) {
  return new Promise<boolean>((resolve) => {
    const url = signalingUrlToHttpUrl(signalingUrl, pathname);
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      { method: "GET", timeout: 800 },
      (response) => {
        response.resume();
        resolve(
          response.statusCode !== undefined &&
            response.statusCode >= 200 &&
            response.statusCode < 300,
        );
      },
    );
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
    request.end();
  });
}

function httpGetJson<T>(signalingUrl: string, pathname: string) {
  return new Promise<T>((resolve, reject) => {
    const url = signalingUrlToHttpUrl(signalingUrl, pathname);
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      { method: "GET", timeout: 1200 },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () => {
          const statusCode = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString("utf8");
          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `P2P server rejected ${pathname} (${statusCode}). ${body}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once("timeout", () => {
      request.destroy();
      reject(new Error(`Timed out requesting ${pathname} from P2P server.`));
    });
    request.once("error", reject);
    request.end();
  });
}

export async function checkP2PServerUrl(signalingUrl: string) {
  const normalized = normalizeSignalingUrl(signalingUrl);
  const url = signalingUrlToHttpUrl(normalized, "/health");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const host = url.hostname;
  const running = await canHttpGet(normalized, "/health");
  const shareReady = running && (await canHttpGet(normalized, "/shares"));

  return {
    running,
    shareReady,
    host,
    port,
    signalingUrl: normalized,
    error: running
      ? shareReady
        ? undefined
        : "P2P server is reachable but does not expose /shares."
      : "P2P server is unreachable.",
  };
}

export async function getP2PRoomPeers(signalingUrl: string, graphId: string) {
  const cleanGraphId = graphId.trim();
  if (!cleanGraphId) return { peers: [] as string[] };
  const body = await httpGetJson<{ peers?: unknown[] }>(
    signalingUrl,
    `/rooms/${encodeURIComponent(cleanGraphId)}/peers`,
  );
  return {
    peers: Array.isArray(body.peers)
      ? body.peers.filter((peer): peer is string => typeof peer === "string")
      : [],
  };
}

export async function getP2PIceServers(signalingUrl: string) {
  const body = await httpGetJson<{ ice_servers?: unknown[] }>(
    signalingUrl,
    "/ice",
  );
  return {
    iceServers: Array.isArray(body.ice_servers)
      ? (body.ice_servers.filter(
          (server): server is P2PIceServer =>
            !!server &&
            typeof server === "object" &&
            ("urls" in server || "url" in server),
        ) as P2PIceServer[])
      : [],
  };
}

async function waitForServer(host: string, port: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await canConnect(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return false;
}

export async function startP2PServer(payload: P2PServerStartPayload = {}) {
  const host = normalizeHost(payload.host);
  const port = normalizePort(payload.port);
  const signalingUrl = getSignalingUrl(host, port);

  if (serverProcess && !serverProcess.killed) {
    const checked = await checkP2PServerUrl(signalingUrl);
    status = {
      ...status,
      running: checked.running,
      shareReady: checked.shareReady,
      host,
      port,
      signalingUrl,
      pid: serverProcess.pid,
      error: checked.error,
    };
    return status;
  }

  if (await canConnect(host, port)) {
    const checked = await checkP2PServerUrl(signalingUrl);
    status = {
      running: checked.running,
      shareReady: checked.shareReady,
      host,
      port,
      signalingUrl,
      error: checked.error,
    };
    return status;
  }

  const env = {
    ...process.env,
    OMOIKA_SIGNALING_ADDR: `${host}:${port}`,
  };
  const binaryPath = getServerBinaryPath();
  const command = binaryPath ?? "cargo";
  const args = binaryPath
    ? []
    : [
        "run",
        "--manifest-path",
        path.join(app.getAppPath(), "server", "Cargo.toml"),
      ];

  serverProcess = spawn(command, args, {
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  serverProcess.unref();
  serverProcess.once("exit", (_code, signal) => {
    status = {
      ...status,
      running: false,
      pid: undefined,
      error: signal ? `Server exited with signal ${signal}` : undefined,
    };
    serverProcess = null;
  });
  serverProcess.once("error", (error) => {
    status = {
      running: false,
      host,
      port,
      signalingUrl,
      error: error.message,
    };
    serverProcess = null;
  });

  const running = await waitForServer(host, port);
  const checked = running
    ? await checkP2PServerUrl(signalingUrl)
    : { shareReady: false };
  status = {
    running,
    shareReady: checked.shareReady,
    host,
    port,
    signalingUrl,
    pid: serverProcess?.pid,
    error: running
      ? "error" in checked
        ? checked.error
        : undefined
      : "Timed out waiting for Rust signaling server.",
  };

  return status;
}

export function stopP2PServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  serverProcess = null;
  status = {
    ...status,
    running: false,
    shareReady: false,
    pid: undefined,
  };
  return status;
}

export async function getP2PServerStatus() {
  const checked = await checkP2PServerUrl(status.signalingUrl);
  status = {
    ...status,
    running: checked.running,
    shareReady: checked.shareReady,
    error: checked.error,
  };
  return status;
}
