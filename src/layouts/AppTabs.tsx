import type { Graph } from "@/api";
import { Icon } from "@/components/icons";
import {
  BROWSER_AGENT_COMMAND_ACCEPTED_EVENT,
  BROWSER_AGENT_COMMAND_FINISHED_EVENT,
  BROWSER_AGENT_COMMAND_REPLAY_EVENT,
  BROWSER_TAB_FOCUS_EVENT,
  BROWSER_TAB_UPDATE_EVENT,
  SEARCH_ENGINE_CONFIG,
  type BrowserAgentCommandPayload,
} from "@/lib/browser";
import {
  createBrowserTab,
  createOverviewTabId,
  createOverviewTabLabel,
  findBrowserTabById,
  getCurrentBrowserTabId,
  getCurrentCaseRoute,
  getCurrentOverviewCaseId,
  getCurrentOverviewTabId,
  getRouteTabForPath,
  getTabKey,
  getTabPath,
  isSameCaseTab,
  isSameTab,
  isTabActive,
  readStoredOpenTabs,
  writeStoredOpenTabs,
  type BrowserEngine,
  type CaseTab,
  type OpenTab,
  type OverviewTab,
} from "@/lib/appTabs";
import { useCasesStore, useFlowStore } from "@/stores";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import Tooltip from "@/components/Tooltip";

function getRouteTabIcon(path: string) {
  switch (path) {
    case "/dashboard":
      return "home-infinity";
    case "/agents":
      return "cpu";
    case "/marketplace":
      return "shopping-bag";
    case "/workspaces":
      return "folder";
    case "/settings":
      return "settings";
    default:
      return "settings";
  }
}

function getRouteTabTranslationKey(path: string) {
  switch (path) {
    case "/dashboard":
      return "shared.tabs.caseLibrary";
    case "/agents":
      return "shared.tabs.agents";
    case "/marketplace":
      return "shared.tabs.marketplace";
    case "/workspaces":
      return "shared.tabs.workspaces";
    case "/settings":
      return "shared.tabs.settings";
    default:
      return null;
  }
}

function translateNumberedStoredLabel(
  label: string,
  storedBaseLabel: string,
  translatedBaseLabel: string,
) {
  if (label === storedBaseLabel) return translatedBaseLabel;

  const prefix = `${storedBaseLabel} `;
  if (!label.startsWith(prefix)) return label;

  const suffix = label.slice(prefix.length);
  return /^\d+$/.test(suffix) ? `${translatedBaseLabel} ${suffix}` : label;
}

function buildFallbackCase(caseId: string, label: string): Graph {
  return {
    id: caseId,
    label,
    description: "",
    ctime: "",
    mtime: "",
  };
}

const GRAPH_SIGNALING_URL_STORAGE_KEY = "omoika:graph-signaling-url";
const GRAPH_SIGNALING_URL_CHANGED_EVENT = "omoika:graph-signaling-url-changed";
const DEFAULT_GRAPH_SIGNALING_URL = "ws://127.0.0.1:8787/ws";

function createInviteCode() {
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  const value = bytes[0] || Math.floor(Math.random() * 1_000_000);
  return String(value % 1_000_000).padStart(6, "0");
}

function normalizeSignalingUrl(value: string) {
  const clean = value.trim();
  if (!clean) return DEFAULT_GRAPH_SIGNALING_URL;

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

function setGraphSignalingUrl(url: string) {
  window.localStorage.setItem(GRAPH_SIGNALING_URL_STORAGE_KEY, url);
  window.dispatchEvent(new CustomEvent(GRAPH_SIGNALING_URL_CHANGED_EVENT));
}

export default function AppTabs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(readStoredOpenTabs);
  const [focusedBrowserTabId, setFocusedBrowserTabId] = useState<string | null>(
    null,
  );
  const previousOverviewTabIdRef = useRef<string | null>(null);
  const previousOpenTabsRef = useRef<OpenTab[] | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const replayedAgentCommandIdsRef = useRef<Set<string>>(new Set());
  const acceptedAgentCommandIdsRef = useRef<Set<string>>(new Set());
  const activeBrowserTabIdRef = useRef<string | null>(null);
  const pendingAgentBrowserCommandIdsRef = useRef<Map<string, Set<string>>>(
    new Map(),
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [p2pPanelOpen, setP2pPanelOpen] = useState(false);
  const [p2pServerHost, setP2pServerHost] = useState("127.0.0.1");
  const [p2pServerPort, setP2pServerPort] = useState("8787");
  const [p2pConnectUrl, setP2pConnectUrl] = useState(
    () =>
      window.localStorage.getItem(GRAPH_SIGNALING_URL_STORAGE_KEY) ??
      DEFAULT_GRAPH_SIGNALING_URL,
  );
  const [p2pServerStatus, setP2pServerStatus] = useState<{
    running: boolean;
    host: string;
    port: number;
    signalingUrl: string;
    shareReady?: boolean;
    error?: string;
  } | null>(null);
  const { graphs, isLoading, fetchCases } = useCasesStore();
  const casesFetchRequestedRef = useRef(false);

  const currentCaseRoute = useMemo(
    () => getCurrentCaseRoute(location.pathname),
    [location.pathname],
  );

  const currentCaseId = currentCaseRoute.caseId;
  const currentOverviewTabId = useMemo(
    () => getCurrentOverviewTabId(location.pathname),
    [location.pathname],
  );
  const currentOverviewCaseId = useMemo(
    () => getCurrentOverviewCaseId(location.pathname),
    [location.pathname],
  );
  const currentBrowserTabId = useMemo(
    () => getCurrentBrowserTabId(location.pathname),
    [location.pathname],
  );
  const activeBrowserTabId = focusedBrowserTabId ?? currentBrowserTabId;
  activeBrowserTabIdRef.current = activeBrowserTabId;

  // Always-current refs for location-derived values. Updated synchronously
  // during render so effects can read them without listing them as deps.
  // This lets the orphaned-tab effect fire only on openTabs changes (i.e.
  // a tab was closed) rather than on every URL change.
  const currentCaseIdRef = useRef(currentCaseId);
  const caseRouteModeRef = useRef(currentCaseRoute.mode);
  const currentOverviewTabIdRef = useRef(currentOverviewTabId);
  const currentBrowserTabIdRef = useRef(currentBrowserTabId);
  const pathnameRef = useRef(location.pathname);
  currentCaseIdRef.current = currentCaseId;
  caseRouteModeRef.current = currentCaseRoute.mode;
  currentOverviewTabIdRef.current = currentOverviewTabId;
  currentBrowserTabIdRef.current = currentBrowserTabId;
  pathnameRef.current = location.pathname;

  const graphMap = useMemo(
    () => new Map(graphs.map((graph) => [graph.id, graph])),
    [graphs],
  );

  const renderedTabs = useMemo(
    () =>
      openTabs.map((tab) =>
        tab.kind === "case"
          ? {
              ...tab,
              graph:
                graphMap.get(tab.caseId) ??
                buildFallbackCase(
                  tab.caseId,
                  t("appTabs.fallbackCase", { id: tab.caseId.slice(0, 8) }),
                ),
            }
          : tab,
      ),
    [graphMap, openTabs, t],
  );

  useEffect(() => {
    if (!casesFetchRequestedRef.current && graphs.length === 0 && !isLoading) {
      casesFetchRequestedRef.current = true;
      void fetchCases({ skip: 0, limit: 100 });
    }
  }, [fetchCases, graphs.length, isLoading]);

  useEffect(() => {
    if (!currentCaseId || currentCaseRoute.mode === "default") return;

    const navigatedFromOverview =
      (location.state as { fromOverview?: boolean } | null)?.fromOverview ===
      true;
    const previousOverviewTabId = previousOverviewTabIdRef.current;

    setOpenTabs((currentTabs) => {
      const currentRouteTab: CaseTab = {
        kind: "case",
        caseId: currentCaseId,
        mode: currentCaseRoute.mode,
      };

      const existingTabIndex = currentTabs.findIndex(
        (tab): tab is CaseTab =>
          tab.kind === "case" && isSameCaseTab(tab, currentRouteTab),
      );

      // Only replace the overview tab when the navigation explicitly originated
      // from within overview content (signalled by location.state.fromOverview).
      // Clicking an existing case tab in the tab bar while on overview does NOT
      // carry this flag, so the overview tab is preserved in that case.
      const overviewTabIndex =
        navigatedFromOverview && previousOverviewTabId
          ? currentTabs.findIndex(
              (tab): tab is OverviewTab =>
                tab.kind === "overview" && tab.id === previousOverviewTabId,
            )
          : -1;

      if (overviewTabIndex >= 0) {
        if (existingTabIndex >= 0) {
          // Case+mode already open — just navigate to it, keep overview tab.
          return currentTabs;
        }

        // New case opened from overview — add case tab, keep overview tab.
        return [...currentTabs, currentRouteTab];
      }

      if (existingTabIndex >= 0) {
        return currentTabs.map((tab, index) =>
          index === existingTabIndex ? currentRouteTab : tab,
        );
      }

      return [...currentTabs, currentRouteTab];
    });
  }, [currentCaseId, currentCaseRoute.mode, location.state]);

  useEffect(() => {
    if (currentBrowserTabId) {
      setFocusedBrowserTabId(currentBrowserTabId);
      window.dispatchEvent(
        new CustomEvent(BROWSER_TAB_FOCUS_EVENT, {
          detail: { tabId: currentBrowserTabId },
        }),
      );
      return;
    }

    setFocusedBrowserTabId(null);
    window.dispatchEvent(
      new CustomEvent(BROWSER_TAB_FOCUS_EVENT, {
        detail: { tabId: null },
      }),
    );
  }, [currentBrowserTabId]);

  useEffect(() => {
    if (!currentBrowserTabId) return;

    setOpenTabs((currentTabs) => {
      const existingTab = findBrowserTabById(currentTabs, currentBrowserTabId);
      if (existingTab) return currentTabs;

      return [
        ...currentTabs,
        {
          kind: "browser",
          id: currentBrowserTabId,
          label: t("shared.tabs.browser"),
          url: SEARCH_ENGINE_CONFIG.google.homeUrl,
          engine: "google",
          onionMode: false,
        },
      ];
    });
  }, [currentBrowserTabId, t]);

  useEffect(() => {
    previousOverviewTabIdRef.current = currentOverviewTabId;
  }, [currentOverviewTabId]);

  useEffect(() => {
    if (!currentOverviewTabId) return;

    setOpenTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.kind !== "overview" || tab.id !== currentOverviewTabId) {
          return tab;
        }

        const selectedCaseId = currentOverviewCaseId ?? null;
        if ((tab.selectedCaseId ?? null) === selectedCaseId) return tab;

        return {
          ...tab,
          selectedCaseId,
        };
      }),
    );
  }, [currentOverviewCaseId, currentOverviewTabId]);

  useEffect(() => {
    if (graphs.length === 0) return;

    const knownIds = new Set(graphs.map((graph) => graph.id));
    setOpenTabs((currentTabs) =>
      currentTabs.filter((tab) => {
        if (
          tab.kind === "overview" ||
          tab.kind === "route" ||
          tab.kind === "browser"
        ) {
          return true;
        }
        return knownIds.has(tab.caseId) || tab.caseId === currentCaseId;
      }),
    );
  }, [currentCaseId, graphs]);

  // Register a route tab the first time the user visits a tracked route path.
  useEffect(() => {
    const routeTab = getRouteTabForPath(location.pathname);
    if (!routeTab) return;

    setOpenTabs((currentTabs) => {
      const exists = currentTabs.some(
        (tab) => tab.kind === "route" && tab.path === routeTab.path,
      );
      if (exists) return currentTabs;
      return [...currentTabs, routeTab];
    });
  }, [location.pathname]);

  useEffect(() => {
    writeStoredOpenTabs(openTabs);
  }, [openTabs]);

  const closeInactiveAgentBrowserTab = useCallback((tabId: string) => {
    if (activeBrowserTabIdRef.current === tabId) return;
    if ((pendingAgentBrowserCommandIdsRef.current.get(tabId)?.size ?? 0) > 0) {
      return;
    }

    setOpenTabs((currentTabs) =>
      currentTabs.filter((tab) => {
        if (tab.kind !== "browser" || tab.id !== tabId) return true;
        return !(tab.openedBy === "agent" && tab.autoCloseWhenInactive);
      }),
    );
  }, []);

  useEffect(() => {
    for (const tab of openTabs) {
      if (
        tab.kind === "browser" &&
        tab.openedBy === "agent" &&
        tab.autoCloseWhenInactive
      ) {
        closeInactiveAgentBrowserTab(tab.id);
      }
    }
  }, [activeBrowserTabId, closeInactiveAgentBrowserTab, openTabs]);

  useEffect(() => {
    const handleBrowserTabUpdate = (
      event: Event & {
        detail?: {
          id?: string;
          label?: string;
          url?: string | null;
          engine?: BrowserEngine | null;
          onionMode?: boolean;
        };
      },
    ) => {
      const tabId = event.detail?.id;
      if (!tabId) return;

      setOpenTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.kind !== "browser" || tab.id !== tabId) return tab;

          return {
            ...tab,
            label: event.detail?.label ?? tab.label,
            url:
              event.detail && "url" in event.detail
                ? (event.detail.url ?? null)
                : tab.url,
            engine:
              event.detail && "engine" in event.detail
                ? (event.detail.engine ?? null)
                : tab.engine,
            onionMode:
              event.detail && "onionMode" in event.detail
                ? (event.detail.onionMode ?? false)
                : tab.onionMode,
          };
        }),
      );
    };

    window.addEventListener(
      BROWSER_TAB_UPDATE_EVENT,
      handleBrowserTabUpdate as EventListener,
    );

    return () =>
      window.removeEventListener(
        BROWSER_TAB_UPDATE_EVENT,
        handleBrowserTabUpdate as EventListener,
      );
  }, [closeInactiveAgentBrowserTab]);

  useEffect(() => {
    if (openTabs.length > 0) return;

    const newTab: OverviewTab = {
      kind: "overview",
      id: createOverviewTabId(),
      label: t("shared.tabs.overview"),
      selectedCaseId: null,
    };

    setOpenTabs([newTab]);
    navigate(`/overview/${newTab.id}`);
  }, [navigate, openTabs.length, t]);

  useEffect(() => {
    const handleAccepted = (
      event: Event & {
        detail?: { requestId?: string; tabId?: string };
      },
    ) => {
      const requestId = event.detail?.requestId;
      if (requestId) acceptedAgentCommandIdsRef.current.add(requestId);
    };
    const handleFinished = (
      event: Event & {
        detail?: { requestId?: string; tabId?: string };
      },
    ) => {
      const requestId = event.detail?.requestId;
      const tabId = event.detail?.tabId;
      if (!requestId || !tabId) return;

      const pendingForTab = pendingAgentBrowserCommandIdsRef.current.get(tabId);
      pendingForTab?.delete(requestId);
      if (pendingForTab?.size === 0) {
        pendingAgentBrowserCommandIdsRef.current.delete(tabId);
      }

      closeInactiveAgentBrowserTab(tabId);
    };

    window.addEventListener(
      BROWSER_AGENT_COMMAND_ACCEPTED_EVENT,
      handleAccepted as EventListener,
    );
    window.addEventListener(
      BROWSER_AGENT_COMMAND_FINISHED_EVENT,
      handleFinished as EventListener,
    );

    return () => {
      window.removeEventListener(
        BROWSER_AGENT_COMMAND_ACCEPTED_EVENT,
        handleAccepted as EventListener,
      );
      window.removeEventListener(
        BROWSER_AGENT_COMMAND_FINISHED_EVENT,
        handleFinished as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const replayToBrowserTab = (payload: BrowserAgentCommandPayload) => {
      const maxAttempts = 120;
      const replay = (attempt: number) => {
        if (acceptedAgentCommandIdsRef.current.has(payload.requestId)) return;
        if (attempt >= maxAttempts) return;

        window.dispatchEvent(
          new CustomEvent(BROWSER_AGENT_COMMAND_REPLAY_EVENT, {
            detail: payload,
          }),
        );

        window.setTimeout(() => replay(attempt + 1), 250);
      };

      window.setTimeout(() => replay(0), 0);
    };

    const unsubscribe = window.api.browser.onAgentCommand((payload) => {
      const targetTabId = payload.targetTabId;
      if (!targetTabId) return;

      const currentTabs = readStoredOpenTabs();
      if (replayedAgentCommandIdsRef.current.has(payload.requestId)) return;

      replayedAgentCommandIdsRef.current.add(payload.requestId);
      const pendingForTab =
        pendingAgentBrowserCommandIdsRef.current.get(targetTabId) ?? new Set();
      pendingForTab.add(payload.requestId);
      pendingAgentBrowserCommandIdsRef.current.set(targetTabId, pendingForTab);
      if (findBrowserTabById(currentTabs, targetTabId)) {
        replayToBrowserTab(payload);
        return;
      }

      const requestedUrl =
        payload.command.type === "navigate"
          ? payload.command.payload.url
          : null;
      const label =
        payload.command.type === "webSearch"
          ? t("appTabs.agentSearch")
          : t("appTabs.agentBrowser");
      const autoCloseWhenInactive = payload.command.type === "webSearch";

      setOpenTabs((tabs) => {
        if (findBrowserTabById(tabs, targetTabId)) return tabs;

        return [
          ...tabs,
          {
            kind: "browser",
            id: targetTabId,
            label,
            url: requestedUrl,
            engine: "duckduckgo",
            onionMode: false,
            openedBy: "agent",
            autoCloseWhenInactive,
          },
        ];
      });

      replayToBrowserTab(payload);
    });

    return unsubscribe;
  }, [t]);

  const focusBrowserTab = (tabId: string) => {
    setFocusedBrowserTabId(tabId);
    window.dispatchEvent(
      new CustomEvent(BROWSER_TAB_FOCUS_EVENT, {
        detail: { tabId },
      }),
    );
  };

  const clearFocusedBrowserTab = () => {
    setFocusedBrowserTabId(null);
    window.dispatchEvent(
      new CustomEvent(BROWSER_TAB_FOCUS_EVENT, {
        detail: { tabId: null },
      }),
    );
  };

  const navigateToTab = (tab: OpenTab) => {
    if (tab.kind === "browser") {
      focusBrowserTab(tab.id);
      return;
    }

    clearFocusedBrowserTab();
    navigate(getTabPath(tab));
  };

  const openOverviewTab = () => {
    const nextTabId = createOverviewTabId();
    let nextLabel = t("shared.tabs.overview");

    setOpenTabs((currentTabs) => {
      nextLabel = createOverviewTabLabel(currentTabs);

      return [
        ...currentTabs,
        {
          kind: "overview",
          id: nextTabId,
          label: nextLabel,
          selectedCaseId: null,
        },
      ];
    });
    clearFocusedBrowserTab();
    navigate(`/overview/${nextTabId}`);
  };

  const openBrowserTab = () => {
    const nextTab = createBrowserTab(openTabs);

    setOpenTabs((currentTabs) => [...currentTabs, nextTab]);
    focusBrowserTab(nextTab.id);
  };

  // When a tab is closed and the current route becomes orphaned, navigate to
  // the last remaining tab. Only [openTabs] is listed as a dep so this effect
  // does NOT fire on URL changes — navigating to a new case URL (/flow/:id)
  // has no tab yet, but the case-route effect above will register one; once
  // it does, openTabs changes and this effect re-runs with activeTabExists=true.
  // Location values are read via refs so they are always current. We also
  // ignore the initial mount and any non-shrinking updates, because orphan
  // recovery should only happen after tabs were removed.
  useEffect(() => {
    if (openTabs.length === 0) return; // empty-tabs effect handles this
    const previousOpenTabs = previousOpenTabsRef.current;
    previousOpenTabsRef.current = openTabs;

    if (previousOpenTabs === null) return;
    if (openTabs.length >= previousOpenTabs.length) return;

    const caseId = currentCaseIdRef.current;
    const mode = caseRouteModeRef.current;
    const ovId = currentOverviewTabIdRef.current;
    const browserId = currentBrowserTabIdRef.current;
    const pathname = pathnameRef.current;
    const activeTabExists = openTabs.some((tab) =>
      isTabActive(tab, {
        currentOverviewTabId: ovId,
        currentBrowserTabId: browserId,
        currentCaseId: caseId,
        currentCaseMode: mode,
        pathname,
      }),
    );

    if (activeTabExists) return;

    const fallback = openTabs[openTabs.length - 1];
    if (!fallback) return;

    navigate(getTabPath(fallback));
  }, [openTabs, navigate]);

  const closeTab = (tabToClose: OpenTab) => {
    if (tabToClose.kind === "browser" && activeBrowserTabId === tabToClose.id) {
      clearFocusedBrowserTab();
    }

    if (tabToClose.kind === "case" && tabToClose.mode === "flow") {
      useFlowStore.getState().dropGraphSnapshot(tabToClose.caseId);
    }

    setOpenTabs((currentTabs) =>
      currentTabs.filter((tab) => !isSameTab(tab, tabToClose)),
    );
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null) {
      dragIndexRef.current = null;
      setDragOverIndex(null);
      return;
    }

    setOpenTabs((tabs) => {
      // dropIndex === tabs.length means "append to end"
      const clampedDrop = Math.min(dropIndex, tabs.length);
      const next = [...tabs];
      const [moved] = next.splice(fromIndex, 1);
      // After removal, adjust target index if we removed from before it
      const insertAt = fromIndex < clampedDrop ? clampedDrop - 1 : clampedDrop;
      next.splice(insertAt, 0, moved);
      return next;
    });

    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleTabsWheel = useCallback((event: WheelEvent) => {
    const tabList = tabsScrollRef.current;
    if (!tabList || tabList.scrollWidth <= tabList.clientWidth) return;

    const delta =
      Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    if (delta === 0) return;

    const maxScrollLeft = tabList.scrollWidth - tabList.clientWidth;
    const nextScrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, tabList.scrollLeft + delta),
    );
    if (nextScrollLeft === tabList.scrollLeft) return;

    event.preventDefault();
    tabList.scrollLeft = nextScrollLeft;
  }, []);

  const getDisplayTabLabel = (tab: (typeof renderedTabs)[number]) => {
    if (tab.kind === "case") return tab.graph.label;

    if (tab.kind === "route") {
      const translationKey = getRouteTabTranslationKey(tab.path);
      return translationKey ? t(translationKey) : tab.label;
    }

    if (tab.kind === "overview") return t("shared.tabs.overview");

    return translateNumberedStoredLabel(
      translateNumberedStoredLabel(
        translateNumberedStoredLabel(
          tab.label,
          "Agent Search",
          t("appTabs.agentSearch"),
        ),
        "Agent Browser",
        t("appTabs.agentBrowser"),
      ),
      "Browser",
      t("shared.tabs.browser"),
    );
  };

  const TabIcon = ({
    tab,
    isActive,
  }: {
    tab: (typeof renderedTabs)[number];
    isActive: boolean;
  }) => {
    let icon = "settings";

    switch (tab.kind) {
      case "route":
        icon = getRouteTabIcon(tab.path);
        break;
      case "case":
        if (tab.mode === "flow") {
          icon = "vector-bezier-arc";
        } else if (tab.mode === "agents") {
          icon = "cpu";
        } else {
          icon = "report-analytics";
        }
        break;
      case "overview":
        icon = "eye";
        break;
      case "browser":
        icon = "browser";
        break;
    }

    return (
      <Icon
        icon={icon}
        className={`${isActive ? "text-review-border" : "text-primary-txt/50"} h-3.5 w-3.5 shrink-0`}
      />
    );
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-40 h-8 border-b border-subtle/50 bg-canvas">
      <div className="relative flex h-full items-stretch w-full">
        <div
          ref={tabsScrollRef}
          onWheel={handleTabsWheel}
          className="app-tabs-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto"
        >
          {renderedTabs.map((tab, index) => {
            const isActive = activeBrowserTabId
              ? tab.kind === "browser" && tab.id === activeBrowserTabId
              : isTabActive(tab, {
                  currentOverviewTabId,
                  currentBrowserTabId: null,
                  currentCaseId,
                  currentCaseMode: currentCaseRoute.mode,
                  pathname: location.pathname,
                });
            const label = getDisplayTabLabel(tab);
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && !isDragging;

            return (
              <Tooltip
                key={getTabKey(tab)}
                showDelay={1500}
                side="bottom"
                content={label}
              >
                <div
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={[
                    "group relative flex w-full max-w-48 min-w-48 flex-1 basis-0 cursor-grab items-stretch overflow-hidden border-r border-subtle/50 transition-colors duration-150 active:cursor-grabbing",
                    isActive
                      ? "bg-review-border/5 text-primary-txt"
                      : "bg-paper text-terminal-txt hover:bg-panel hover:text-ink-soft",
                    isDragging ? "opacity-40" : "",
                    isDragOver
                      ? "border-l-2 border-l-review-border bg-panel"
                      : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "pointer-events-none absolute inset-x-0 top-0 h-px transition-opacity",
                      isActive
                        ? "bg-review-border opacity-100"
                        : "bg-primary-txt/8 opacity-0",
                    ].join(" ")}
                  />
                  <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-current/20" />
                  <button
                    type="button"
                    onClick={() => navigateToTab(tab)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-3 text-left font-display text-[10px] uppercase tracking-[0.24em] outline-none focus-visible:ring-1 focus-visible:ring-panel"
                  >
                    <TabIcon tab={tab} isActive={isActive} />
                    <span className="truncate">{label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(tab)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="invisible ml-0.5 inline-flex h-auto w-6 shrink-0 items-center justify-center border-l border-ink/0 text-primary-txt/40 transition-colors duration-150 hover:border-primary-txt/8 hover:bg-red-400/5 hover:text-danger group-hover:visible group-focus-within:visible focus:visible"
                    aria-label={t("appTabs.closeTab", { label })}
                  >
                    <Icon icon="x" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Tooltip>
            );
          })}

          {/* Drop zone for appending to the end of the tab list */}
          <div
            className={[
              "min-w-8 shrink-0 border-r border-dashed border-subtle",
              dragOverIndex === renderedTabs.length
                ? "border-l-2 border-l-review-border bg-panel"
                : "",
            ].join(" ")}
            onDragOver={(e) => handleDragOver(e, renderedTabs.length)}
            onDrop={(e) => handleDrop(e, renderedTabs.length)}
            onDragEnd={handleDragEnd}
          />
        </div>

        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            onClick={openOverviewTab}
            className="relative inline-flex w-10 shrink-0 items-center justify-center border-l border-subtle/50 bg-panel/75 text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border"
            title={t("appTabs.openOverviewTab")}
            aria-label={t("appTabs.openOverviewTab")}
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
            <Icon icon="home" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={openBrowserTab}
            className="relative inline-flex w-10 shrink-0 items-center justify-center border-l border-subtle/50 bg-panel/75 text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border"
            title={t("appTabs.openBrowserTab")}
            aria-label={t("appTabs.openBrowserTab")}
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
            <Icon icon="browser-plus" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
