import Button from "@/components/buttons";
import Icon from "@/components/icons";

export default function LayoutCanvasSkeleton() {
  return (
    <div className="flex w-full flex-1 flex-col pr-3">
      <section className="rounded-md border border-black/20 bg-linear-to-br from-black/50 to-black/45 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-350">
            Layout Canvas
          </h2>
          <div className="flex items-center gap-3">
            <button
              disabled={true}
              className="flex rounded-md border border-slate-800/40 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
            >
              <Icon icon="arrow-back" className="w-4 h-4 mr-2" />
              Undo
            </button>
            <button
              disabled={true}
              className="flex rounded-md border border-slate-800/40 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
            >
              Redo
              <Icon icon="arrow-forward" className="w-4 h-4 ml-2" />
            </button>
            <Button.Ghost disabled={true} variant="primary" className="text-xs">
              Save Entity
            </Button.Ghost>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-md">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>Row 0</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={true}
                  className="text-slate-500 hover:text-slate-300"
                >
                  Remove row
                </button>
              </div>
            </div>
            <div className="relative flex items-stretch gap-2">
              <div className="flex-1 rounded-md border border-slate-800/40 bg-slate-950/40 p-4 space-y-3">
                <div className="h-3 w-16 bg-slate-700/40 rounded animate-pulse" />
                <div className="h-10 w-full bg-slate-700/30 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
