export default function DashboardContentSkeleton() {
  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
      {/* Header section */}

      {/* Main content area - Cards grid */}
      <div className="relative -top-16 my-auto w-full items-center justify-center">
        <div className="flex h-full flex-col items-center justify-center text-slate-400">
          {/* Graphs available — dark, agency style */}
          <div
            className={`group bg-cod-900/50 relative grid w-full max-w-3xl place-items-start overflow-hidden rounded-xl border border-slate-800/40 px-10 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors before:absolute before:inset-0 before:-z-10 before:bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_24px)] before:opacity-5 after:absolute after:inset-0 after:-z-10 after:bg-[radial-gradient(60%_60%_at_70%_-10%,rgba(22,40,255,0.12),transparent_70%)] after:opacity-30`}
          >
            {/* Top ops strip */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-slate-700/60 bg-slate-900/60 px-2 py-1 font-mono text-[10px] tracking-[0.25em] text-slate-300/80 uppercase">
              internal // operations dashboard
            </div>

            <>
              <h1 className="font-display text-slate-350 text-3xl font-bold tracking-tight md:text-4xl">
                Loading available graphs...
              </h1>
              <p className="max-w-xl pt-3 text-slate-300/90">
                Create a graph to begin structuring entities and relationships.
              </p>
            </>
          </div>

          {/* Availability bias — dark, agency style */}
          <div
            className={`group bg-cod-900/50 relative mt-8 grid w-full max-w-3xl place-items-start overflow-hidden rounded-xl border border-slate-800/40 px-10 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors before:absolute before:inset-0 before:-z-10 before:bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_24px)] before:opacity-5 after:absolute after:inset-0 after:-z-10 after:bg-[radial-gradient(70%_70%_at_-10%_80%,rgba(2,154,254,0.12),transparent_70%)] after:opacity-25`}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-slate-700/60 bg-slate-900/60 px-2 py-1 font-mono text-[10px] tracking-[0.25em] text-slate-300/80 uppercase">
              analyst advisory
            </div>
            <h1 className="font-display text-slate-350 text-3xl font-bold tracking-tight md:text-4xl">
              The availability bias
            </h1>
            <p className="max-w-xl py-3 text-slate-300/90">
              Remember, data presentation can impact results during exploration
              and analysis. Availability bias is the tendency to think readily
              available examples are more representative than they really are.
              Even color can influence interpretation.
            </p>
            <div className="pointer-events-none mt-2 inline-flex items-center gap-2 rounded-sm border border-slate-800/40 bg-slate-900/40 px-2 py-1 font-mono text-[10px] tracking-[0.25em] text-slate-300/85 uppercase select-none">
              Bias influences judgment
              <span className="h-1 w-1 rounded-full bg-slate-400/60" />
              Remain skeptical
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
