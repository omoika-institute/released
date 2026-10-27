import Button from "@/components/buttons";
import Icon from "@/components/icons";

export default function PropertiesPanelSkeleton() {
  return (
    <aside className="flex w-80 flex-col gap-3 rounded-md border border-black/20 bg-linear-to-br from-black/50 to-black/40 shadow-2xl shadow-black/20 overflow-y-scroll">
      <header
        class="hover:border-primary-350 border-mirage-400 z-50 flex cursor-pointer justify-between items-center text-slate-400 transition-colors duration-500 ease-in-out px-2 w-full"
        onClick={() => console.log("setShow")}
      >
        <p class="font-semibold tracking-wider text-slate-400">
          Entity Properties
        </p>
        <div className="">
          <Icon icon="help" />
        </div>
      </header>

      <section className="rounded-md overflow-visible space-y-3 ">
        <button
          type="button"
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 border-mirage-400 border-b-2 py-0.5 group-hover:border-primary-350 px-2"
        >
          <span className=" text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            Entity Metadata
          </span>
          <Icon
            icon="chevron-down"
            className={`h-4 w-4 transition-transform`}
          />
        </button>

        <div className="space-y-3 px-4">
          <div className="space-y-1">
            <div className="h-3 w-12 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-9 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>

          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-12 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-12 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-12 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-12 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>
        </div>
      </section>

      <section className="rounded-md px-2 space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400 border-mirage-400 border-b-2 py-0.5 group-hover:border-primary-350 px-2"
        >
          <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            Element Metadata
          </span>
          <Icon
            icon="chevron-down"
            className={`h-4 w-4 transition-transform`}
          />
        </button>

        <div className="space-y-3 px-4 overflow-y-auto">
          <div className="space-y-1">
            <div className="h-3 w-12 bg-slate-700/40 rounded animate-pulse" />
            <div className="h-9 w-full bg-slate-700/30 rounded animate-pulse" />
          </div>
        </div>
      </section>
      <div className="px-3 w-full mt-auto">
        <Button.Solid
          disabled={true}
          variant="primary"
          className=" w-full my-3"
        >
          Publish Entity
        </Button.Solid>
      </div>
    </aside>
  );
}
