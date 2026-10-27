import Button from "@/components/buttons";

export default function WorkspaceAppbarSkeleton() {
  return (
    <header className="relative flex shrink items-center rounded-md border-r-3 border-black/10 bg-linear-to-tr from-black/40 to-black/50 shadow-2xl shadow-black/25 backdrop-blur-md py-1 px-2 w-full gap-x-4 ">
      <div className="flex items-center gap-x-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-display text-slate-400 text-nowrap px-1">
            Entity:
          </label>
          <select
            disabled={true}
            className="mr-2 min-w-62 hover:outline-mirage-400 outline-mirage-500 text-slate-350 rounded border-2 border-transparent bg-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-2 text-sm font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:border-primary focus:bg-black/60 focus-visible:outline-transparent"
          >
            <option value="">No entity loaded</option>
          </select>
          <Button.Solid
            disabled={true}
            variant="primary"
            className="text-xs w-full my-2"
          >
            Create New Entity
          </Button.Solid>
          <Button.Ghost variant="primary" className="text-xs" disabled={true}>
            Import Entity (JSON)
          </Button.Ghost>
          <Button.Ghost variant="primary" className="text-xs" disabled={true}>
            Import Entities (ZIP)
          </Button.Ghost>
        </div>
        <Button.Ghost disabled={true} variant="primary" className="text-xs">
          Export JSON
        </Button.Ghost>
        <Button.Ghost disabled={true} variant="primary" className="text-xs">
          Export Python
        </Button.Ghost>
      </div>
      <nav className="ml-auto mr-2">
        <ul className="flex gap-x-6">
          <li className="h-5 w-16 bg-slate-700/40 rounded animate-pulse" />
          <li className="h-5 w-16 bg-slate-700/40 rounded animate-pulse" />
          <li className="h-5 w-24 bg-slate-700/40 rounded animate-pulse" />
          <li className="h-5 w-24 bg-slate-700/40 rounded animate-pulse" />
        </ul>
      </nav>
    </header>
  );
}
