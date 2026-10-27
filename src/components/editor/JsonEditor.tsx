import { useEffect, useRef } from "preact/hooks";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter,
} from "@codemirror/view";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
} from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";

type JsonEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  className?: string;
};

const darkTheme = EditorView.theme(
  {
    "&": {
      color: "#ebdbb2",
      backgroundColor: "#28282875",
    },
    ".cm-content": {
      caretColor: "#fabd2f",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: "14px",
      lineHeight: "1.35",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#fabd2f",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#504945",
    },
    ".cm-activeLine": {
      backgroundColor: "#32302f",
    },
    ".cm-string": {
      color: "#b8bb26",
    },
    ".cm-propertyName": {
      color: "#83a598",
    },
    ".cm-gutters": {
      backgroundColor: "#28282875",
      color: "#7c6f64",
      border: "none",
    },
    ".cm-activeLineGutter": {
      color: "#d5c4a1",
      backgroundColor: "#32302f",
    },
    ".cm-scroller": {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
  },
  { dark: true },
);

const jsonHighlightStyle = HighlightStyle.define([
  { tag: [t.propertyName], color: "#83a598" },
  { tag: [t.string, t.special(t.string)], color: "#b8bb26" },
  { tag: [t.escape], color: "#fe8019" },
  { tag: [t.number, t.bool, t.null], color: "#d3869b" },
  { tag: [t.punctuation, t.separator], color: "#d5c4a1" },
]);

export default function JsonEditor({
  value,
  onChange,
  className,
}: JsonEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const view = new EditorView({
      doc: value,
      parent: editorRef.current,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle),
        syntaxHighlighting(jsonHighlightStyle),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSelectionMatches(),
        json(),
        darkTheme,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          onChangeRef.current(update.state.doc.toString());
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
        ]),
      ],
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={editorRef} className={className} />;
}
