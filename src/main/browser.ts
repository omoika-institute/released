import net from "node:net";
import { session, type Session } from "electron";
import {
  BROWSER_CLEAR_PARTITION_PREFIX,
  BROWSER_ONION_PARTITION_PREFIX,
  type BrowserTorStatus,
  isAllowedBrowserGuestNavigation,
  isSafeBrowserUrl,
} from "../lib/browser";

const TOR_HOST = "127.0.0.1";
const TOR_PORTS = [9050, 9150];
const hardenedPartitions = new Set<string>();
const SESSION_CONFIG_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.setTimeout(750);
  });
}

function hardenBrowserSession(targetSession: Session, partition: string) {
  if (hardenedPartitions.has(partition)) return;
  hardenedPartitions.add(partition);

  targetSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setDisplayMediaRequestHandler((_request, callback) =>
    callback({ video: null, audio: null })
  );
}

export function isAllowedBrowserPartition(partition?: string | null) {
  return (
    typeof partition === "string" &&
    (partition.startsWith(`${BROWSER_CLEAR_PARTITION_PREFIX}:`) ||
      partition.startsWith(`${BROWSER_ONION_PARTITION_PREFIX}:`))
  );
}

export async function detectTorStatus(): Promise<BrowserTorStatus> {
  for (const port of TOR_PORTS) {
    if (await canConnect(TOR_HOST, port)) {
      return {
        available: true,
        host: TOR_HOST,
        port,
        checkedPorts: [...TOR_PORTS],
      };
    }
  }

  return {
    available: false,
    host: TOR_HOST,
    port: null,
    checkedPorts: [...TOR_PORTS],
    error:
      "Tor SOCKS proxy was not reachable on 127.0.0.1:9050 or 127.0.0.1:9150.",
  };
}

export async function configureBrowserSession(
  partition: string,
  onionMode: boolean
) {
  if (!isAllowedBrowserPartition(partition)) {
    throw new Error(`Unsupported browser session partition: ${partition}`);
  }

  const targetSession = session.fromPartition(partition, { cache: true });
  hardenBrowserSession(targetSession, partition);

  // Clear-web browsing uses a dedicated partition and does not need a blocking
  // proxy setup step before the first page can load.
  if (!onionMode) {
    return {
      partition,
      onionMode,
    };
  }

  const torStatus = await detectTorStatus();
  if (!torStatus.available || !torStatus.port) {
    throw new Error(
      torStatus.error ?? "Tor is not reachable on the expected SOCKS ports."
    );
  }

  await withTimeout(
    targetSession.setProxy({
      proxyRules: `socks5://${torStatus.host}:${torStatus.port}`,
      proxyBypassRules: "<-loopback>",
    }),
    SESSION_CONFIG_TIMEOUT_MS,
    "Tor proxy session setup"
  );

  return {
    partition,
    onionMode,
  };
}

export {
  BROWSER_CLEAR_PARTITION_PREFIX,
  BROWSER_ONION_PARTITION_PREFIX,
  isAllowedBrowserGuestNavigation,
  isSafeBrowserUrl,
};
