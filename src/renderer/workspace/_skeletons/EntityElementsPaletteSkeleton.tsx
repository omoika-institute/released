import Icon from "@/components/icons";

export default function EntityElementsPaletteSkeleton() {
  return (
    <aside className="relative flex max-w-80 min-w-80 shrink flex-col items-start rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md py-1 w-full">
      <header className="hover:border-primary-350 border-mirage-400 z-50 flex cursor-pointer py-0.5 pb-1 justify-between items-center text-slate-400 transition-colors duration-500 ease-in-out px-2 w-full">
        <p class="font-semibold tracking-wider text-slate-400">
          Entity Elements
        </p>
        <div className="">
          <Icon icon="help" />
        </div>
      </header>

      <header className="hover:border-primary-350 border-mirage-400 z-50 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out hover:text-slate-500 w-full">
        <p class="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
          Display Elements
        </p>
      </header>

      <div className="w-full overflow-y-auto px-1.5 transition-all duration-200 ease-in h-full space-y-1.5 pt-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="from-mirage-600/20 to-mirage-600/10 shadow-cod-800/20 relative z-0 flex w-full items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% shadow-2xs"
          >
            <div className="group mb-0.5 flex w-full flex-col items-start pr-0 p-2 space-y-1">
              <div className="h-4 w-24 bg-slate-700/40 rounded animate-pulse" />
              <div className="h-3 w-48 bg-slate-700/30 rounded animate-pulse" />
            </div>
            <div className="absolute right-2 h-8 w-8 bg-slate-700/40 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <header className="hover:border-primary-350 border-mirage-400 z-50 flex cursor-pointer items-center border-b-2 py-0.5 pb-1 text-slate-700 transition-colors duration-500 ease-in-out hover:text-slate-500 w-full mt-2">
        <p class="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
          Input Elements
        </p>
      </header>

      <div className="w-full overflow-y-auto px-1.5 transition-all duration-200 ease-in h-full space-y-1.5 pt-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="from-mirage-600/20 to-mirage-600/10 shadow-cod-800/20 relative z-0 flex w-full items-center overflow-hidden rounded-md border border-slate-950 bg-transparent from-10% shadow-2xs"
          >
            <div className="group mb-0.5 flex w-full flex-col items-start pr-0 p-2 space-y-1">
              <div className="h-4 w-20 bg-slate-700/40 rounded animate-pulse" />
              <div className="h-3 w-48 bg-slate-700/30 rounded animate-pulse" />
            </div>
            <div className="absolute right-2 h-8 w-8 bg-slate-700/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </aside>
  );
}
