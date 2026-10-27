import { BrowserWindow } from "electron";
import type {
  BrowserCommand,
  BrowserExtractedSearchResult,
  BrowserPageSnapshot,
  BrowserReadablePageData,
  BrowserResult,
  BrowserSearchData,
  BrowserSearchEngine,
} from "../lib/aosint/agentTypes";
import {
  buildInteractiveElementsScript,
  buildMetadataScript,
  buildReadablePageScript,
  buildSearchResultsScript,
} from "../lib/aosint/browserScripts";
import {
  deduplicateWebSearchResults,
  getWebSearchUrl,
  interleaveWebSearchResults,
  MAX_WEB_SEARCH_PAGES,
  normalizeWebSearchEngines,
} from "../lib/aosint/browserSearch";

const AGENT_BROWSER_PARTITION = "persist:osint-agent-browser";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_ENGINE_TIMEOUT_MS = 12000;
const MAX_READABLE_PAGE_CHARS = 120000;
const MAX_SEARCH_TEXT_CHARS = 500;

let agentBrowserWindow: BrowserWindow | null = null;

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

function getPageSnapshot(window: BrowserWindow): BrowserPageSnapshot {
  return {
    url: window.webContents.getURL(),
    title: window.webContents.getTitle(),
  };
}

function stringifyForJs(value: unknown) {
  return JSON.stringify(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLogMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function compactLogText(value: string, maxChars = 180) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxChars
    ? collapsed
    : `${collapsed.slice(0, maxChars)}...`;
}

function compactSearchText(value: string, maxChars = MAX_SEARCH_TEXT_CHARS) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxChars
    ? collapsed
    : `${collapsed.slice(0, maxChars)}...`;
}

function sameNavigatedOriginOrUrl(currentUrl: string, requestedUrl: string) {
  try {
    const current = new URL(currentUrl);
    const requested = new URL(requestedUrl);
    return (
      current.href === requested.href ||
      current.origin === requested.origin ||
      current.hostname === requested.hostname
    );
  } catch {
    return Boolean(currentUrl && currentUrl !== "about:blank");
  }
}

function isSafeAgentUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function ensureAgentBrowserWindow() {
  if (agentBrowserWindow && !agentBrowserWindow.isDestroyed()) {
    return agentBrowserWindow;
  }

  agentBrowserWindow = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1024,
    backgroundColor: "#ffffff",
    webPreferences: {
      partition: AGENT_BROWSER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      images: true,
    },
  });

  agentBrowserWindow.on("closed", () => {
    agentBrowserWindow = null;
  });

  return agentBrowserWindow;
}

async function executeInPage<T>(window: BrowserWindow, script: string): Promise<T> {
  return window.webContents.executeJavaScript(script, true) as Promise<T>;
}

async function extractSearchResultsFromCurrentPage(
  window: BrowserWindow,
  engine: BrowserSearchEngine,
  limit: number,
  timeoutMs: number
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const data = await executeInPage<{
      engine: BrowserSearchEngine;
      ready: boolean;
      empty: boolean;
      blocked?: boolean;
      results: BrowserExtractedSearchResult[];
      pageUrl: string;
      pageTitle: string;
    }>(window, buildSearchResultsScript(engine, limit));

    if (data.ready) {
      if (data.blocked) {
        throw new Error(`${engine} search is blocked by human verification.`);
      }
      if (!data.empty && data.results.length === 0) {
        throw new Error(`${engine} search results were detected but could not be extracted.`);
      }
      return data;
    }

    await sleep(150);
  }

  throw new Error(`Timed out waiting for ${engine} search results.`);
}

async function waitForPageLoad(window: BrowserWindow, timeoutMs: number) {
  if (!window.webContents.isLoadingMainFrame()) {
    return;
  }

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.webContents.removeListener("did-finish-load", handleDone);
        window.webContents.removeListener("did-fail-load", handleFail);
      };
      const handleDone = () => {
        cleanup();
        resolve();
      };
      const handleFail = (
        _event: Electron.Event,
        errorCode: number,
        errorDescription: string
      ) => {
        cleanup();
        reject(new Error(`Browser load failed (${errorCode}): ${errorDescription}`));
      };

      window.webContents.once("did-finish-load", handleDone);
      window.webContents.once("did-fail-load", handleFail);
    }),
    timeoutMs,
    "Browser navigation"
  );
}

async function loadUrlForAgent(
  window: BrowserWindow,
  url: string,
  timeoutMs: number,
  label = "Browser navigation"
) {
  try {
    await withTimeout(window.webContents.loadURL(url), timeoutMs, label);
    return { loaded: true, timedOut: false };
  } catch (error) {
    const snapshot = getPageSnapshot(window);
    const usablePage = sameNavigatedOriginOrUrl(snapshot.url, url);

    if (usablePage) {
      if (window.webContents.isLoadingMainFrame()) {
        window.webContents.stop();
      }

      console.warn(
        `[aosint:browser] navigation partial url=${url} current=${snapshot.url} title="${compactLogText(
          snapshot.title || "untitled",
          80
        )}" error="${compactLogText(toLogMessage(error))}"`
      );

      return {
        loaded: false,
        timedOut: true,
        warning: toLogMessage(error),
      };
    }

    throw error;
  }
}

export async function executeBrowserCommand(
  command: BrowserCommand
): Promise<BrowserResult> {
  const startedAt = Date.now();
  console.log("[aosint:browser] command:start", {
    commandId: command.id,
    type: command.type,
    payload: command.payload,
  });
  const window = await ensureAgentBrowserWindow();

  try {
    let result: BrowserResult | undefined;

    switch (command.type) {
      case "navigate": {
        const timeoutMs = command.payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!isSafeAgentUrl(command.payload.url)) {
          throw new Error(`Unsupported browser URL: ${command.payload.url}`);
        }

        const navigation = await loadUrlForAgent(
          window,
          command.payload.url,
          timeoutMs,
          "Browser navigation"
        );
        if ((command.payload.waitForLoad ?? true) && !navigation.timedOut) {
          await waitForPageLoad(window, timeoutMs);
        }

        result = {
          id: command.id,
          ok: true,
          data: navigation,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "getReadableContent":
      case "getVisibleText": {
        const maxChars = Math.min(
          command.payload.maxChars ?? 10000,
          MAX_READABLE_PAGE_CHARS
        );
        const data = await executeInPage<BrowserReadablePageData>(
          window,
          buildReadablePageScript(maxChars)
        );
        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "getLinks": {
        const data = await executeInPage<{
          links: Array<{
            href: string;
            text: string;
            rel: string;
            target: string;
            selector: string;
          }>;
          buttons: Array<{
            tag: string;
            type: string;
            text: string;
            name: string;
            id: string;
            selector: string;
            disabled: boolean;
          }>;
          inputs: Array<{
            tag: string;
            type: string;
            name: string;
            id: string;
            placeholder: string;
            label: string;
            selector: string;
            required: boolean;
            disabled: boolean;
          }>;
        }>(window, buildInteractiveElementsScript());
        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "getMetadata": {
        const data = await executeInPage<{
          title: string;
          description: string;
          canonical: string | null;
          lang: string | null;
          url: string;
        }>(window, buildMetadataScript());
        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "click": {
        const selector = stringifyForJs(command.payload.selector);
        const data = await executeInPage<{ clicked: boolean }>(
          window,
          `(() => {
            const element = document.querySelector(${selector});
            if (!element) throw new Error("Element not found for selector.");
            element.scrollIntoView({ block: "center", inline: "center" });
            (element).click();
            return { clicked: true };
          })()`
        );
        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "type": {
        const selector = stringifyForJs(command.payload.selector);
        const text = stringifyForJs(command.payload.text);
        const submit = Boolean(command.payload.submit);
        const data = await executeInPage<{ typed: boolean; submitted: boolean }>(
          window,
          `(() => {
            const element = document.querySelector(${selector});
            if (!element) throw new Error("Element not found for selector.");
            if (!("value" in element)) {
              throw new Error("Target element does not accept text input.");
            }

            element.focus();
            element.value = ${text};
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));

            if (${submit ? "true" : "false"}) {
              const form = element.closest("form");
              if (form) {
                form.requestSubmit();
              } else {
                element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
              }
            }

            return {
              typed: true,
              submitted: ${submit ? "true" : "false"}
            };
          })()`
        );
        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "waitFor": {
        const timeoutMs = command.payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const selector = command.payload.selector
          ? stringifyForJs(command.payload.selector)
          : "null";
        const text = command.payload.text
          ? stringifyForJs(command.payload.text)
          : "null";
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
          const matched = await executeInPage<boolean>(
            window,
            `(() => {
              const selector = ${selector};
              const text = ${text};
              if (selector && document.querySelector(selector)) return true;
              if (text && (document.body?.innerText || "").includes(text)) return true;
              return false;
            })()`
          );

          if (matched) {
            result = {
              id: command.id,
              ok: true,
              data: { matched: true },
              page: getPageSnapshot(window),
            };
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        if (result) break;
        throw new Error("Condition was not satisfied before timeout.");
      }

      case "webSearch": {
        const timeoutMs = command.payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const normalizedLimit = Math.min(Math.max(command.payload.limit ?? 5, 1), 10);
        const pageCount = Math.min(
          Math.max(Math.trunc(command.payload.pages ?? 1), 1),
          MAX_WEB_SEARCH_PAGES
        );
        const totalLimit = normalizedLimit * pageCount;
        const perEngineLimit = Math.min(Math.max(normalizedLimit * 2, 6), 20);
        const engines = normalizeWebSearchEngines(command.payload.engines);
        const perEngineTimeoutMs = Math.min(
          timeoutMs,
          DEFAULT_SEARCH_ENGINE_TIMEOUT_MS
        );
        const aggregated: BrowserExtractedSearchResult[] = [];
        const engineErrors: Array<{
          engine: BrowserSearchEngine;
          page?: number;
          message: string;
        }> = [];

        for (const engine of engines) {
          for (let page = 1; page <= pageCount; page += 1) {
            try {
              const searchUrl = getWebSearchUrl(
                engine,
                command.payload.query,
                false,
                page
              );
              await loadUrlForAgent(
                window,
                searchUrl,
                perEngineTimeoutMs,
                `${engine} search page ${page} navigation`
              );
              await waitForPageLoad(window, perEngineTimeoutMs).catch(
                (error) => {
                  console.warn(
                    `[aosint:browser] search partial engine=${engine} page=${page} error="${compactLogText(
                      toLogMessage(error)
                    )}"`
                  );
                }
              );

              const extracted = await extractSearchResultsFromCurrentPage(
                window,
                engine,
                perEngineLimit,
                perEngineTimeoutMs
              );

              aggregated.push(...extracted.results);
            } catch (error) {
              const message = toLogMessage(error);
              engineErrors.push({ engine, page, message });
              console.warn(
                `[aosint:browser] search failed engine=${engine} page=${page} error="${compactLogText(
                  message
                )}"`
              );
            }
          }
        }

        if (!aggregated.length && engineErrors.length) {
          throw new Error(
            `No search results collected. ${engineErrors
              .map((entry) => `${entry.engine} page ${entry.page ?? 1}: ${entry.message}`)
              .join("; ")}`
          );
        }

        const mergedResults = interleaveWebSearchResults(aggregated, engines);
        const uniqueResults = deduplicateWebSearchResults(mergedResults);
        const results = uniqueResults.slice(0, totalLimit).map((item, index) => ({
          ...item,
          position: index + 1,
          title: compactSearchText(item.title, 1000),
          description: compactSearchText(item.description, 4000),
          displayUrl: compactSearchText(item.displayUrl, 1000),
        }));
        const data: BrowserSearchData = {
          query: command.payload.query,
          engines,
          pages: pageCount,
          deduplicatedCount: aggregated.length - uniqueResults.length,
          results,
          engineErrors,
        };

        result = {
          id: command.id,
          ok: true,
          data,
          page: getPageSnapshot(window),
        };
        break;
      }

      case "screenshot": {
        const image = await window.webContents.capturePage();
        const png = image.toPNG();
        result = {
          id: command.id,
          ok: true,
          data: {
            format: "png",
            base64: png.toString("base64"),
          },
          page: getPageSnapshot(window),
        };
        break;
      }
    }

    if (!result) {
      throw new Error(`Browser command completed without a result: ${command.type}`);
    }

    console.log("[aosint:browser] command:success", {
      commandId: command.id,
      type: command.type,
      durationMs: Date.now() - startedAt,
      page: result.page,
      ok: result.ok,
    });
    return result;
  } catch (error) {
    console.error("[aosint:browser] command:error", {
      commandId: command.id,
      type: command.type,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      page: !window.isDestroyed() ? getPageSnapshot(window) : null,
    });
    return {
      id: command.id,
      ok: false,
      error: {
        code: "EXEC_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      page:
        !window.isDestroyed() && window.webContents
          ? getPageSnapshot(window)
          : undefined,
    };
  }
}
