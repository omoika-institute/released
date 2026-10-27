import i18n from "@/i18n";

const OPEN_CASE_TABS_STORAGE_KEY = "omoika:open-case-tabs";
const OVERVIEW_TAB_ID_PREFIX = "overview-";
const BROWSER_TAB_ID_PREFIX = "browser-";
export const OPEN_TABS_UPDATED_EVENT = "app-tabs:updated";

export type CaseTabMode = "details" | "flow" | "agents";
export type BrowserEngine = "google" | "duckduckgo" | "brave";

const DEFAULT_BROWSER_ENGINE: BrowserEngine = "google";
const DEFAULT_BROWSER_URL = "https://www.google.com";

export interface OverviewTab {
  kind: "overview";
  id: string;
  label: string;
  selectedCaseId?: string | null;
}

export interface CaseTab {
  kind: "case";
  caseId: string;
  mode: CaseTabMode;
}

export interface RouteTab {
  kind: "route";
  path: string;
  label: string;
}

export interface BrowserTab {
  kind: "browser";
  id: string;
  label: string;
  url: string | null;
  engine: BrowserEngine | null;
  onionMode: boolean;
  openedBy?: "user" | "agent";
  autoCloseWhenInactive?: boolean;
}

export type OpenTab = OverviewTab | CaseTab | RouteTab | BrowserTab;

function getRouteTabPaths(): { path: string; label: string }[] {
  return [
    { path: "/dashboard", label: i18n.t("shared.tabs.caseLibrary") },
    { path: "/agents", label: i18n.t("shared.tabs.agents") },
    { path: "/marketplace", label: i18n.t("shared.tabs.marketplace") },
    { path: "/workspaces", label: i18n.t("shared.tabs.workspaces") },
    { path: "/settings", label: i18n.t("shared.tabs.settings") },
  ];
}

function createTabId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}${crypto.randomUUID()}`;
  }

  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getHighestTabLabelIndex(
  openTabs: OpenTab[],
  kind: OpenTab["kind"],
  baseLabel: string
) {
  const matchingTabs = openTabs.filter(
    (tab): tab is OverviewTab | BrowserTab => tab.kind === kind
  );

  return matchingTabs.reduce((maxIndex, tab) => {
    if (tab.label === baseLabel) return Math.max(maxIndex, 1);

    const match = tab.label.match(new RegExp(`^${baseLabel} (\\d+)$`));
    if (!match) return maxIndex;

    return Math.max(maxIndex, Number(match[1]));
  }, 0);
}

export function getRouteTabForPath(pathname: string): RouteTab | null {
  if (
    pathname.startsWith("/dashboard/case/") ||
    pathname.startsWith("/flow/") ||
    pathname.startsWith("/overview/") ||
    pathname.startsWith("/browser/")
  ) {
    return null;
  }

  for (const { path, label } of getRouteTabPaths()) {
    if (pathname.startsWith(path)) return { kind: "route", path, label };
  }

  return null;
}

export function isRouteTabActive(tab: RouteTab, pathname: string) {
  if (tab.path === "/dashboard") {
    return (
      pathname.startsWith("/dashboard") &&
      !pathname.startsWith("/dashboard/case/")
    );
  }
  return pathname.startsWith(tab.path);
}

export function getTabPath(tab: OpenTab) {
  if (tab.kind === "overview") {
    return tab.selectedCaseId
      ? `/overview/${tab.id}/case/${tab.selectedCaseId}`
      : `/overview/${tab.id}`;
  }
  if (tab.kind === "route") return tab.path;
  if (tab.kind === "browser") return `/browser/${tab.id}`;
  if (tab.mode === "flow") return `/flow/${tab.caseId}`;
  if (tab.mode === "agents") return `/dashboard/case/${tab.caseId}/agents`;
  return `/dashboard/case/${tab.caseId}`;
}

export function createOverviewTabId() {
  return createTabId(OVERVIEW_TAB_ID_PREFIX);
}

export function createBrowserTabId() {
  return createTabId(BROWSER_TAB_ID_PREFIX);
}

export function createOverviewTabLabel(openTabs: OpenTab[]) {
  const nextIndex =
    getHighestTabLabelIndex(
      openTabs,
      "overview",
      i18n.t("shared.tabs.overview")
    ) + 1;

  return nextIndex === 1
    ? i18n.t("shared.tabs.overview")
    : `${i18n.t("shared.tabs.overview")} ${nextIndex}`;
}

export function createBrowserTabLabel(openTabs: OpenTab[]) {
  const nextIndex =
    getHighestTabLabelIndex(
      openTabs,
      "browser",
      i18n.t("shared.tabs.browser")
    ) + 1;

  return nextIndex === 1
    ? i18n.t("shared.tabs.browser")
    : `${i18n.t("shared.tabs.browser")} ${nextIndex}`;
}

export function createBrowserTab(openTabs: OpenTab[]): BrowserTab {
  return {
    kind: "browser",
    id: createBrowserTabId(),
    label: createBrowserTabLabel(openTabs),
    url: DEFAULT_BROWSER_URL,
    engine: DEFAULT_BROWSER_ENGINE,
    onionMode: false,
  };
}

export function readStoredOpenTabs() {
  try {
    const raw = window.localStorage.getItem(OPEN_CASE_TABS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const parsedTabs = parsed.flatMap((value): OpenTab[] => {
      if (typeof value === "string") {
        return [{ kind: "case", caseId: value, mode: "details" }];
      }

      if (
        value &&
        typeof value === "object" &&
        value.kind === "dashboard" &&
        value.id === "dashboard"
      ) {
        return [
          {
            kind: "overview",
            id: `${OVERVIEW_TAB_ID_PREFIX}legacy`,
            label: i18n.t("shared.tabs.overview"),
          },
        ];
      }

      if (
        value &&
        typeof value === "object" &&
        value.kind === "overview" &&
        typeof value.id === "string"
      ) {
        return [
          {
            kind: "overview",
            id: value.id,
            label:
              typeof value.label === "string"
                ? value.label
                : i18n.t("shared.tabs.overview"),
            selectedCaseId:
              typeof value.selectedCaseId === "string"
                ? value.selectedCaseId
                : null,
          },
        ];
      }

      if (
        value &&
        typeof value === "object" &&
        value.kind === "route" &&
        typeof value.path === "string" &&
        typeof value.label === "string"
      ) {
        return [{ kind: "route", path: value.path, label: value.label }];
      }

      if (
        value &&
        typeof value === "object" &&
        value.kind === "browser" &&
        typeof value.id === "string"
      ) {
        const url =
          typeof value.url === "string" ? value.url : DEFAULT_BROWSER_URL;
        const engine =
          value.engine === "google" ||
          value.engine === "duckduckgo" ||
          value.engine === "brave"
            ? value.engine
            : DEFAULT_BROWSER_ENGINE;

        return [
          {
            kind: "browser",
            id: value.id,
            label:
              typeof value.label === "string"
                ? value.label
                : i18n.t("shared.tabs.browser"),
            url,
            engine,
            onionMode: value.onionMode === true,
            openedBy: value.openedBy === "agent" ? "agent" : "user",
            autoCloseWhenInactive: value.autoCloseWhenInactive === true,
          },
        ];
      }

      if (
        value &&
        typeof value === "object" &&
        typeof value.caseId === "string" &&
        (value.mode === "details" ||
          value.mode === "flow" ||
          value.mode === "agents")
      ) {
        return [{ kind: "case", caseId: value.caseId, mode: value.mode }];
      }

      return [];
    });

    const seenRoutePaths = new Set<string>();
    const orderedTabs: OpenTab[] = [];

    for (const tab of parsedTabs) {
      if (tab.kind === "route") {
        if (seenRoutePaths.has(tab.path)) continue;
        seenRoutePaths.add(tab.path);
      }

      orderedTabs.push(tab);
    }

    return orderedTabs;
  } catch {
    return [];
  }
}

export function writeStoredOpenTabs(openTabs: OpenTab[]) {
  window.localStorage.setItem(
    OPEN_CASE_TABS_STORAGE_KEY,
    JSON.stringify(openTabs)
  );

  window.dispatchEvent(
    new CustomEvent(OPEN_TABS_UPDATED_EVENT, {
      detail: {
        openTabs,
      },
    })
  );
}

export function clearStoredOpenTabs() {
  writeStoredOpenTabs([]);
}

export function getCurrentOverviewTabId(pathname: string) {
  const overviewMatch = pathname.match(/^\/overview\/([^/]+)/);
  return overviewMatch ? overviewMatch[1] : null;
}

export function getCurrentOverviewCaseId(pathname: string) {
  const overviewCaseMatch = pathname.match(/^\/overview\/[^/]+\/case\/([^/]+)/);
  return overviewCaseMatch ? overviewCaseMatch[1] : null;
}

export function getCurrentBrowserTabId(pathname: string) {
  const browserMatch = pathname.match(/^\/browser\/([^/]+)/);
  return browserMatch ? browserMatch[1] : null;
}

export function getCurrentCaseRoute(pathname: string) {
  const agentsMatch = pathname.match(/^\/dashboard\/case\/([^/]+)\/agents/);
  if (agentsMatch) {
    return {
      caseId: agentsMatch[1],
      mode: "agents" as const,
    };
  }

  const dashboardMatch = pathname.match(/^\/dashboard\/case\/([^/]+)/);
  if (dashboardMatch) {
    return {
      caseId: dashboardMatch[1],
      mode: "details" as const,
    };
  }

  const flowMatch = pathname.match(/^\/flow\/([^/]+)/);
  if (flowMatch) {
    return {
      caseId: flowMatch[1],
      mode: "flow" as const,
    };
  }

  return {
    caseId: null,
    mode: "default" as const,
  };
}

export function isSameCaseTab(a: CaseTab, b: CaseTab) {
  return a.caseId === b.caseId && a.mode === b.mode;
}

export function isSameTab(a: OpenTab, b: OpenTab) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "overview" && b.kind === "overview") return a.id === b.id;
  if (a.kind === "route" && b.kind === "route") return a.path === b.path;
  if (a.kind === "browser" && b.kind === "browser") return a.id === b.id;
  if (a.kind === "case" && b.kind === "case") return isSameCaseTab(a, b);
  return false;
}

export function isTabActive(
  tab: OpenTab,
  route: {
    currentOverviewTabId: string | null;
    currentBrowserTabId: string | null;
    currentCaseId: string | null;
    currentCaseMode: CaseTabMode | "default";
    pathname: string;
  }
) {
  if (tab.kind === "overview") return route.currentOverviewTabId === tab.id;
  if (tab.kind === "route") return isRouteTabActive(tab, route.pathname);
  if (tab.kind === "browser") return route.currentBrowserTabId === tab.id;
  return (
    tab.caseId === route.currentCaseId && tab.mode === route.currentCaseMode
  );
}

export function getTabKey(tab: OpenTab) {
  if (tab.kind === "overview") return tab.id;
  if (tab.kind === "route") return `route:${tab.path}`;
  if (tab.kind === "browser") return `browser:${tab.id}`;
  return `case:${tab.caseId}:${tab.mode}`;
}

export function findBrowserTabById(openTabs: OpenTab[], tabId: string | null) {
  if (!tabId) return null;

  const tab = openTabs.find(
    (entry): entry is BrowserTab =>
      entry.kind === "browser" && entry.id === tabId
  );

  return tab ?? null;
}
