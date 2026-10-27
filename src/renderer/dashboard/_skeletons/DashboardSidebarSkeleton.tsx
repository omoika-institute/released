export default function DashboardSidebarSkeleton() {
  return (
    <aside className="relative flex max-w-80 min-w-80 shrink flex-col items-start overflow-y-clip rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 py-px shadow-2xl shadow-black/25 backdrop-blur-md">
      {/* Search bar skeleton */}
      <div className="relative mb-2.5 w-full px-2 pt-2">
        <div className="h-10 w-full bg-slate-700/40 rounded animate-pulse" />
      </div>

      {/* Tab navigation skeleton */}
      <div className="relative left-0.75 w-full px-2">
        <section className="font-display flex shrink items-center justify-between rounded pb-1 font-semibold">
          <div className="flex w-full gap-2">
            <div className="h-8.5 w-26 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-8.5 w-26 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-8.5 w-26 bg-slate-700/40 rounded animate-pulse" />
          </div>
        </section>
      </div>

      {/* Panel content skeleton */}
      <div className="relative my-1 flex h-[calc(92.5%-80px)] w-full flex-col px-2 overflow-y-auto">
        {/* Favorites section */}
        <div className="mb-4">
          <div className="h-4 w-20 bg-slate-700/40 rounded animate-pulse mb-2" />
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-full bg-slate-700/30 rounded-md animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Recent/All section */}
        <div>
          <div className="h-4 w-24 bg-slate-700/40 rounded animate-pulse mb-2" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-full bg-slate-700/30 rounded-md animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom button skeleton */}
      <div className="absolute bottom-3 mx-4 w-[calc(100%-2rem)]">
        <div className="h-10 w-full bg-slate-700/40 rounded animate-pulse" />
      </div>
    </aside>
  );
}
