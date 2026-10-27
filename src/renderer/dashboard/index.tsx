import { useEffect, useRef, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate } from "react-router-dom";
import Button from "@/components/buttons";
import Input from "@/components/inputs";
import OverlayModal from "@/components/modals/OverlayModal";
import { Icon } from "@/components/icons";
import { toast } from "react-toastify";
import { Graph } from "@/api";
import { useCasesStore } from "@/stores";

export type DashboardContextType = {
  graphs: Graph[];
  favoriteGraphs: string[];
  loadingGraphs: boolean;
  onCreateCase: () => void;
};

export default function DashboardPage() {
  const {
    graphs,
    favorites: favoriteGraphs,
    isLoading: loadingGraphs,
    isCreating: isCreatingGraph,
    fetchCases: fetchGraphs,
    createCase: createGraph,
  } = useCasesStore();

  useEffect(() => {
    fetchGraphs({ skip: 0, limit: 50 });
  }, []);

  const [showCreateGraphModal, setShowCreateGraphModal] = useState(false);
  const cancelCreateGraphRef = useRef<HTMLElement>(null);

  const context: DashboardContextType = {
    graphs,
    favoriteGraphs,
    loadingGraphs,
    onCreateCase: () => setShowCreateGraphModal(true),
  };

  return (
    <>
      <Outlet context={context} />
      <CreateGraphModal
        cancelCreateRef={cancelCreateGraphRef}
        isOpen={showCreateGraphModal}
        closeModal={() => setShowCreateGraphModal(false)}
        refreshAllGraphs={() => fetchGraphs({ skip: 0, limit: 50 })}
        createGraph={createGraph}
        isCreatingGraph={isCreatingGraph}
      />
    </>
  );
}

interface CreateGraphModalProps {
  refreshAllGraphs: () => void;
  closeModal: () => void;
  isOpen: boolean;
  cancelCreateRef: any;
  createGraph: (payload: {
    label: string;
    description: string;
  }) => Promise<any>;
  isCreatingGraph: boolean;
}

export function CreateGraphModal({
  closeModal,
  isOpen,
  cancelCreateRef,
  createGraph,
  isCreatingGraph,
}: CreateGraphModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const onSubmitHandler = (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const showGuide = formData.get("guide") === "on";
    createGraph({
      label: formData.get("label") as string,
      description: (formData.get("description") as string) ?? "",
    })
      .then((graph) => {
        closeModal();
        toast.success(t("dashboard.createCase.success"));
        if (showGuide) {
          navigate(`/graph/${graph.id}`, { state: { showGuide } });
        }
      })
      .catch((error: any) => toast.error(error.message));
  };

  return (
    <OverlayModal
      isOpen={isOpen}
      closeModal={closeModal}
      cancelRef={cancelCreateRef}
    >
      <form
        onSubmit={onSubmitHandler}
        class="from-cod-900/85 to-cod-950/80 border-l-primary flex w-full flex-col overflow-y-scroll border-l-3 bg-linear-to-br px-10 shadow"
      >
        <section class="border-primary mt-6 border-b-2 px-px pb-1 pl-1">
          <div class="flex flex-wrap items-center justify-between">
            <h1 class="font-code text-2xl font-semibold tracking-tight text-slate-400">
              CREATE://CASE
            </h1>
            <Icon
              icon="chart-dots-3"
              className="mt-1 mr-2 h-6 w-6 text-slate-400"
            />
          </div>
        </section>
        <div class="mt-3 grid w-full grid-cols-1 gap-y-2">
          <Input.Field
            name="label"
            label={t("dashboard.createCase.label")}
            placeholder={t("dashboard.createCase.labelPlaceholder")}
            className="w-full"
          />
          <Input.Textarea
            rows={3}
            name="description"
            className="w-full"
            label={t("dashboard.createCase.description")}
            placeholder={t("dashboard.createCase.descriptionPlaceholder")}
          />
          <Input.ToggleSwitch
            className="pt-1 pb-6"
            label={t("dashboard.createCase.enableGuide")}
            name="guide"
            description={t("dashboard.createCase.enableGuideDescription")}
          />
        </div>

        <div class="mb-6 flex justify-end">
          <Button.Ghost
            variant="danger"
            onClick={() => closeModal()}
            type="button"
          >
            {t("common.cancel")}
            <Icon icon="cancel" className="btn-icon text-danger-500!" />
          </Button.Ghost>
          <Button.Solid
            variant="primary"
            type="submit"
            disabled={isCreatingGraph}
            className={`btn-primary ml-4 ${isCreatingGraph ? "opacity-50" : ""}`}
          >
            {isCreatingGraph
              ? t("dashboard.createCase.creating")
              : t("dashboard.createCase.submit")}
            <Icon icon="plus" className="btn-icon" />
          </Button.Solid>
        </div>
      </form>
    </OverlayModal>
  );
}
