import { memo } from "preact/compat";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { htmlBlockExtension } from "@prosemark/render-html";
import { prosemarkBasicSetupWithoutSoftIndent } from "@/components/editor/prosemarkSetup";
import { Icon } from "@/components/icons";
import { usePropertiesStore } from "@/stores";
import { NodeResizeControl, useReactFlow } from "@xyflow/react";
import { useParams } from "react-router-dom";
import EntityToolbar from "./EntityToolbar";
import EntityHandles from "./EntityHandles";
import { toSnakeCase } from "../utils";

const markdownNodeTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "#d4d4d4",
      fontSize: "13px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "Lato, sans-serif",
      lineHeight: "1.6",
      scrollbarColor: "#1c233b #06070b",
    },
    ".cm-content": {
      padding: "0.85rem 1rem 1rem",
      minHeight: "100%",
      caretColor: "#5e6aff",
    },
    ".cm-gutters, .cm-foldGutter": {
      display: "none",
    },
    ".cm-line": {
      paddingLeft: "0",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(22, 40, 255, 0.08)",
      borderRadius: "3px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(43, 59, 255, 0.28)",
    },
    ".cm-heading": {
      color: "#f1f5f9",
      fontFamily: '"Zx Gamut", Lato, sans-serif',
      fontWeight: "600",
    },
    ".cm-strong": {
      color: "#f8fafc",
      fontWeight: "700",
    },
    ".cm-emphasis": {
      color: "#e2e8f0",
      fontStyle: "italic",
    },
    ".cm-url, .cm-link": {
      color: "#5e6aff",
      textDecoration: "underline",
      textUnderlineOffset: "2px",
    },
    ".cm-monospace": {
      color: "#f1f5f9",
      backgroundColor: "rgba(15, 23, 42, 0.85)",
      border: "1px solid rgba(148, 163, 184, 0.12)",
      borderRadius: "3px",
      fontFamily: '"Fira Code", monospace',
      fontSize: "0.92em",
      padding: "0 0.2rem",
    },
    ".cm-blockquote-line": {
      borderLeft: "2px solid #3f4eff",
      paddingInlineStart: "14px !important",
      color: "#b8c0d1 !important",
      backgroundColor: "rgba(22, 40, 255, 0.06)",
    },
  },
  { dark: true }
);

interface EntityMarkdownNodeProps {
  ctx: any;
  label?: any;
  blueprint?: any;
}

function buildNodeData(
  current: Record<string, any>,
  key: string,
  value: string
) {
  return {
    ...current,
    [key]: value,
    __markdown: value,
  };
}

function syncPropertiesTab(entityId: string, nextData: Record<string, any>) {
  try {
    const store = usePropertiesStore.getState();
    const tab = store.tabs.find((t) => t.entityId === entityId);
    if (!tab) return;
    const currStr = JSON.stringify(tab.data ?? {});
    const nextStr = JSON.stringify(nextData);
    if (currStr !== nextStr) store.setData(entityId, nextData);
  } catch (_) {}
}

const controlStyle = {
  background: "transparent",
  border: "none",
};

const fallbackAccentColor = "#2b3bff";

const getAccentColor = (color?: string) =>
  typeof color === "string" && color.trim() ? color : fallbackAccentColor;

const isMarkdownElement = (element: any) =>
  element?.type === "md" || element?.type === "markdown";

export function EntityMarkdownNode({
  ctx,
  blueprint,
}: EntityMarkdownNodeProps) {
  const { updateNodeData } = useReactFlow();
  const { hid } = useParams();

  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef(false);
  const lastValueRef = useRef<string>("");
  const dataRef = useRef<Record<string, any>>({});
  const markdownFieldRef = useRef<string>("__markdown");
  const ctxIdRef = useRef<string>(ctx?.id ?? "");
  const hidRef = useRef<string | undefined>(undefined);
  const updateNodeDataRef = useRef(updateNodeData);

  const ctxData = useMemo<Record<string, any>>(
    () => ctx?.data ?? {},
    [ctx?.data]
  );
  const allElements = useMemo(
    () =>
      blueprint?.elements.flatMap((entry) =>
        Array.isArray(entry) ? entry : [entry]
      ) ?? [],
    [blueprint]
  );
  const markdownElement = useMemo(
    () => allElements.find(isMarkdownElement),
    [allElements]
  );

  const markdownFieldKey = useMemo(() => {
    if (typeof markdownElement?.label === "string" && markdownElement.label) {
      return toSnakeCase(markdownElement.label);
    }

    const firstStringField = Object.keys(ctxData).find(
      (key) => key !== "label" && typeof ctxData[key] === "string"
    );
    return firstStringField ?? "__markdown";
  }, [markdownElement, ctxData]);

  const markdownValue = useMemo(() => {
    const nodeValue = ctxData?.[markdownFieldKey];
    if (typeof nodeValue === "string") return nodeValue;
    const legacyValue = ctxData?.__markdown;
    if (typeof legacyValue === "string") return legacyValue;
    const blueprintDefault =
      typeof markdownElement?.value === "string" ? markdownElement.value : "";
    if (nodeValue == null) return blueprintDefault;
    return String(nodeValue);
  }, [ctxData, markdownFieldKey, markdownElement]);

  useEffect(() => {
    dataRef.current = ctxData;
    markdownFieldRef.current = markdownFieldKey;
    lastValueRef.current = markdownValue;
  }, [ctxData, markdownFieldKey, markdownValue]);

  useEffect(() => {
    ctxIdRef.current = ctx?.id ?? "";
    hidRef.current = hid;
    updateNodeDataRef.current = updateNodeData;
  }, [ctx?.id, hid, updateNodeData]);

  const persistChanges = useCallback(async () => {
    if (!pendingPersistRef.current) return;
    const entityId = ctxIdRef.current;
    const graphId = hidRef.current;
    if (!graphId || !entityId) return;

    pendingPersistRef.current = false;
    const nextData = buildNodeData(
      dataRef.current,
      markdownFieldRef.current,
      lastValueRef.current
    );

    try {
      await window.api.graph.updateEntity({
        graphId,
        entityId,
        updates: {
          data: nextData,
        },
      });
    } catch (error) {
      console.error("Failed to update markdown note:", error);
    }
  }, []);

  const clearPersistTimer = useCallback(() => {
    if (!persistTimerRef.current) return;
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;
  }, []);

  const schedulePersist = useCallback(() => {
    clearPersistTimer();
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistChanges();
    }, 350);
  }, [clearPersistTimer, persistChanges]);

  const preventNodePointerEvents = useCallback((event: any) => {
    event.stopPropagation();
  }, []);

  const extensions = useMemo(
    () => [
      markdownNodeTheme,
      EditorView.lineWrapping,
      EditorState.readOnly.of(false),
      EditorView.editable.of(true),
      markdown({
        codeLanguages: languages,
        extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
      }),
      prosemarkBasicSetupWithoutSoftIndent(),
      prosemarkBaseThemeSetup(),
      htmlBlockExtension,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        const nextValue = update.state.doc.toString();
        lastValueRef.current = nextValue;

        const nextData = buildNodeData(
          dataRef.current,
          markdownFieldRef.current,
          nextValue
        );

        dataRef.current = nextData;
        pendingPersistRef.current = true;

        const entityId = ctxIdRef.current;
        if (!entityId) return;

        updateNodeDataRef.current(entityId, nextData);
        syncPropertiesTab(entityId, nextData);
        schedulePersist();
      }),
      EditorView.domEventHandlers({
        blur: () => {
          clearPersistTimer();
          void persistChanges();
          return false;
        },
      }),
    ],
    [clearPersistTimer, persistChanges, schedulePersist]
  );

  useEffect(() => {
    const parent = editorRef.current;
    if (!parent || viewRef.current) return;

    const view = new EditorView({
      doc: lastValueRef.current,
      parent,
      extensions,
    });

    viewRef.current = view;

    return () => {
      clearPersistTimer();
      void persistChanges();
      view.destroy();
      viewRef.current = null;
    };
  }, [clearPersistTimer, extensions, persistChanges]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === markdownValue) return;
    const isFocused = view.contentDOM.contains(document.activeElement);
    if (pendingPersistRef.current && isFocused) return;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: markdownValue },
    });
  }, [markdownValue]);

  const entityTitle =
    blueprint?.label ?? ctxData?.label ?? ctx?.label ?? "Markdown Note";
  const accentColor = getAccentColor(blueprint?.color);

  const { label: _label, ...data } = ctxData;

  return (
    <>
      <NodeResizeControl style={controlStyle} minWidth={320} minHeight={260}>
        <Icon
          icon="resize"
          className="absolute -left-2 -top-2 h-5 w-5 cursor-nwse-resize text-slate-700 opacity-70 transition-colors duration-150 hover:text-slate-300 focus:text-slate-300 active:text-slate-300"
        />
      </NodeResizeControl>
      <EntityHandles />
      <EntityToolbar
        entityId={ctx.id}
        entityTitle={entityTitle}
        properties={data}
      />
      <div className="node group relative flex h-full w-full! cursor-grab flex-col overflow-hidden rounded-md border border-ink/10 bg-[linear-gradient(180deg,rgba(8,12,22,0.98),rgba(3,6,18,0.95))] shadow-2xl shadow-black/55 ring-1 ring-inset ring-ink/5 transition-all duration-150 ease-in-out hover:border-ink/20 hover:ring-ink/10 focus:cursor-grabbing active:cursor-grabbing">
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ backgroundColor: accentColor }}
        />
        <div className="flex w-full cursor-grab items-center gap-2 border-b border-ink/10 px-3 pb-2.5 pt-3.5 text-slate-350 active:cursor-grabbing">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-ink/10 bg-ink/5"
            style={{ color: accentColor }}
          >
            <Icon icon="markdown" className="h-4.5 w-4.5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-display text-[10px] uppercase text-ink-hard/60">
              {ctx.id.substring(0, 8).toUpperCase()}
            </p>
            <p className="font-display mt-1 truncate text-sm font-semibold uppercase text-ink">
              {entityTitle}
            </p>
          </div>
          <span className="rounded-sm border border-ink/10 bg-paper/50 px-2 py-1 font-code text-[10px] uppercase text-slate-400">
            MD
          </span>
        </div>
        <div
          className="nodrag nowheel h-full min-h-40 overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(22,40,255,0.09),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.75),rgba(6,7,11,0.92))]"
          onMouseDown={preventNodePointerEvents}
          onClick={preventNodePointerEvents}
          onPointerDown={preventNodePointerEvents}
        >
          <div
            ref={editorRef}
            className="nodrag nowheel h-full min-h-40 w-full"
          />
        </div>
      </div>
    </>
  );
}

export default memo(EntityMarkdownNode);
