import { useCasesStore } from "@/stores";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import CaseOverviewPanel from "./_components/CaseOverviewPanel";
import CasesInventory from "./_components/CasesInventory";
import CreateCaseModal from "./_components/CreateCaseModal";
import OverviewSidebar from "./_components/OverviewSidebar";
import WorldMapBackground from "@/components/WorldMapBackground";
import Icon from "@/components/icons";
import type { Graph } from "@/api";
import { Button } from "@/components/buttons/Button";
import { AltDropdown } from "@/components/inputs/Dropdown";
import LayoutToggle from "./_components/LayoutToggle";
import type {
  CaseSortMode,
  LayoutMode,
  OverviewCase,
} from "./_components/types";

type InventoryToolbarProps = {
  selectedCase: Graph | null;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  caseSortMode: CaseSortMode;
  setCaseSortMode: (mode: CaseSortMode) => void;
  onCreateCase: () => void;
  onOpenFlow: (caseId: string) => void;
};

function InventoryToolbar({
  selectedCase,
  layoutMode,
  setLayoutMode,
  caseSortMode,
  setCaseSortMode,
  onCreateCase,
  onOpenFlow,
}: InventoryToolbarProps) {
  const { t } = useTranslation();
  const sortOptions: { label: string; value: CaseSortMode }[] = [
    {
      label: t("overview.inventory.sort.createdDesc"),
      value: "created-desc",
    },
    {
      label: t("overview.inventory.sort.createdAsc"),
      value: "created-asc",
    },
    {
      label: t("overview.inventory.sort.updatedDesc"),
      value: "updated-desc",
    },
    {
      label: t("overview.inventory.sort.titleAsc"),
      value: "title-asc",
    },
    {
      label: t("overview.inventory.sort.titleDesc"),
      value: "title-desc",
    },
  ];

  if (selectedCase) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={() => onOpenFlow(selectedCase.id)}
          className="h-8"
        >
          <Icon icon="vector-bezier-arc" className="h-4 w-4" />
          {t("overview.inventory.flow")}
        </Button>
        {/* TODO Reintegrate and style */}
        {/* <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenDashboard(selectedCase.id)}
          className="h-8"
        >
          <Icon icon="chart-dots-3" className="h-4 w-4" />
          {t("overview.inventory.details")}
        </Button> */}
        {/* TODO: Paid plan only */}
        {/* <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenAgents(selectedCase.id)}
          className="h-8"
        >
          <Icon icon="cpu" className="h-4 w-4" />
          {t("overview.caseMenu.agents")}
        </Button> */}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <label className="flex h-12 w-40 items-center rounded-sm border border-ink/10 bg-canvas text-sm text-primary-txt ">
        <span className="sr-only">{t("overview.inventory.sort.label")}</span>
        <AltDropdown
          value={caseSortMode}
          options={sortOptions}
          label={t("overview.inventory.sort.label")}
          title={t("overview.inventory.sort.title")}
          onValueChange={(value) => setCaseSortMode(value as CaseSortMode)}
          className="h-full min-w-32  text-ink"
        />
      </label>
      {/* <LayoutToggle layoutMode={layoutMode} setLayoutMode={setLayoutMode} /> */}
      <Button
        type="button"
        variant="primary"
        onClick={onCreateCase}
        className="h-9"
      >
        <Icon icon="plus" className="h-4 w-4" />
        {t("overview.inventory.newCase")}
      </Button>
    </div>
  );
}

export default function Overview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tabId, caseId: routeCaseId } = useParams();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [caseSortMode, setCaseSortMode] =
    useState<CaseSortMode>("created-desc");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    routeCaseId ?? null,
  );
  const [caseSearch, setCaseSearch] = useState("");
  const { graphs, isLoading, fetchCases } = useCasesStore();

  useEffect(() => {
    void fetchCases({ skip: 0, limit: 100 });
  }, [fetchCases]);

  useEffect(() => {
    setSelectedCaseId(routeCaseId ?? null);
  }, [routeCaseId]);

  const availableCases = useMemo(
    () =>
      graphs.map((graph) => ({
        ...graph,
        description: graph.description?.trim().length
          ? graph.description
          : t("overview.noDescription"),
      })),
    [graphs, t],
  );

  const sortedCases = useMemo(() => {
    const compareByTitle = (a: OverviewCase, b: OverviewCase) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
      b.ctime.localeCompare(a.ctime);

    return availableCases.slice().sort((a, b) => {
      switch (caseSortMode) {
        case "created-asc":
          return a.ctime.localeCompare(b.ctime) || compareByTitle(a, b);
        case "updated-desc":
          return b.mtime.localeCompare(a.mtime) || compareByTitle(a, b);
        case "title-asc":
          return compareByTitle(a, b);
        case "title-desc":
          return compareByTitle(b, a);
        case "created-desc":
        default:
          return b.ctime.localeCompare(a.ctime) || compareByTitle(a, b);
      }
    });
  }, [availableCases, caseSortMode]);

  const filteredCases = useMemo(() => {
    const normalizedQuery = caseSearch.trim().toLowerCase();
    if (!normalizedQuery) return sortedCases;

    return sortedCases.filter((graph) =>
      [graph.label, graph.description, graph.id]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [caseSearch, sortedCases]);

  const newestCase = useMemo(
    () =>
      availableCases.slice().sort((a, b) => b.ctime.localeCompare(a.ctime))[0],
    [availableCases],
  );
  const selectedCase = useMemo(
    () => graphs.find((graph) => graph.id === selectedCaseId) ?? null,
    [graphs, selectedCaseId],
  );

  useEffect(() => {
    if (!selectedCaseId || isLoading || selectedCase) return;

    setSelectedCaseId(null);
    if (tabId) {
      navigate(`/overview/${tabId}`, { replace: true });
    }
  }, [isLoading, navigate, selectedCase, selectedCaseId, tabId]);

  const refreshCases = () => {
    void fetchCases({ skip: 0, limit: 100 });
  };

  const openCaseOverview = (caseId: string) => {
    setSelectedCaseId(caseId);
    if (tabId) {
      navigate(`/overview/${tabId}/case/${caseId}`);
    }
  };

  const closeCaseOverview = () => {
    setSelectedCaseId(null);
    if (tabId) {
      navigate(`/overview/${tabId}`);
    }
  };

  const openFlow = (caseId: string) => {
    navigate(`/flow/${caseId}`, {
      state: { fromOverview: true },
    });
  };

  const focusImportField = () => {
    document.getElementById("overview-share-link-input")?.focus();
  };

  return (
    <>
      <WorldMapBackground>
        <div className="relative isolate flex h-screen min-h-0 overflow-auto pt-8 text-primary-txt xl:overflow-hidden w-full">
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 gap-4 p-4 grid-cols-[16rem_minmax(0,1fr)] xl:overflow-hidden">
              <OverviewSidebar
                cases={availableCases}
                newestCase={newestCase}
                onRefreshCases={refreshCases}
              />

              <section
                className={`relative min-h-0 overflow-hidden rounded-md border border-subtle bg-canvas/20 backdrop-blur-xs`}
              >
                <div className="relative flex items-center justify-between border-b border-subtle px-5 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt border-b pb-0.5 border-b-accent pr-20">
                    <button
                      type="button"
                      onClick={closeCaseOverview}
                      className="inline-flex min-w-0 items-center uppercase gap-2 text-left text-primary-txt transition-colors "
                    >
                      {selectedCase ? (
                        <div class="hover:text-review-txt flex items-center">
                          <Icon
                            icon="arrow-left"
                            className="h-4 w-4 shrink-0 mr-2"
                          />
                          <span
                            title="Go to your work inventory"
                            className="truncate "
                          >
                            Work Inventory
                          </span>
                        </div>
                      ) : (
                        <>
                          <Icon icon="home" className="h-4 w-4 shrink-0 " />
                          <span className="truncate ">Work Inventory</span>
                        </>
                      )}
                    </button>
                  </p>
                  <InventoryToolbar
                    selectedCase={selectedCase}
                    layoutMode={layoutMode}
                    setLayoutMode={setLayoutMode}
                    caseSortMode={caseSortMode}
                    setCaseSortMode={setCaseSortMode}
                    onCreateCase={() => setShowCreateModal(true)}
                    onOpenFlow={openFlow}
                  />
                </div>
                <div className="relative flex-1  overflow-hidden flex h-full min-h-0 flex-col">
                  {selectedCase ? (
                    <CaseOverviewPanel graph={selectedCase} />
                  ) : (
                    <CasesInventory
                      availableCases={availableCases}
                      filteredCases={filteredCases}
                      layoutMode={layoutMode}
                      isLoading={isLoading}
                      caseSearch={caseSearch}
                      setCaseSearch={setCaseSearch}
                      onCreateCase={() => setShowCreateModal(true)}
                      onImportCase={focusImportField}
                      onOpenCaseOverview={openCaseOverview}
                      onOpenFlow={openFlow}
                    />
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </WorldMapBackground>
      <CreateCaseModal
        isOpen={showCreateModal}
        closeModal={() => setShowCreateModal(false)}
      />
    </>
  );
}
