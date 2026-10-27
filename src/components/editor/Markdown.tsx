import { Extension, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import {
  prosemarkBaseThemeSetup,
  prosemarkMarkdownSyntaxExtensions,
} from "@prosemark/core";
import { htmlBlockExtension } from "@prosemark/render-html";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { HTMLAttributes } from "preact";
import { prosemarkBasicSetupWithoutSoftIndent } from "./prosemarkSetup";

// Deprecated custom markdown renderer removed.
// This editor is now fully Prosemark-based.

type MarkdownEditorProps = Omit<HTMLAttributes<HTMLDivElement>, "onBlur"> & {
  value: string;
  setValue?: (value: string) => void;
  onCancel?: () => void;
  onBlur?: (value: string) => void;
  onFocus?: () => void;
};

const prosemarkEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "var(--color-primary-txt)",
      backgroundColor: "transparent",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-sans)",
      lineHeight: "1.65",
    },
    ".cm-content": {
      caretColor: "var(--color-review-txt)",
      fontSize: "14px",
      padding: "1rem",
      minHeight: "100%",
    },
    ".cm-gutters, .cm-foldGutter": {
      display: "none",
    },
    ".cm-line": {
      paddingLeft: "0",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--color-review-txt)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(243, 198, 94, 0.16)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(217, 170, 66, 0.035)",
    },
  },
  { dark: true }
);

export default function MarkdownEditor({
  value,
  setValue,
  onBlur,
  onCancel,
  onFocus,
  ...props
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastValueRef = useRef<string>(value);
  const setValueRef = useRef<MarkdownEditorProps["setValue"]>(setValue);
  const onBlurRef = useRef<MarkdownEditorProps["onBlur"]>(onBlur);
  const onCancelRef = useRef<MarkdownEditorProps["onCancel"]>(onCancel);
  const onFocusRef = useRef<MarkdownEditorProps["onFocus"]>(onFocus);

  useEffect(() => {
    setValueRef.current = setValue;
  }, [setValue]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  const extensions = useMemo<Extension[]>(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const nextValue = update.state.doc.toString();
      lastValueRef.current = nextValue;
      setValueRef.current?.(nextValue);
    });

    const domHandlers = EditorView.domEventHandlers({
      blur: () => {
        const currentValue =
          viewRef.current?.state.doc.toString() ?? lastValueRef.current;
        onBlurRef.current?.(currentValue);
        return false;
      },
      focus: () => {
        onFocusRef.current?.();
        return false;
      },
    });

    return [
      prosemarkEditorTheme,
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
      keymap.of([
        {
          key: "Escape",
          run: () => {
            onCancelRef.current?.();
            return true;
          },
        },
      ]),
      domHandlers,
      updateListener,
    ];
  }, []);

  useEffect(() => {
    const parent = editorRef.current;
    if (!parent || viewRef.current) return;

    lastValueRef.current = value;
    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      lastValueRef.current = value;
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      lastValueRef.current = value;
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    lastValueRef.current = value;
  }, [value]);

  return <div {...props} ref={editorRef} />;
}
