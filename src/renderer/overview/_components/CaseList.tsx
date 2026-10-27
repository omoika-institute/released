import { Button } from "@/components/buttons/Button";
import { Icon } from "@/components/icons";
import { formatDate } from "@/components/utils";
import { useTranslation } from "react-i18next";
import type { OverviewCase } from "./types";

type CaseListProps = {
  cases: OverviewCase[];
  onOpenCaseOverview: (caseId: string) => void;
  onOpenFlow: (caseId: string) => void;
};

export default function CaseList({
  cases,
  onOpenCaseOverview,
  onOpenFlow,
}: CaseListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      {cases.map((graph) => (
        <div
          key={graph.id}
          className="rounded-sm border border-dashed border-ink/10 bg-[rgb(4,6,12)] transition-colors hover:border-sea/25 hover:bg-sea/6"
        >
          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <button
              type="button"
              onClick={() => onOpenCaseOverview(graph.id)}
              className="min-w-0 text-left"
            >
              <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
                <span>{t("overview.inventory.caseRecord")}</span>
                <span className="h-1 w-1 rounded-full bg-sea" />
                <span>{formatDate(graph.ctime)}</span>
              </div>
              <h3 className="mt-3 truncate text-lg font-medium uppercase tracking-[-0.03em] text-ink">
                {graph.label}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">
                {graph.description}
              </p>
            </button>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <div className="rounded-sm border border-subtle px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {graph.id.slice(0, 17)}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenCaseOverview(graph.id)}
                className="h-9"
              >
                <Icon icon="chart-dots-3" className="h-4 w-4" />
                {t("overview.inventory.details")}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onOpenFlow(graph.id)}
                className="h-9"
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
