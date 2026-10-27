import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap } from "@codemirror/search";
import { Extension } from "@codemirror/state";
import { EditorView, dropCursor, keymap } from "@codemirror/view";
import {
  clickLinkExtension,
  codeBlockDecorationsExtension,
  defaultClickLinkHandler,
  defaultFoldableSyntaxExtensions,
  defaultHideExtensions,
  fixedTabWidthExtension,
  revealBlockOnArrowExtension,
} from "@prosemark/core";

export const prosemarkBasicSetupWithoutSoftIndent = (): Extension => [
  defaultHideExtensions,
  defaultFoldableSyntaxExtensions,
  revealBlockOnArrowExtension,
  clickLinkExtension,
  defaultClickLinkHandler,
  fixedTabWidthExtension,
  codeBlockDecorationsExtension,
  history(),
  dropCursor(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
    indentWithTab,
  ]),
  foldGutter(),
  EditorView.lineWrapping,
];
