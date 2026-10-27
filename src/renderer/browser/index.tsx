import { Icon } from "@/components/icons";
import {
  BROWSER_TAB_UPDATE_EVENT,
  SEARCH_ENGINE_CONFIG,
  getBrowserPartition,
  normalizeBrowserInput,
} from "@/lib/browser";
import type { BrowserEngine } from "@/lib/appTabs";
import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import { useParams } from "react-router-dom";

import { BrowserWebviewHost } from "./_components/BrowserWebviewHost";
import type { BrowserWebViewHandle } from "./_components/types";

const DEFAULT_BROWSER_ENGINE: BrowserEngine = "google";
const DEFAULT_BROWSER_URL =
  SEARCH_ENGINE_CONFIG[DEFAULT_BROWSER_ENGINE].homeUrl;

export function BrowserTabPage({ tabId }: { tabId: string }) {
  const webviewRef = useRef<BrowserWebViewHandle | null>(null);
  const webviewCleanupRef = useRef<(() => void) | null>(null);
  const webviewReadyRef = useRef(false);
  const pendingNavigationUrlRef = useRef<string | null>(null);
  const [requestedUrl, setRequestedUrl] = useState(DEFAULT_BROWSER_URL);
  const [addressValue, setAddressValue] = useState(DEFAULT_BROWSER_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [webviewReady, setWebviewReady] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const partition = useMemo(() => getBrowserPartition(tabId, false), [tabId]);

  const emitTabUpdate = useCallback(
    (label: string, url: string) => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_TAB_UPDATE_EVENT, {
          detail: {
            id: tabId,
            label,
            url,
            engine: DEFAULT_BROWSER_ENGINE,
            onionMode: false,
          },
        }),
      );
    },
    [tabId],
  );

  const refreshNavigationState = useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current || !webview.isConnected) return;

    try {
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    } catch {
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }, []);

  const handleWebview = useCallback(
    (element: Element | null) => {
      webviewCleanupRef.current?.();
      webviewCleanupRef.current = null;
      webviewReadyRef.current = false;
      setWebviewReady(false);
      setCanGoBack(false);
      setCanGoForward(false);

      const webview = element as BrowserWebViewHandle | null;
      webviewRef.current = webview;
      if (!webview) return;

      const updateLocation = () => {
        if (!webviewReadyRef.current || !webview.isConnected) return;

        let nextUrl = "";
        let nextTitle = "Browser";
        try {
          nextUrl = webview.getURL();
          nextTitle = webview.getTitle() || "Browser";
        } catch {
          return;
        }

        if (!nextUrl || nextUrl === "about:blank") return;

        setAddressValue(nextUrl);
        refreshNavigationState();
        emitTabUpdate(nextTitle, nextUrl);
      };

      const handleReady = () => {
        webviewReadyRef.current = true;
        setWebviewReady(true);
        try {
          setIsLoading(webview.isLoading());
        } catch {
          setIsLoading(false);
        }
        const pendingUrl = pendingNavigationUrlRef.current;
        pendingNavigationUrlRef.current = null;
        if (pendingUrl) {
          void webview.loadURL(pendingUrl).catch(() => {
            setBrowserError("Failed to load page.");
          });
        }
        updateLocation();
        refreshNavigationState();
      };
      const handleStart = () => {
        setIsLoading(true);
        setBrowserError(null);
      };
      const handleStop = () => {
        setIsLoading(false);
        updateLocation();
      };
      const handleFail = () => {
        setIsLoading(false);
        refreshNavigationState();
        setBrowserError("Failed to load page.");
      };

      webview.addEventListener("dom-ready", handleReady);
      webview.addEventListener("did-start-loading", handleStart);
      webview.addEventListener("did-stop-loading", handleStop);
      webview.addEventListener("did-navigate", updateLocation);
      webview.addEventListener("did-navigate-in-page", updateLocation);
      webview.addEventListener("page-title-updated", updateLocation);
      webview.addEventListener("did-fail-load", handleFail);

      webviewCleanupRef.current = () => {
        webviewReadyRef.current = false;
        setWebviewReady(false);
        webview.removeEventListener("dom-ready", handleReady);
        webview.removeEventListener("did-start-loading", handleStart);
        webview.removeEventListener("did-stop-loading", handleStop);
        webview.removeEventListener("did-navigate", updateLocation);
        webview.removeEventListener("did-navigate-in-page", updateLocation);
        webview.removeEventListener("page-title-updated", updateLocation);
        webview.removeEventListener("did-fail-load", handleFail);
      };
    },
    [emitTabUpdate, refreshNavigationState],
  );

  const navigateToAddress = async () => {
    const nextUrl = normalizeBrowserInput(
      addressValue,
      DEFAULT_BROWSER_ENGINE,
      false,
    );

    if (!nextUrl) {
      setBrowserError("Enter a valid web address or search query.");
      return;
    }

    setBrowserError(null);
    setRequestedUrl(nextUrl);
    emitTabUpdate("Browser", nextUrl);

    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current || !webview.isConnected) {
      pendingNavigationUrlRef.current = nextUrl;
      return;
    }

    try {
      await webview.loadURL(nextUrl);
    } catch {
      setBrowserError("Failed to load page.");
    }
  };

  const runWhenWebviewReady = (
    action: (webview: BrowserWebViewHandle) => void,
  ) => {
    const webview = webviewRef.current;
    if (!webview || !webviewReadyRef.current || !webview.isConnected) return;

    try {
      action(webview);
    } catch {
      setBrowserError("Browser view is not ready yet.");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-black text-primary-txt">
      <div className="relative flex h-8 shrink-0 items-stretch border-b border-subtle/50 bg-canvas shadow-[0_12px_40px_rgba(0,0,0,0.34)]">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => runWhenWebviewReady((webview) => webview.goBack())}
          disabled={!webviewReady || !canGoBack}
          className="relative inline-flex w-8 shrink-0 items-center justify-center border-r border-subtle/50 bg-panel/75 text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon icon="arrow-left" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Go forward"
          onClick={() => runWhenWebviewReady((webview) => webview.goForward())}
          disabled={!webviewReady || !canGoForward}
          className="relative inline-flex w-8 shrink-0 items-center justify-center border-r border-subtle/50 bg-panel/75 text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon icon="arrow-right" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={isLoading ? "Stop loading" : "Reload"}
          onClick={() =>
            runWhenWebviewReady((webview) =>
              isLoading ? webview.stop() : webview.reload(),
            )
          }
          disabled={!webviewReady}
          className="relative inline-flex w-8 shrink-0 items-center justify-center border-r border-subtle/50 bg-panel/75 text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon icon={isLoading ? "x" : "refresh"} className="h-4 w-4" />
        </button>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void navigateToAddress();
          }}
          className="group relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden border-r border-subtle/50 bg-paper pl-3 text-primary-txt transition-colors duration-150 hover:bg-panel focus-within:bg-review-border/5"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-review-border opacity-0 transition-opacity group-focus-within:opacity-100" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-current/20" />
          <Icon
            icon="search"
            className="h-4 w-4 shrink-0 text-primary-txt/50 transition-colors group-focus-within:text-review-border"
          />

          <input
            type="text"
            value={addressValue}
            onInput={(event) => setAddressValue(event.currentTarget.value)}
            placeholder="Enter a URL or search query"
            className="min-w-0 flex-1 bg-transparent font-sans text-sm text-primary-txt outline-none placeholder:text-terminal-txt"
          />
          <button
            type="submit"
            aria-label="Navigate"
            className="inline-flex h-full bg-canvas w-8 shrink-0 items-center justify-center border-l border-primary-txt/0 text-primary-txt/50 transition-colors duration-150 hover:border-primary-txt/8 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border"
          >
            <Icon icon="arrow-right" className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      <div className="relative min-h-0 flex-1">
        {browserError && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-danger/20 bg-danger/10 px-4 py-2.5 text-sm text-danger backdrop-blur-sm">
            <span className="min-w-0 flex-1">{browserError}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setBrowserError(null)}
              className="shrink-0 p-0.5 transition-colors duration-150 hover:bg-danger/15 hover:text-danger/90"
            >
              <Icon icon="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <BrowserWebviewHost
          webviewKey={tabId}
          partition={partition}
          src={requestedUrl}
          hidden={false}
          onWebview={handleWebview}
        />
      </div>
    </section>
  );
}

export default function Browser() {
  const { tabId } = useParams();

  return <BrowserTabPage tabId={tabId ?? "browser-route"} />;
}
