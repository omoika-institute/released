import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import {
  HighlightStyle,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "preact/hooks";

type CodeMirrorViewerLanguage = "auto" | "json" | "text";

type CodeMirrorViewerProps = {
  value: string;
  className?: string;
  language?: CodeMirrorViewerLanguage;
  showLineNumbers?: boolean;
};

const viewerTheme = EditorView.theme(
  {
    "&": {
      color: "#ebdbb2",
      backgroundColor: "#28282875",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
    ".cm-content": {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: "11px",
      lineHeight: "1.55",
      padding: "0.75rem",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "#28282875",
      color: "#7c6f64",
      border: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "#32302f",
    },
    ".cm-activeLineGutter": {
      color: "#d5c4a1",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#504945",
    },
  },
  { dark: true },
);

const jsonHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#928374" },
  { tag: [t.propertyName], color: "#83a598" },
  { tag: [t.string, t.special(t.string)], color: "#b8bb26" },
  { tag: [t.escape, t.regexp], color: "#fe8019" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#d3869b" },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: "#fb4934" },
  {
    tag: [t.definition(t.function(t.variableName)), t.function(t.variableName)],
    color: "#fabd2f",
  },
  { tag: [t.variableName, t.self], color: "#ebdbb2" },
  { tag: [t.className, t.typeName], color: "#8ec07c" },
  { tag: [t.operator, t.punctuation, t.separator], color: "#d5c4a1" },
]);

function resolveLanguage(value: string, language: CodeMirrorViewerLanguage) {
  if (language !== "auto") return language;
  const trimmed = value.trim();
  if (!trimmed) return "text";
  if (!/^[{\[]/.test(trimmed)) return "text";

  try {
    JSON.parse(trimmed);
    return "json";
  } catch {
    return "text";
  }
}

export default function CodeMirrorViewer({
  value,
  className,
  language = "auto",
  showLineNumbers = false,
}: CodeMirrorViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const resolvedLanguage = resolveLanguage(value, language);

  const extensions = useMemo(() => {
    return [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      syntaxHighlighting(defaultHighlightStyle),
      syntaxHighlighting(jsonHighlightStyle),
      viewerTheme,
      ...(showLineNumbers ? [lineNumbers()] : []),
      ...(resolvedLanguage === "json" ? [json()] : []),
    ];
  }, [resolvedLanguage, showLineNumbers]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    viewRef.current?.destroy();
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions,
      }),
      parent,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions, value]);

  return <div ref={containerRef} className={className} />;
}
