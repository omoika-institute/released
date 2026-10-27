import JsonEditor from "@/components/editor/JsonEditor";
import { useTranslation } from "react-i18next";

interface JsonEditorTabProps {
  jsonDraft: string;
  jsonError: string | null;
  onJsonChange: (value: string) => void;
  onReset: () => void;
  onApply: () => void;
}

export default function JsonEditorTab({
  jsonDraft,
  jsonError,
  onJsonChange,
  onReset,
  onApply,
}: JsonEditorTabProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 w-full flex-1">
      <section className="flex min-h-0 flex-1 flex-col rounded-md border border-black/20 bg-linear-to-br from-black/40 to-black/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-200">
            {t("workspace.jsonEditor.title")}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="rounded-md border border-slate-800/40 bg-slate-900/60 px-2 py-1 text-xs text-slate-300"
            >
              {t("workspace.jsonEditor.reset")}
            </button>
            <button
              onClick={onApply}
              className="rounded-md border border-emerald-500/40 bg-emerald-600/20 px-2 py-1 text-xs text-emerald-200"
            >
              {t("workspace.jsonEditor.apply")}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-800/50 bg-slate-950/60">
          <JsonEditor
            value={jsonDraft}
            onChange={onJsonChange}
            className="h-full text-xs text-slate-200"
          />
        </div>
        {jsonError && (
          <p className="mt-2 text-xs text-rose-300">{jsonError}</p>
        )}
      </section>
    </div>
  );
}
