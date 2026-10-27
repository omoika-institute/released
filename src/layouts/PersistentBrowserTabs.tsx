import { BROWSER_TAB_FOCUS_EVENT, SEARCH_ENGINE_CONFIG } from "@/lib/browser";
import {
  OPEN_TABS_UPDATED_EVENT,
  getCurrentBrowserTabId,
  readStoredOpenTabs,
  type BrowserTab,
} from "@/lib/appTabs";
import { BrowserTabPage } from "@/renderer/browser";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useLocation } from "react-router-dom";

function readStoredBrowserTabs() {
  return readStoredOpenTabs().filter(
    (tab): tab is BrowserTab => tab.kind === "browser"
  );
}

export default function PersistentBrowserTabs() {
  const location = useLocation();
  const activeBrowserTabId = useMemo(
    () => getCurrentBrowserTabId(location.pathname),
    [location.pathname]
  );
  const [focusedBrowserTabId, setFocusedBrowserTabId] = useState<string | null>(
    activeBrowserTabId
  );
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>(
    readStoredBrowserTabs
  );
  const [mountedBrowserTabs, setMountedBrowserTabs] = useState<BrowserTab[]>(
    () => {
      if (!activeBrowserTabId) return [];
      const storedTab = readStoredBrowserTabs().find(
        (tab) => tab.id === activeBrowserTabId
      );
      return [
        storedTab ?? {
          kind: "browser",
          id: activeBrowserTabId,
          label: "Browser",
          url: SEARCH_ENGINE_CONFIG.google.homeUrl,
          engine: "google",
          onionMode: false,
        },
      ];
    }
  );
  const visibleBrowserTabId = focusedBrowserTabId ?? activeBrowserTabId;

  useEffect(() => {
    setFocusedBrowserTabId(activeBrowserTabId);
  }, [activeBrowserTabId]);

  useEffect(() => {
    const syncTabs = () => {
      setBrowserTabs(readStoredBrowserTabs());
    };
    const handleFocus = (
      event: Event & { detail?: { tabId?: string | null } }
    ) => {
      setFocusedBrowserTabId(event.detail?.tabId ?? null);
    };

    syncTabs();
    window.addEventListener(OPEN_TABS_UPDATED_EVENT, syncTabs as EventListener);
    window.addEventListener(
      BROWSER_TAB_FOCUS_EVENT,
      handleFocus as EventListener
    );

    return () => {
      window.removeEventListener(
        OPEN_TABS_UPDATED_EVENT,
        syncTabs as EventListener
      );
      window.removeEventListener(
        BROWSER_TAB_FOCUS_EVENT,
        handleFocus as EventListener
      );
    };
  }, []);

  useEffect(() => {
    setMountedBrowserTabs((tabs) => {
      const mountedById = new Map(tabs.map((tab) => [tab.id, tab]));
      const nextTabs = tabs.map((tab) => {
        const storedTab = browserTabs.find((entry) => entry.id === tab.id);
        return storedTab ?? tab;
      });
      const addTab = (tab: BrowserTab) => {
        if (mountedById.has(tab.id)) return;
        mountedById.set(tab.id, tab);
        nextTabs.push(tab);
      };

      if (tabs.some((tab) => tab.id === visibleBrowserTabId)) {
        for (const tab of browserTabs) {
          if (tab.openedBy === "agent") addTab(tab);
        }
        return nextTabs;
      }

      if (visibleBrowserTabId) {
        const storedTab = browserTabs.find(
          (tab) => tab.id === visibleBrowserTabId
        );
        addTab(
          storedTab ?? {
            kind: "browser",
            id: visibleBrowserTabId,
            label: "Browser",
            url: SEARCH_ENGINE_CONFIG.google.homeUrl,
            engine: "google",
            onionMode: false,
          }
        );
      }

      for (const tab of browserTabs) {
        if (tab.openedBy === "agent") addTab(tab);
      }

      return nextTabs;
    });
  }, [browserTabs, visibleBrowserTabId]);

  useEffect(() => {
    setMountedBrowserTabs((tabs) =>
      tabs
        .filter(
          (mountedTab) =>
            mountedTab.id === visibleBrowserTabId ||
            browserTabs.some((tab) => tab.id === mountedTab.id)
        )
        .map((mountedTab) => {
          const storedTab = browserTabs.find((tab) => tab.id === mountedTab.id);
          return storedTab ?? mountedTab;
        })
    );
  }, [browserTabs, visibleBrowserTabId]);

  return (
    <>
      {mountedBrowserTabs.map((tab) => {
        const isVisible = tab.id === visibleBrowserTabId;

        return (
          <div
            key={tab.id}
            className={[
              "fixed inset-x-0 bottom-0 top-7",
              isVisible
                ? "z-30 opacity-100"
                : "pointer-events-none z-0 opacity-0",
            ].join(" ")}
            aria-hidden={!isVisible}
          >
            <BrowserTabPage tabId={tab.id} />
          </div>
        );
      })}
    </>
  );
}
