import type { Graph } from "@/api";
import MarkdownEditor from "@/components/editor/Markdown";
import { Icon } from "@/components/icons";
import Tooltip from "@/components/Tooltip";
import { formatDate, formatDateFrom } from "@/components/utils";
import { useCasesStore } from "@/stores";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { toast } from "react-toastify";

type CaseOverviewPanelProps = {
  graph: Graph;
};

const AUTOSAVE_BASE_DELAY_MS = 1200;
const AUTOSAVE_MAX_DELAY_MS = 9600;

export default function CaseOverviewPanel({ graph }: CaseOverviewPanelProps) {
  const { updateCase, isUpdating } = useCasesStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(graph.label ?? "");
  const [description, setDescription] = useState(graph.description ?? "");
  const [caseIdCopied, setCaseIdCopied] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const autosaveInputCountRef = useRef(0);
  const lastAutosaveValueRef = useRef(graph.description ?? "");
  const savedDescription = graph.description ?? "";
  const descriptionChanged = description !== savedDescription;

  useEffect(() => {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveInputCountRef.current = 0;
    lastAutosaveValueRef.current = graph.description ?? "";
    if (copyFeedbackTimerRef.current != null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    setEditingTitle(false);
    setCaseIdCopied(false);
    setTitle(graph.label ?? "");
    setDescription(graph.description ?? "");
  }, [graph.id, graph.label, graph.description]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (copyFeedbackTimerRef.current != null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!editingTitle) return;

    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitle]);

  const saveCase = useCallback(
    async (
      nextTitle = title,
      nextDescription = description,
      options: { silent?: boolean } = {},
    ) => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const cleanTitle = nextTitle.trim();
      const cleanDescription = nextDescription.trimEnd();

      if (!cleanTitle) {
        if (!options.silent) toast.error("Case title cannot be empty.");
        return;
      }

      if (
        cleanTitle === graph.label &&
        cleanDescription === (graph.description ?? "")
      ) {
        setEditingTitle(false);
        autosaveInputCountRef.current = 0;
        lastAutosaveValueRef.current = cleanDescription;
        return;
      }

      try {
        await updateCase({
          id: graph.id,
          label: cleanTitle,
          description: cleanDescription,
        });
        setEditingTitle(false);
        autosaveInputCountRef.current = 0;
        lastAutosaveValueRef.current = cleanDescription;
        if (!options.silent) toast.success("Case overview updated.");
      } catch (err: any) {
        if (!options.silent) {
          toast.error(err?.message || "Failed to update case overview.");
        }
      }
    },
    [description, graph.description, graph.id, graph.label, title, updateCase],
  );

  const resetDescription = () => {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveInputCountRef.current = 0;
    setDescription(graph.description ?? "");
  };

  const copyCaseId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(graph.id);
      setCaseIdCopied(true);

      if (copyFeedbackTimerRef.current != null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }

      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCaseIdCopied(false);
        copyFeedbackTimerRef.current = null;
      }, 1000);
    } catch (error) {
      console.error(error);
    }
  }, [graph.id]);

  useEffect(() => {
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (!descriptionChanged || description === lastAutosaveValueRef.current) {
      autosaveInputCountRef.current = 0;
      return;
    }

    const delay = Math.min(
      AUTOSAVE_BASE_DELAY_MS * 2 ** autosaveInputCountRef.current,
      AUTOSAVE_MAX_DELAY_MS,
    );
    autosaveInputCountRef.current += 1;

    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveCase(graph.label ?? title, description, { silent: true });
    }, delay);
  }, [description, descriptionChanged, graph.label, saveCase, title]);

  const descriptionActionClass =
    "relative inline-flex h-8 items-center gap-2 overflow-hidden border border-subtle/50 bg-panel/75 px-3 font-display text-[10px] uppercase tracking-[0.24em] text-primary-txt/60 transition-colors duration-150 hover:bg-panel/25 hover:text-review-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-review-border disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-primary-txt/60";

  return (
    <div className="min-h-0 flex-1 overflow-hidden p-5">
      <div className="h-full min-h-0">
        <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-subtle/50 bg-paper text-primary-txt">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-dot-acitve/70" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-14 bg-primary-txt/20" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(217,198,121,0.045)_0_1px,transparent_1px_8px)] opacity-70" />

          <div className="relative flex flex-wrap items-center gap-3 border-b border-subtle/50 bg-canvas/45 px-5 py-3 font-mono text-[10px]  tracking-[0.18em] text-terminal-txt ">
            <span class="uppercase">Case record</span>
            <span className="h-1 w-1 rounded-full bg-dot-active" />
            <Tooltip
              side="bottom"
              content={
                <p class="text-xs ">
                  Created{" "}
                  <span class="text-secondary-txt">
                    {formatDateFrom(graph.ctime)}
                  </span>
                  .
                </p>
              }
            >
              <span className={`hover:text-review-txt uppercase`}>
                {formatDate(graph.ctime)}
              </span>
            </Tooltip>

            <span className="h-1.5 w-1.5 rounded-full bg-dot-active" />
            <Tooltip
              side="bottom"
              content={
                caseIdCopied ? (
                  <span className="text-review-txt">Copied!</span>
                ) : (
                  "Click to copy case ID."
                )
              }
            >
              <span className={`hover:text-review-txt`} onClick={copyCaseId}>
                {graph.id}
              </span>
            </Tooltip>
          </div>

          <div className="relative px-5 pt-5">
            {editingTitle ? (
              <input
                spellcheck={false}
                ref={titleInputRef}
                value={title}
                disabled={isUpdating}
                onInput={(event) => setTitle(event.currentTarget.value)}
                onBlur={() => void saveCase()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveCase();
                  }
                  if (event.key === "Escape") {
                    setTitle(graph.label ?? "");
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="w-full border-0 border-b border-review-border/40 bg-transparent px-0 py-1 font-display text-3xl font-medium tracking-[0.06em] text-primary-txt outline-none focus:border-review-border"
              />
            ) : (
              <Tooltip
                side="bottom"
                showDelay={1200}
                content={"Click to edit case title."}
              >
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    setEditingTitle(true);
                  }}
                  onClick={() => setEditingTitle(true)}
                  className="block w-full min-w-0 text-left"
                >
                  <h2 className="truncate font-display text-3xl font-medium  tracking-[0.06em] text-primary-txt transition-colors hover:text-review-border">
                    {graph.label}
                  </h2>
                </button>
              </Tooltip>
            )}
          </div>

          <div className="relative mt-5 flex min-h-0 flex-1 flex-col border-t border-subtle/50">
            <div className="flex shrink-0 items-stretch justify-between gap-3 border-b border-subtle/50 bg-canvas/35">
              <p className="flex min-w-0 items-center px-5 py-2 font-display text-[10px] uppercase tracking-[0.24em] text-review-txt">
                Description
              </p>
              <div className="flex shrink-0 items-stretch">
                <button
                  type="button"
                  disabled={isUpdating || !descriptionChanged}
                  onClick={() => void saveCase()}
                  className={descriptionActionClass}
                >
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
                  <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
                  <Icon icon="check" className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  disabled={isUpdating || !descriptionChanged}
                  onClick={resetDescription}
                  className={descriptionActionClass}
                >
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/10" />
                  <span className="pointer-events-none absolute bottom-0 right-0 h-px w-5 bg-current/25" />
                  Reset
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-paper transition-colors focus-within:bg-canvas/80">
              <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-primary-txt/8" />
              <span className="pointer-events-none absolute bottom-0 right-0 z-10 h-px w-10 bg-current/20" />
              {!description && (
                <p className="pointer-events-none absolute left-4 top-4 z-10 text-sm leading-6 text-terminal-txt">
                  Start writing the case description in Markdown.
                </p>
              )}
              <MarkdownEditor
                value={description}
                setValue={setDescription}
                className="h-full min-h-64 text-ink"
              />
            </div>

            {descriptionChanged && (
              <p className="shrink-0 border-t border-subtle/50 bg-review-border/5 px-5 py-2 font-display text-[10px] uppercase tracking-[0.24em] text-review-txt">
                Unsaved changes
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
