import { Icon } from "@/components/icons";
import { Button } from "@/components/buttons/Button";
import { useTranslation } from "react-i18next";
import CaseGrid from "./CaseGrid";
import CaseList from "./CaseList";
import type { LayoutMode, OverviewCase } from "./types";

type CasesInventoryProps = {
  availableCases: OverviewCase[];
  filteredCases: OverviewCase[];
  layoutMode: LayoutMode;
  isLoading: boolean;
  caseSearch: string;
  setCaseSearch: (value: string) => void;
  onCreateCase: () => void;
  onImportCase: () => void;
  onOpenCaseOverview: (caseId: string) => void;
  onOpenFlow: (caseId: string) => void;
};

export default function CasesInventory({
  availableCases,
  filteredCases,
  layoutMode,
  isLoading,
  caseSearch,
  setCaseSearch,
  onCreateCase,
  onImportCase,
  onOpenCaseOverview,
  onOpenFlow,
}: CasesInventoryProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col border-b border-subtle pl-5 lg:flex-row lg:items-center lg:justify-between ">
        <p className="max-w-3xl text-sm leading-6 text-primary-txt">
          {t("overview.inventory.body")}
        </p>
        <div className="relative rounded-xs h-9 border border-subtle/50 flex text-primary-txt cursor-pointer text-sm px-3 min-w-lg items-center justify-between text-left outline-none disabled:cursor-not-allowed disabled:opacity-60 border-b  font-display transition placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/30">
          <Icon icon="search" className="h-4 w-4 mr-2 shrink-0 text-ink-soft" />
          <input
            value={caseSearch}
            onInput={(event) => setCaseSearch(event.currentTarget.value)}
            placeholder="Search cases..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-hard/45"
            title="Filter cases by title, description, or id."
          />
          {caseSearch.trim() && (
            <button
              type="button"
              onClick={() => setCaseSearch("")}
              className="text-ink-hard/50 transition-colors hover:text-ink"
              title="Clear case search"
            >
              <Icon icon="x" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {availableCases.length === 0 ? (
          <NoCasesPanel
            onCreateCase={onCreateCase}
            onImportCase={onImportCase}
          />
        ) : isLoading ? (
          <div
            className={
              layoutMode === "grid"
                ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                : "flex flex-col gap-3"
            }
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-sm border border-dashed border-subtle/10 bg-canvas p-4"
              >
                <div className="h-3 w-24 animate-pulse rounded bg-subtle/10" />
                <div className="mt-4 h-5 w-2/3 animate-pulse rounded bg-subtle/12" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-subtle/10" />
                <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-subtle/10" />
              </div>
            ))}
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="grid min-h-80 place-items-center rounded-sm border border-dashed border-subtle/50 bg-canvas px-6 py-12 text-center text-sm text-ink-soft">
            No cases match the active search.
          </div>
        ) : layoutMode === "list" ? (
          <CaseList
            cases={filteredCases}
            onOpenCaseOverview={onOpenCaseOverview}
            onOpenFlow={onOpenFlow}
          />
        ) : (
          <CaseGrid
            cases={filteredCases}
            onOpenCaseOverview={onOpenCaseOverview}
            onOpenFlow={onOpenFlow}
          />
        )}
      </div>
    </>
  );
}

function NoCasesPanel({
  onCreateCase,
  onImportCase,
}: {
  onCreateCase: () => void;
  onImportCase: () => void;
}) {
  const details = [
    {
      icon: "search",
      label: "Custody & Storage",
      value: "Your data stays on your machine",
    },
    {
      icon: "chart-line",
      label: "History",
      value: "Watch your investigation graphs evolve over time",
    },
    {
      icon: "heart",
      label: "Built with love",
      value: "So you can close the loop faster",
    },
  ];

  return (
    <div className="relative h-full overflow-hidden rounded-md text-primary-txt pb-10">
      <div className="relative flex h-full flex-col p-5 ">
        <section className="mb-8 flex flex-1 flex-col w-full items-center border rounded-sm border-subtle/50 bg-panel/15 p-4 sm:p-5 h-full ">
          <div className="flex shrink-0 items-center mr-auto gap-2 border border-subtle/50 rounded-xs bg-black/20 px-2 py-2 font-display text-[10px] uppercase tracking-[0.2em] text-muted-txt">
            <Icon
              icon="folder-search"
              className="h-3.5 w-3.5 text-review-border/50"
            />
            <span>Empty</span>
          </div>
          <div className="flex flex-col mt-16 items-center justify-center min-w-0">
            <p className="font-display text-4xl font-semibold text-primary-txt">
              No cases available yet.
            </p>
            <p className="mt-2 max-w-md text-center leading-6 text-secondary-txt">
              Create your first case to start an investigation, or import
              existing data when you already have a case bundle.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="primary"
              onClick={onCreateCase}
              className="h-9"
            >
              <Icon icon="plus" className="h-4 w-4" />
              Create New Case
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onImportCase}
              className="h-9"
            >
              <Icon icon="cloud-upload" className="h-4 w-4" />
              Import Case
            </Button>
          </div>

          <div className="mt-auto pt-10">
            <div className="grid border-t border-subtle/50 pt-4 sm:grid-cols-3">
              {details.map((item) => (
                <div
                  key={item.label}
                  className="flex min-w-0 items-center gap-3 border-b border-dashed border-ink/8 py-3 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
                >
                  <Icon
                    icon={item.icon}
                    className="h-4 w-4 shrink-0 text-muted-txt"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-txt/75">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-txt">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
