import { Button } from "@/components/buttons/Button";
import { Icon } from "@/components/icons";
import { formatDate } from "@/components/utils";
import { useTranslation } from "react-i18next";
import type { OverviewCase } from "./types";
import { Grid, Hatch } from "@/components/Geometry";

type CaseGridProps = {
  cases: OverviewCase[];
  onOpenCaseOverview: (caseId: string) => void;
  onOpenFlow: (caseId: string) => void;
};

export default function CaseGrid({
  cases,
  onOpenCaseOverview,
  onOpenFlow,
}: CaseGridProps) {
  const { t } = useTranslation();
  console.log(cases);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 ">
      {cases.map((graph) => (
        <div
          key={graph.id}
          className="group relative overflow-hidden rounded-sm border transition duration-150 hover:-translate-y-0.5 hover:backdrop-blur-lg border-subtle  hover:border-review-border/15 bg-canvas/25 hover:bg-panel/50"
        >
          <div className="relative">
            <div className="flex items-center justify-between gap-3 font-display text-xs uppercase tracking-widest py-3 px-4 border-b group-hover:border-review-border/25 border-subtle  text-primary-txt relative ">
              <span>{graph.label}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenCaseOverview(graph.id)}
              className="block w-full min-w-0 text-left p-4 py-0"
            >
              <p className="mt-3 line-clamp-6 min-h-36 text-sm leading-6 text-ink-soft">
                {graph.description}
              </p>
            </button>
            <div className="mt-4  flex items-center justify-between border-y border-dashed border-subtle/50 py-3 font-display text-[10px] uppercase tracking-[0.22em] text-ink-soft px-5 relative">
              <Hatch />
              <Grid />
              <span class="text-review-txt">{formatDate(graph.ctime)}</span>
              <span>{graph.id.slice(0, 18)}</span>
            </div>
            <div className="mt-4 flex items-center gap-2 px-4 pb-3">
              <Button
                type="button"
                variant="primary"
                onClick={() => onOpenCaseOverview(graph.id)}
                className="h-9 flex-1 justify-center"
              >
                <Icon icon="chart-dots-3" className="h-4 w-4" />
                {t("overview.inventory.details")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenFlow(graph.id)}
                className="h-9 flex-1 justify-center"
              >
                <Icon icon="vector-bezier-arc" className="h-4 w-4" />
                {t("overview.inventory.flow")}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
