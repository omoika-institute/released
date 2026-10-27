import { BROWSER_TAB_FOCUS_EVENT } from "@/lib/browser";
import {
  OPEN_TABS_UPDATED_EVENT,
  getCurrentCaseRoute,
  getCurrentBrowserTabId,
  readStoredOpenTabs,
  type CaseTab,
} from "@/lib/appTabs";
import Graphing from "@/renderer/graph";
import { useEffect, useMemo, useState } from "preact/hooks";
import { Route, Routes, useLocation } from "react-router-dom";

function readStoredFlowTabs() {
  return readStoredOpenTabs().filter(
    (tab): tab is CaseTab => tab.kind === "case" && tab.mode === "flow",
  );
}

export default function PersistentFlowTabs() {
  const location = useLocation();
  const currentCaseRoute = useMemo(
    () => getCurrentCaseRoute(location.pathname),
    [location.pathname],
  );
  const activeFlowCaseId =
    currentCaseRoute.mode === "flow" ? currentCaseRoute.caseId : null;
  const currentBrowserTabId = useMemo(
    () => getCurrentBrowserTabId(location.pathname),
    [location.pathname],
  );
  const [focusedBrowserTabId, setFocusedBrowserTabId] = useState<string | null>(
    currentBrowserTabId,
  );
  const [flowTabs, setFlowTabs] = useState<CaseTab[]>(readStoredFlowTabs);
  const [mountedFlowCaseId, setMountedFlowCaseId] = useState<string | null>(
    activeFlowCaseId,
  );
  const activeBrowserTabId = focusedBrowserTabId ?? currentBrowserTabId;

  useEffect(() => {
    setFocusedBrowserTabId(currentBrowserTabId);
  }, [currentBrowserTabId]);

  useEffect(() => {
    if (activeFlowCaseId) setMountedFlowCaseId(activeFlowCaseId);
  }, [activeFlowCaseId]);

  useEffect(() => {
    const syncTabs = () => {
      setFlowTabs(readStoredFlowTabs());
    };
    const handleBrowserFocus = (
      event: Event & { detail?: { tabId?: string | null } },
    ) => {
      setFocusedBrowserTabId(event.detail?.tabId ?? null);
    };

    syncTabs();
    window.addEventListener(OPEN_TABS_UPDATED_EVENT, syncTabs as EventListener);
    window.addEventListener(
      BROWSER_TAB_FOCUS_EVENT,
      handleBrowserFocus as EventListener,
    );

    return () => {
      window.removeEventListener(
        OPEN_TABS_UPDATED_EVENT,
        syncTabs as EventListener,
      );
      window.removeEventListener(
        BROWSER_TAB_FOCUS_EVENT,
        handleBrowserFocus as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (
      mountedFlowCaseId &&
      mountedFlowCaseId !== activeFlowCaseId &&
      !flowTabs.some((tab) => tab.caseId === mountedFlowCaseId)
    ) {
      setMountedFlowCaseId(flowTabs[flowTabs.length - 1]?.caseId ?? null);
    }
  }, [activeFlowCaseId, flowTabs, mountedFlowCaseId]);

  const mountedFlowTab = mountedFlowCaseId
    ? (flowTabs.find((tab) => tab.caseId === mountedFlowCaseId) ?? {
        kind: "case" as const,
        caseId: mountedFlowCaseId,
        mode: "flow" as const,
      })
    : null;
  const flowLocation = mountedFlowCaseId
    ? { ...location, pathname: `/flow/${mountedFlowCaseId}` }
    : location;
  const isVisible = Boolean(
    mountedFlowCaseId &&
      activeFlowCaseId === mountedFlowCaseId &&
      !activeBrowserTabId,
  );

  if (!mountedFlowTab) return null;

  return (
    <div
      key={mountedFlowTab.caseId}
      className={[
        "fixed inset-0 flex h-screen w-full flex-col pt-7",
        isVisible
          ? "z-20 opacity-100"
          : "pointer-events-none z-0 opacity-0",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={!isVisible}
    >
      <Routes location={flowLocation}>
        <Route path="/flow/:hid" element={<Graphing isActive />} />
      </Routes>
    </div>
  );
}
