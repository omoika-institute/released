import type { BrowserEngine } from "./appTabs";
import type { BrowserCommand } from "./aosint/agentTypes";

export const BROWSER_CLEAR_PARTITION_PREFIX = "persist:browser-clear";
export const BROWSER_ONION_PARTITION_PREFIX = "persist:browser-onion";
export const BROWSER_TAB_UPDATE_EVENT = "browser-tab:update";
export const BROWSER_TAB_FOCUS_EVENT = "browser-tab:focus";
export const BROWSER_AGENT_COMMAND_REPLAY_EVENT =
  "browser-agent-command:replay";
export const BROWSER_AGENT_COMMAND_ACCEPTED_EVENT =
  "browser-agent-command:accepted";
export const BROWSER_AGENT_COMMAND_FINISHED_EVENT =
  "browser-agent-command:finished";

export interface BrowserAgentCommandPayload {
  requestId: string;
  command: BrowserCommand;
  targetTabId?: string;
}

export interface BrowserTorStatus {
  available: boolean;
  host: string;
  port: number | null;
  checkedPorts: number[];
  error?: string;
}

export const SEARCH_ENGINE_CONFIG: Record<
  BrowserEngine,
  {
    label: string;
    description: string;
    homeUrl: string;
    onionUrl?: string;
    search: (query: string) => string;
    onionSearch?: (query: string) => string;
  }
> = {
  google: {
    label: "Google",
    description: "Broad index with familiar results and operators.",
    homeUrl: "https://www.google.com",
    search: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  duckduckgo: {
    label: "DuckDuckGo",
    description: "Private-first defaults with a Tor-native onion endpoint.",
    homeUrl: "https://duckduckgo.com",
    onionUrl:
      "http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion",
    search: (query) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    onionSearch: (query) =>
      `http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/?q=${encodeURIComponent(
        query
      )}`,
  },
  brave: {
    label: "Brave",
    description: "Independent search index with a clean, low-noise UI.",
    homeUrl: "https://search.brave.com",
    search: (query) =>
      `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  },
};

export function getBrowserPartition(tabId: string, onionMode: boolean) {
  const prefix = onionMode
    ? BROWSER_ONION_PARTITION_PREFIX
    : BROWSER_CLEAR_PARTITION_PREFIX;

  return `${prefix}:${tabId}`;
}

export function getEngineHomeUrl(engine: BrowserEngine, onionMode: boolean) {
  const config = SEARCH_ENGINE_CONFIG[engine];
  return onionMode && config.onionUrl ? config.onionUrl : config.homeUrl;
}

export function getSearchUrl(
  engine: BrowserEngine,
  query: string,
  onionMode: boolean
) {
  const config = SEARCH_ENGINE_CONFIG[engine];
  if (onionMode && config.onionSearch) return config.onionSearch(query);
  return config.search(query);
}

export function isOnionUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return false;

  try {
    return new URL(rawUrl).hostname.endsWith(".onion");
  } catch {
    return false;
  }
}

export function isSafeBrowserUrl(rawUrl: string) {
  if (rawUrl === "about:blank") return true;

  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isAllowedBrowserGuestNavigation(rawUrl: string) {
  if (rawUrl === "about:blank") return true;
  if (rawUrl.startsWith("chrome-error://")) return true;

  return isSafeBrowserUrl(rawUrl);
}

export function normalizeBrowserInput(
  rawValue: string,
  engine: BrowserEngine,
  onionMode: boolean
) {
  const value = rawValue.trim();
  if (!value) return null;

  const looksLikeSearchQuery =
    /\s/.test(value) ||
    (!value.includes(".") &&
      !value.startsWith("http://") &&
      !value.startsWith("https://"));

  if (looksLikeSearchQuery) {
    return getSearchUrl(engine, value, onionMode);
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)
    ? value
    : `https://${value}`;

  if (!isSafeBrowserUrl(candidate)) return null;

  const parsed = new URL(candidate);
  if (parsed.hostname.endsWith(".onion") && !onionMode) return null;

  return parsed.toString();
}
