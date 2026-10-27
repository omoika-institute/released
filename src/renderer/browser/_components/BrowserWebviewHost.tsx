import { useEffect, useRef } from "preact/hooks";

import type { BrowserWebViewHandle } from "./types";

const WEBVIEW_STYLE = {
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: "0",
  flex: "1 1 auto",
  background: "#000",
} as const;

export function BrowserWebviewHost({
  webviewKey,
  partition,
  src,
  hidden,
  onWebview,
}: {
  webviewKey: string;
  partition: string;
  src: string;
  hidden: boolean;
  onWebview: (element: Element | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const webview = document.createElement("webview") as BrowserWebViewHandle;
    webview.setAttribute("src", src);
    webview.setAttribute("partition", partition);
    webview.className = "block h-full w-full min-h-0 flex-1";
    Object.assign(webview.style, WEBVIEW_STYLE);

    host.appendChild(webview);
    onWebview(webview);

    return () => {
      onWebview(null);
      webview.remove();
    };
  }, [onWebview, partition, webviewKey]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full"
      style={{ visibility: hidden ? "hidden" : "visible" }}
    />
  );
}
