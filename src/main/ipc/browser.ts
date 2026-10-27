import { clipboard, type WebContents } from "electron";
import type { BrowserCommand } from "../../lib/aosint/agentTypes";
import { executeBrowserCommand } from "../browserController";
import { configureBrowserSession, detectTorStatus } from "../browser";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

const pendingVisibleBrowserCommands = new Map<
  string,
  {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout> | null;
  }
>();

const VISIBLE_BROWSER_COMMAND_TIMEOUT_MS = 30000;
const VISIBLE_BROWSER_COMMAND_TIMEOUT_BUFFER_MS = 10000;
let visibleBrowserCommandQueue: Promise<unknown> = Promise.resolve();

function getVisibleBrowserCommandTimeoutMs(command: BrowserCommand) {
  if (command.type === "webSearch") {
    const timeoutMs = command.payload.timeoutMs ?? VISIBLE_BROWSER_COMMAND_TIMEOUT_MS;
    const pages =
      typeof command.payload.pages === "number"
        ? Math.min(Math.max(Math.trunc(command.payload.pages), 1), 5)
        : 1;
    const engines = Math.max(command.payload.engines?.length ?? 1, 1);
    return timeoutMs * pages * engines + VISIBLE_BROWSER_COMMAND_TIMEOUT_BUFFER_MS;
  }
  if ("timeoutMs" in command.payload && command.payload.timeoutMs) {
    return command.payload.timeoutMs + VISIBLE_BROWSER_COMMAND_TIMEOUT_BUFFER_MS;
  }
  return VISIBLE_BROWSER_COMMAND_TIMEOUT_MS;
}

export function requestVisibleBrowserCommand(
  sender: WebContents,
  command: BrowserCommand,
  targetTabId?: string,
  signal?: AbortSignal
) {
  const runCommand = () => new Promise<unknown>((resolve, reject) => {
    const requestId = `${command.id}:visible`;
    if (signal?.aborted) {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Visible browser command was canceled.")
      );
      return;
    }

    const cleanup = () => {
      const pending = pendingVisibleBrowserCommands.get(requestId);
      if (pending?.timeout) clearTimeout(pending.timeout);
      pendingVisibleBrowserCommands.delete(requestId);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Visible browser command was canceled.")
      );
    };
    const timeoutMs = getVisibleBrowserCommandTimeoutMs(command);
    const timeout =
      timeoutMs === null
        ? null
        : setTimeout(() => {
            cleanup();
            reject(
              new Error(
                `Visible browser command timed out after ${timeoutMs}ms.`
              )
            );
          }, timeoutMs);

    pendingVisibleBrowserCommands.set(requestId, {
      resolve: (result) => {
        cleanup();
        resolve(result);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
      timeout,
    });
    signal?.addEventListener("abort", handleAbort, { once: true });

    sender.send("browser:agent-command", {
      requestId,
      command,
      targetTabId,
    });
  });

  const queued = visibleBrowserCommandQueue
    .catch(() => undefined)
    .then(runCommand);
  visibleBrowserCommandQueue = queued.catch(() => undefined);
  return queued;
}

export function registerBrowserIpc(_deps: IpcContext) {
  bindHandle("browser:get-tor-status", async () => detectTorStatus());
  bindHandle("browser:clipboard-read-text", async () => clipboard.readText());
  bindHandle("browser:clipboard-write-text", async (_event, text: string) => {
    clipboard.writeText(text);
  });

  bindHandle(
    "browser:configure-session",
    async (
      _event,
      payload: {
        partition: string;
        onionMode: boolean;
      }
    ) => configureBrowserSession(payload.partition, payload.onionMode)
  );

  bindHandle("browser:command", async (_event, command: BrowserCommand) =>
    executeBrowserCommand(command)
  );

  bindHandle(
    "browser:agent-command-result",
    async (
      _event,
      payload: {
        requestId: string;
        result?: unknown;
        error?: string;
      }
    ) => {
      const pending = pendingVisibleBrowserCommands.get(payload.requestId);
      if (!pending) {
        return { ok: false, reason: "request_not_found" };
      }

      pendingVisibleBrowserCommands.delete(payload.requestId);
      if (pending.timeout) clearTimeout(pending.timeout);

      if (payload.error) {
        pending.reject(new Error(payload.error));
      } else {
        pending.resolve(payload.result);
      }

      return { ok: true };
    }
  );
}
