import Logo from "@/assets/images/wordmark.svg?react";
import { ChamferFrame } from "@/components/ChamferFrame";
import { Button } from "@/components/buttons/Button";
import { Icon } from "@/components/icons";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { formatDate } from "@/components/utils";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatNumber } from "./shareLinks";
import type { OverviewCase } from "./types";
import { Grid, Hatch } from "@/components/Geometry";

type OverviewSidebarProps = {
  cases: OverviewCase[];
  newestCase?: OverviewCase;
  onRefreshCases: () => void;
};

export default function OverviewSidebar({
  cases,
  newestCase,
  onRefreshCases,
}: OverviewSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <aside className="relative min-h-0 overflow-hidden rounded-sm border border-subtle/75 ">
      <div className=" flex h-full min-h-0 flex-col ">
        <div className="border-b border-subtle p-5 relative bg-panel/50">
          <div className="w-px h-full bg-accent absolute right-2 top-0 z-999" />
          <div className="w-40 h-px bg-accent absolute left-4 bottom-2 z-999" />
          <Link to="/" replace className="inline-flex ">
            <Logo class="h-6 w-auto fill-primary-txt" />
          </Link>
          <p className=" font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt">
            {t("overview.sidebar.title")}
          </p>
          <Hatch />
          <Grid />
        </div>
        <div className="space-y-3 px-5 py-5">
          <Button
            type="button"
            variant="panel"
            onClick={() => navigate("/marketplace")}
            className="w-full"
          >
            {t("overview.sidebar.marketplace")}
            <Icon icon="shopping-bag" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="panel"
            onClick={() => navigate("/settings")}
            className="w-full"
          >
            {t("overview.sidebar.settings")}
            <Icon icon="settings" className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-auto space-y-3 border-t border-ink/8 px-5 py-5">
          <div className="flex items-end justify-between mb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary-txt">
              {t("overview.sidebar.cases")}
            </p>
            <div className="font-mono text-4xl font-medium leading-6 tracking-[-0.08em] text-review-txt/75">
              {formatNumber(cases.length)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <LanguageSwitcher menuPlacement="top" />
          </div>
        </div>
      </div>
    </aside>
  );
}
