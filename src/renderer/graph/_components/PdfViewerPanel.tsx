import { useEffect, useMemo, useState } from "preact/hooks";
import { usePdfViewerStore } from "@/stores";
import { Icon } from "@/components/icons";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import {
  ZoomPluginPackage,
  ZoomMode,
  useZoom,
  MarqueeZoom,
} from "@embedpdf/plugin-zoom/react";
import {
  PagePointerProvider,
  InteractionManagerPluginPackage,
  GlobalPointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  RenderPageProps,
  Scroller,
  ScrollPluginPackage,
  useScroll,
  useScrollCapability,
} from "@embedpdf/plugin-scroll/react";
import {
  RedactionPluginPackage,
  RedactionLayer,
  useRedaction,
} from "@embedpdf/plugin-redaction/react";
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { ExportPluginPackage, useExport } from "@embedpdf/plugin-export/react";
import {
  SpreadPluginPackage,
  SpreadMode,
  useSpread,
} from "@embedpdf/plugin-spread/react";
import {
  CaptureAreaEvent,
  CapturePluginPackage,
  MarqueeCapture,
  useCapture,
} from "@embedpdf/plugin-capture/react";
import { PanPluginPackage, usePan } from "@embedpdf/plugin-pan/react";
import {
  TilingLayer,
  TilingPluginPackage,
} from "@embedpdf/plugin-tiling/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";
import {
  RenderLayer,
  RenderPluginPackage,
} from "@embedpdf/plugin-render/react";
import ShinyText from "@/components/ShinyText";
import Tabs from "./Tabs";
import Button from "@/components/buttons";
import { ThumbnailsPane, ThumbImg } from "@embedpdf/plugin-thumbnail/react";

// TODO: Finish deprecating
const BASE_URL = "deprecated";
const ACTIVE_PDF_DOCUMENT_ID = "active-pdf";

interface ThumbnailSidebarProps {
  showThumbnailBar: boolean;
  documentId: string;
}

function ThumbnailSidebar({
  showThumbnailBar,
  documentId,
}: ThumbnailSidebarProps) {
  const { state, provides } = useScroll(documentId);
  if (!showThumbnailBar) return null;
  return (
    <ThumbnailsPane documentId={documentId} className="z-20 w-20 bg-black/60">
      {(m) => {
        const isActive = state.currentPage === m.pageIndex + 1;
        return (
          <div
            key={m.pageIndex}
            style={{
              position: "absolute",
              top: m.top,
              height: m.wrapperHeight,
            }}
            onClick={() =>
              provides?.scrollToPage({ pageNumber: m.pageIndex + 1 })
            }
          >
            <div
              style={{
                border: `2px solid ${isActive ? "blue" : "grey"}`,
                width: m.width,
                height: m.height,
              }}
            >
              <ThumbImg documentId={documentId} meta={m} />
            </div>
            <span style={{ height: m.labelHeight }}>{m.pageIndex + 1}</span>
          </div>
        );
      }}
    </ThumbnailsPane>
  );
}

interface PDFToolbarProps {
  showThumbnailBar: boolean;
  setShowThumbnailBar: (value: boolean) => void;
  activeFilename: string;
  documentId: string;
}

function PDFToolbar({
  showThumbnailBar,
  setShowThumbnailBar,
  activeFilename,
  documentId,
}: PDFToolbarProps) {
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { provides: pan, isPanning } = usePan(documentId);
  const { provides: redact, state: redactState } = useRedaction(documentId);
  const { provides: selection } = useSelectionCapability();
  const { provides: exportApi } = useExport(documentId);
  const { provides: spread, spreadMode } = useSpread(documentId);
  const { provides: capture } = useCapture(documentId);
  const isCaptureActive = capture?.isMarqueeCaptureActive();

  const [hasSelection, setHasSelection] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  if (!zoom || !pan || !redact || !spread) return null;

  const [isAreaZoomActive, setIsAreaZoomActive] = useState(
    zoom.isMarqueeZoomActive()
  );

  useEffect(() => {
    if (!selection) return;
    return selection.onSelectionChange((event) => {
      if (event.documentId === documentId) {
        setHasSelection(!!event.selection);
      }
    });
  }, [selection, documentId]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Download images on capture
  useEffect(() => {
    if (!capture) return;

    const unsubscribe = capture.onCaptureArea((result: CaptureAreaEvent) => {
      const newUrl = URL.createObjectURL(result.blob);
      setImageUrl(newUrl);
      const link = document.createElement("a");
      link.href = newUrl;
      link.setAttribute(
        "download",
        `${Date.now()}_${activeFilename.replace(".pdf", "")}.png`
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    });

    return () => {
      unsubscribe();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [capture, activeFilename, imageUrl]);

  return (
    <>
      <div className="absolute top-0 left-0 z-40 flex w-full items-center text-slate-400">
        <button
          onClick={() => setShowToolbar(!showToolbar)}
          class="bg-mirage-950 hover:text-slate-350 active:text-slate-350 hover:*:animate-wiggle group absolute top-0 right-0 z-50 ml-auto rounded-sm p-1 text-slate-400"
          aria-pressed={showToolbar}
        >
          <Icon
            aria-pressed={showToolbar}
            icon="chevron-left"
            className="h-5 w-5 rotate-0 transition-all duration-100 aria-pressed:rotate-180"
          />
        </button>
        {/* Expandable pdf controls section */}
        <section
          aria-hidden={!showToolbar}
          aria-expanded={showToolbar}
          className="relative z-40 flex w-full items-center justify-between bg-slate-950/99 py-0.5 transition-all duration-150 ease-out aria-expanded:left-full aria-expanded:-translate-x-full aria-hidden:left-full"
        >
          {/* Thumbnail toggle control */}
          <div className="flex items-center">
            <Button.Icon
              variant="toolbar"
              title="Click to toggle PDF thumbnails"
              onClick={() => {
                setShowThumbnailBar(!showThumbnailBar);
                if (!showThumbnailBar)
                  zoom.requestZoom(zoomState.currentZoomLevel - 0.11);
                else zoom.requestZoom(zoomState.currentZoomLevel + 0.11);
              }}
            >
              {showThumbnailBar ? (
                <Icon icon="layout-sidebar-left-collapse" />
              ) : (
                <Icon icon="layout-sidebar-left-expand" />
              )}
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              title="Click toggles two-page odd view. Double click toggles two-page even view"
              onClick={() => {
                if (spreadMode === SpreadMode.None)
                  spread.setSpreadMode(SpreadMode.Odd);
                else spread.setSpreadMode(SpreadMode.None);
              }}
              onDblClick={() => {
                if (spreadMode === SpreadMode.Even)
                  spread.setSpreadMode(SpreadMode.None);
                else spread.setSpreadMode(SpreadMode.Even);
              }}
            >
              {spreadMode !== SpreadMode.None ? (
                <Icon icon="book" className="text-primary-300 h-5 w-5" />
              ) : (
                <Icon icon="book-2" />
              )}
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              title="Click to toggle pan mode"
              onClick={pan.togglePan}
            >
              {isPanning ? (
                <Icon icon="hand-off" className="text-primary-300 h-5 w-5" />
              ) : (
                <Icon icon="hand-stop" />
              )}
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              onClick={() => capture?.toggleMarqueeCapture()}
              title="Capture a selected region on this pdf as an image"
            >
              {isCaptureActive ? (
                <Icon icon="maximize-off" className="text-danger-500 h-5 w-5" />
              ) : (
                <Icon icon="screenshot" />
              )}
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              onClick={() => selection?.copyToClipboard()}
              disabled={!hasSelection}
              title="Copy selected text"
            >
              <Icon icon="copy" />
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              onClick={() => exportApi?.download()}
              disabled={!exportApi}
              title="Export this PDF"
            >
              <Icon icon="download" />
            </Button.Icon>
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-x-1">
            <Button.Icon
              variant="toolbar"
              title="Click once to reset zoom. Double click to set zoom to 50%"
              onClick={() => zoom.requestZoom(1.0)}
              onDblClick={() => zoom.requestZoom(0.5)}
            >
              <Icon icon="zoom-reset" />
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              title="Zoom out"
              onClick={zoom.zoomOut}
            >
              <Icon icon="zoom-out" />
            </Button.Icon>
            <input
              className="bg-mirage-950 hover:text-slate-350 focus:text-slate-350 focus:border-primary-350 hover:border-primary-350 w-10 rounded-sm border border-slate-900 p-1.5 text-xs outline-none focus:bg-transparent"
              type="text"
              value={Math.round(zoomState.currentZoomLevel * 100) + "%"}
            />
            <Button.Icon
              variant="toolbar"
              onClick={zoom.zoomIn}
              title="Zoom in"
            >
              <Icon icon="zoom-in" />
            </Button.Icon>
            <Button.Icon
              title="Toggle area zoom"
              variant="toolbar"
              onClick={() => {
                zoom.toggleMarqueeZoom();
                setIsAreaZoomActive(!isAreaZoomActive);
              }}
              aria-pressed={isAreaZoomActive}
            >
              {isAreaZoomActive ? (
                <Icon icon="zoom-cancel" className="text-primary-300 h-5 w-5" />
              ) : (
                <Icon icon="zoom-in-area" className="h-5 w-5" />
              )}
            </Button.Icon>
          </div>
          <div className="mr-10 flex items-center">
            <Button.Icon
              variant="toolbar"
              title="Redact selected text"
              onClick={() => redact?.toggleRedactSelection()}
            >
              <Icon
                icon="pencil-minus"
                className={`h-5 w-5 ${redactState.activeType === "redactSelection" && redactState.isRedacting && "text-primary-300"}`}
              />
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              title="Mark redaction area"
              onClick={() => redact?.toggleMarqueeRedact()}
            >
              <Icon
                icon="background"
                className={`h-5 w-5 ${redactState.activeType === "marqueeRedact" && redactState.isRedacting && "text-primary-300"}`}
              />
            </Button.Icon>
            <Button.Icon
              variant="toolbar"
              title="Apply all redactions"
              onClick={() => redact?.commitAllPending()}
              disabled={redactState.pendingCount === 0}
            >
              <Icon
                icon="file-text-shield"
                className={`h-5 w-5 ${redactState.pendingCount > 0 && "text-green-700"}`}
              />
            </Button.Icon>
            <span className="text-code ml-3" title="Total pending redactions">
              {redactState.pendingCount}
            </span>
          </div>
        </section>
      </div>
      <ThumbnailSidebar
        documentId={documentId}
        showThumbnailBar={showThumbnailBar}
      />
    </>
  );
}

interface PDFViewerProps {
  blobUrl: string;
  page: number;
  coords?: { x: number; y: number };
  onNumPages?: (n: number) => void;
  activeFilename: string;
}

export const PDFViewer = ({
  blobUrl,
  page,
  coords,
  onNumPages,
  activeFilename,
}: PDFViewerProps) => {
  const pdfStore = usePdfViewerStore();
  const { engine, isLoading } = usePdfiumEngine();
  const [showThumbnailBar, setShowThumbnailBar] = useState(false);
  const documentId = pdfStore.active || ACTIVE_PDF_DOCUMENT_ID;

  const plugins = useMemo(
    () => [
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      // Required for PagePointerProvider and marquee zoom interactions
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
      }),
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 5,
        extraRings: 1,
      }),
      createPluginRegistration(ThumbnailPluginPackage, {
        width: 80,
      }),
      createPluginRegistration(PanPluginPackage),
      createPluginRegistration(RedactionPluginPackage, {
        drawBlackBoxes: true,
      }),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(ExportPluginPackage, {
        defaultFileName: `${pdfStore.active?.slice(0, 8).toUpperCase()}_${activeFilename.replace(".pdf", "")}.pdf`,
      }),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(CapturePluginPackage, {
        scale: 2.0, // Render captured image at 2x resolution
        imageType: "image/png",
        withAnnotations: true,
      }),
    ],
    [activeFilename, pdfStore.active]
  );

  const scrollCap = useScrollCapability();

  // TODO: Fix me.
  // Subscribe for document loaded -> set num pages and restore scroll
  useEffect(() => {
    if (!scrollCap.provides) return;
    const unsub = scrollCap.provides.onLayoutReady((event) => {
      if (event.documentId !== documentId) return;
      const n = event.totalPages ?? 0;
      if (n > 0 && pdfStore.active) {
        onNumPages?.(n);
        pdfStore.setNumPages(pdfStore.active, n);
        if (scrollCap.provides && page) {
          scrollCap.provides.scrollToPage({
            pageNumber: page,
            behavior: "auto",
            alignX: coords ? 0 : 50,
            alignY: coords ? 0 : 50,
            pageCoordinates: coords,
          });
        }
      }
    });
    return () => unsub();
  }, [
    scrollCap.provides,
    documentId,
    page,
    coords?.x,
    coords?.y,
    pdfStore.active,
  ]);

  // TODO: Fix me.
  // Keep scroll position in sync with selected page + coordinates
  // Include pdf.active so switching tabs re-applies the saved position
  useEffect(() => {
    if (!scrollCap.provides || !page) return;
    scrollCap.provides.scrollToPage({
      pageNumber: page,
      behavior: "auto",
      alignX: coords ? 0 : 50,
      alignY: coords ? 0 : 50,
      pageCoordinates: coords,
    });
  }, [scrollCap.provides, page, coords?.x, coords?.y, pdfStore.active]);

  // TODO: Fix me.
  // After layout ready, re-apply scroll target (helps when switching tabs)
  // Include pdf.active so listener captures the right tab state
  useEffect(() => {
    if (!scrollCap.provides || !page) return;
    const unsub = scrollCap.provides.onLayoutReady((event) => {
      if (event.documentId !== documentId) return;
      scrollCap.provides.scrollToPage({
        pageNumber: page,
        behavior: "auto",
        alignX: coords ? 0 : 50,
        alignY: coords ? 0 : 50,
        pageCoordinates: coords,
      });
    });
    return () => unsub();
  }, [scrollCap.provides, documentId, page, coords?.x, coords?.y, pdfStore.active]);

  // TODO: Fix me. Reflect page + per-page coordinates back to store when user scrolls
  useEffect(() => {
    if (!scrollCap.provides || !pdfStore.active) return;
    const unsubChange = scrollCap.provides.onPageChange(
      ({ documentId: eventDocumentId, pageNumber }) => {
        if (eventDocumentId !== documentId) return;
        if (pdfStore.active) pdfStore.setPage(pdfStore.active, pageNumber);
      }
    );
    const unsubScroll = scrollCap.provides.onScroll((event) => {
      if (event.documentId !== documentId) return;
      const current = event.metrics.currentPage;
      const pm = event.metrics.pageVisibilityMetrics.find(
        (m) => m.pageNumber === current
      );
      if (!pm || !pdfStore.active) return;
      pdfStore.setPageCoords(pdfStore.active, {
        x: pm.original.pageX,
        y: pm.original.pageY,
      });
    });
    return () => {
      unsubChange();
      unsubScroll();
    };
  }, [scrollCap.provides, documentId, pdfStore.active]);

  if (isLoading || !engine) {
    return (
      <p class="relative flex w-full px-2 py-1">
        <ShinyText className="tracking-wide text-slate-600">
          Initializing PDF engine
        </ShinyText>
        <span class="dot-flashing top-3.5 left-2" />
      </p>
    );
  }

  return (
    <>
      <div className="h-full overflow-x-scroll">
        <EmbedPDF engine={engine} plugins={plugins}>
          <PDFToolbar
            activeFilename={activeFilename}
            documentId={documentId}
            showThumbnailBar={showThumbnailBar}
            setShowThumbnailBar={setShowThumbnailBar}
          />
          <GlobalPointerProvider documentId={documentId}>
            <Viewport
              documentId={documentId}
              className={`absolute top-0 bg-transparent ${showThumbnailBar && "left-10"}`}
            >
              <Scroller
                documentId={documentId}
                renderPage={({
                  width,
                  height,
                  pageIndex,
                  scale,
                  rotation,
                }: RenderPageProps) => (
                  <PagePointerProvider
                    documentId={documentId}
                    pageIndex={pageIndex}
                    rotation={rotation}
                    scale={scale}
                  >
                    <div style={{ width, height }}>
                      <RenderLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={0.5}
                      />
                      <TilingLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={scale}
                      />
                      <SelectionLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={scale}
                      />
                      <RedactionLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={scale}
                        rotation={rotation}
                      />
                      <MarqueeZoom
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={scale}
                      />
                      <MarqueeCapture
                        documentId={documentId}
                        pageIndex={pageIndex}
                        scale={scale}
                      />
                    </div>
                  </PagePointerProvider>
                )}
              />
            </Viewport>
          </GlobalPointerProvider>
        </EmbedPDF>
      </div>
    </>
  );
};

interface PdfViewerPanelProps {
  draggable: boolean;
  onToggleDrag: () => void;
}

export default function PdfViewerPanel({
  draggable,
  onToggleDrag,
}: PdfViewerPanelProps) {
  const pdf = usePdfViewerStore();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    const load = async () => {
      if (!pdf.open || !pdf.active) return;
      setBlobUrl(null);
    };
    load();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [pdf.open, pdf.active]);

  const activePdf = pdf.tabs.find((t) => t.attachmentId === pdf.active);

  const onTabChange = (tabId: string) => pdf.setActive(tabId);
  const onTabClose = (tabId: string) => pdf.closeTab(tabId);
  if (!pdf.open) return null;

  return (
    <div className="pointer-events-auto z-10 flex h-full w-full flex-col overflow-hidden rounded-md border border-black/10 bg-gradient-to-br from-black/10 to-black/10 py-px shadow-2xl shadow-black/25 backdrop-blur-md">
      <div className="flex flex-col">
        <ol className="relative flex px-2 text-sm select-none">
          <li className="mr-auto flex">
            <h2 className="font-display flex w-full items-center justify-between truncate font-medium text-slate-500">
              <Icon icon="file-type-pdf" className="mr-1 h-4 w-4" />
              <span>View and annotate PDFs</span>
            </h2>
          </li>
          <li className="flex items-center gap-2">
            <button
              onClick={onToggleDrag}
              className="hover:text-alert-700 font-display whitespace-nowrap text-slate-800"
              title={
                draggable ? "Unlock panel position" : "Lock panel position"
              }
            >
              {draggable ? (
                <Icon icon="lock-open" className="h-5 w-5 text-inherit" />
              ) : (
                <Icon icon="lock" className="h-5 w-5 text-inherit" />
              )}
            </button>
            {/* {pdf.active && activePdf?.numPages && (
              <div className='text-[11px] text-slate-400'>
                Page <span class='text-slate-300'>{activePdf?.page}</span> of{' '}
                {activePdf?.numPages}
              </div>
            )} */}
            <button
              onClick={() => pdf.closeViewer()}
              className="hover:text-alert-700 font-display t whitespace-nowrap text-slate-800"
              title="Close preview"
            >
              <Icon icon="x" className="h-5 w-5 text-inherit" />
            </button>
          </li>
        </ol>
        <Tabs
          tabs={pdf.tabs}
          onTabChange={onTabChange}
          onTabClose={onTabClose}
          activeTabId={pdf?.active ?? ""}
        />
      </div>
      <div className="relative z-0 h-full">
        <PDFViewer
          activeFilename={activePdf?.filename ?? "unknown.pdf"}
          blobUrl={blobUrl ?? ""}
          page={activePdf?.page ?? 1}
          coords={activePdf?.pageCoords}
          onNumPages={(n) => pdf.active && pdf.setNumPages(pdf.active, n)}
        />
      </div>
    </div>
  );
}
