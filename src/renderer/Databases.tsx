import { type ButtonHTMLAttributes, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Icon } from "@/components/icons";
import { AltDropdown } from "@/components/inputs/Dropdown";
import ConfirmDelete from "@/components/modals/ConfirmDelete";
import { Callout } from "@/components/Callout";
import { clearStoredOpenTabs } from "@/lib/appTabs";
import {
  useCasesStore,
  useEntitiesStore,
  useEntityStore,
  useFlowStore,
  useGraphStore,
} from "@/stores";
import type { DatabaseMetadata } from "@/types/database";

interface DatabaseActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  icon: string;
  tone?: "primary" | "neutral" | "danger";
}

function DatabaseActionButton({
  children,
  icon,
  tone = "neutral",
  className = "",
  ...props
}: DatabaseActionButtonProps) {
  const toneClass =
    tone === "primary"
      ? "border-auto-border/50 bg-canvas text-primary-txt hover:bg-panel/75"
      : tone === "danger"
        ? "border-danger/25 bg-danger/8 text-danger hover:bg-danger/12"
        : "border-subtle bg-paper text-secondary-txt hover:border-review-border/35 hover:bg-black/15 hover:text-primary-txt";

  return (
    <button
      {...props}
      className={[
        "group relative inline-flex h-9 min-w-0 items-center justify-center gap-2 overflow-hidden border px-3 font-display text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-subtle disabled:cursor-not-allowed disabled:border-subtle/50 disabled:bg-panel/50 disabled:text-terminal-txt",
        toneClass,
        className,
      ].join(" ")}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-current/25 group-hover:bg-review-border/25" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-px w-6 bg-current/35 group-hover:bg-review-border/35" />
      <Icon
        icon={icon}
        className={`h-4 w-4 shrink-0 disabled:transition-none ${tone !== "danger" ? "group-hover:translate-x-0 -translate-x-px group-hover:animate-slow-pulse transition-transform duration-300" : "group-hover:animate-wiggle"}`}
      />
      <span className="truncate group-hover:animate-shine">{children}</span>
    </button>
  );
}

function clearDatabaseBackedStores() {
  useCasesStore.setState({
    graphs: [],
    favorites: [],
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
  });
  useGraphStore.setState({
    graph: null,
    vertices_count: null,
    edges_count: null,
    degree2_count: null,
    isLoading: false,
    isError: false,
    error: null,
  });
  useEntityStore.setState({
    entity: null,
    isLoading: false,
    error: null,
  });
  useEntitiesStore.setState({
    entities: [],
    favorites: [],
    currentEntity: null,
    transforms: {},
    isLoading: false,
    isLoadingEntity: false,
    isLoadingTransforms: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
    entityError: null,
  });
  useFlowStore.getState().clearGraph();
}

export default function Databases() {
  const { t } = useTranslation();
  const [databases, setDatabases] = useState<DatabaseMetadata[]>([]);
  const [searchParams] = useSearchParams();
  const recentlyCreatedId = searchParams.get("id");
  const [selectedId, setSelectedId] = useState(recentlyCreatedId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    window.api.database
      .list()
      .then((list) => setDatabases(list))
      .catch((err: Error) => setError(err.message));
  }, []);

  const handleDatabaseChange = (value: string) => {
    const match = databases.find((db) => db.id === value);
    setSelectedId(match?.id ?? "");
    setError("");
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!selected) return;

    const openResult = await window.api.database.open(selected.id);
    if (openResult.success) {
      clearStoredOpenTabs();
      clearDatabaseBackedStores();
      navigate("/overview");
    } else {
      setError(openResult.error || t("databases.openFailed"));
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      const result = await window.api.database.import();
      if (result.canceled) return;
      if (!result.success || !result.database) {
        setError(result.error || t("databases.importFailed"));
        return;
      }

      const list = await window.api.database.list();
      setDatabases(list);
      setSelectedId(result.database.id);
      toast.success(
        t("databases.importSuccess", { name: result.database.name }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    if (!selected) return;

    setIsExporting(true);
    setError(null);
    try {
      const result = await window.api.database.export(selected.id);
      if (result.canceled) return;
      if (!result.success) {
        setError(result.error || t("databases.exportFailed"));
        return;
      }

      toast.success(t("databases.exportSuccess", { name: selected.name }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleConfirmDelete = async () => {
    if (!selected) return;
    try {
      await window.api.database.delete(selected);
      toast.info(t("databases.deleted", { name: selected?.name }));
      const list = await window.api.database.list();
      setDatabases(list);
      setSelectedId("");
      handleDatabaseChange("");
      setShowDeleteModal(false);
    } catch (err: any) {
      console.error(err);
      toast.error(
        t("databases.deleteError", {
          message: err.error || err.message || err,
        }),
      );
    }
  };

  const selected = databases.find((db) => db.id === selectedId);
  const dbComboOptions = [
    {
      value: "",
      label:
        databases.length > 0
          ? t("databases.comboPlaceholder")
          : t("databases.comboEmpty"),
    },
    ...databases.map((db) => ({
      ...db,
      value: db.id,
      label: db.name,
    })),
  ];

  return (
    <>
      <section className="relative w-full max-w-180">
        <div className="relative overflow-hidden rounded-md border border-subtle/75 shadow-hairline shadow-2xl backdrop-blur-md text-text-primary">
          <div className="relative flex h-8 items-stretch border-b border-subtle/75">
            <div className="group relative flex max-w-56 flex-1 items-stretch overflow-hidden border-r border-kard bg-kard/10 text-text-primary">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-kard" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-current/20" />
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[10px] uppercase tracking-[0.24em]">
                <Icon
                  icon="folder"
                  className="h-3.5 w-3.5 shrink-0 text-review-txt"
                />
                <span className="truncate">{t("databases.workspace")}</span>
              </div>
            </div>
            {/* Import button */}
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImport}
              className="group relative flex max-w-56 flex-1 items-stretch overflow-hidden border-r hover:border-kard/50 border-kard/25 text-text-primary transition-colors duration-150"
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-kard/25 group-hover:bg-kard/50 transition-colors duration-150" />
              <span className="pointer-events-none absolute bottom-0 right-0 h-px w-7 bg-kard/50 group-hover:bg-kard/75 transition-colors duration-150" />
              <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[10px] uppercase tracking-[0.24em] text-accent group-hover:text-primary-txt transition-all duration-150">
                <Icon
                  icon="database-import"
                  className="h-3.5 w-3.5 shrink-0 text-accent group-hover:text-review-txt transition-all duration-150 group-hover:animate-wiggle"
                />
                <span className="truncate">
                  {isImporting
                    ? t("databases.importing")
                    : t("databases.import")}
                  ...
                </span>
              </div>
            </button>
            <div className="min-w-8 flex-1 border-r border-dashed border-kard" />
            <NavLink
              to="/create"
              className="relative inline-flex w-10 shrink-0 items-center justify-center border-l border-dashed border-subtle bg-canvas text-ink-hard/60 transition-colors duration-150 hover:bg-subtle/8 hover:text-body-txt focus-visible:outline-none focus-visible:ring-1 group"
              aria-label={t("databases.createHere")}
              title={t("databases.createHere")}
            >
              <Icon icon="plus" className="h-3.5 w-3.5 group-hover:scale-115" />
            </NavLink>
          </div>

          <div className="relative p-5">
            <section className="border border-subtle/25 bg-canvas p-5">
              <div className="flex gap-4 flex-row items-start justify-between">
                <section className="w-full">
                  <div className="font-display flex items-end justify-between text-xl uppercase tracking-wide text-primary-txt">
                    <h1>{t("databases.selectTitle")}</h1>
                    <p className="flex shrink-0 items-center gap-2 border border-subtle/50 rounded-xs px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-terminal-txt">
                      {/* TODO i18n */}
                      Total spaces {databases.length}
                    </p>
                  </div>
                  <p className="leading-6 text-muted-txt max-w-md">
                    {t("databases.selectBody")}
                  </p>
                </section>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-txt group-hover:text-inherit transition-colors duration-300 ease-in">
                  {t("databases.comboLabel")}
                </span>
                <label className="block ">
                  <div className="relative rounded-xs mt-1 h-10 border border-subtle/50">
                    <AltDropdown
                      value={selectedId}
                      options={dbComboOptions}
                      label={t("databases.comboLabel")}
                      title={t("databases.comboLabel")}
                      disabled={databases.length === 0}
                      onValueChange={handleDatabaseChange}
                    />
                  </div>
                </label>

                <p className="min-h-5 select-none text-xs text-muted-txt">
                  {!selected && !error
                    ? t("databases.selectHint")
                    : selected
                      ? t("databases.selectedHint", { name: selected.name })
                      : null}
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <DatabaseActionButton
                    type="submit"
                    icon="login-2"
                    disabled={!selected}
                  >
                    {t("databases.open")}
                  </DatabaseActionButton>

                  <DatabaseActionButton
                    type="button"
                    icon="trash"
                    tone="danger"
                    disabled={!selected}
                    onClick={() => setShowDeleteModal(true)}
                  >
                    {t("databases.delete")}
                  </DatabaseActionButton>

                  <DatabaseActionButton
                    type="button"
                    icon="database-export"
                    disabled={!selected || isExporting}
                    onClick={handleExport}
                  >
                    {isExporting
                      ? t("databases.exporting")
                      : t("databases.export")}
                  </DatabaseActionButton>
                </div>
              </form>

              <div className="mt-5 border-t border-subtle pt-4">
                <p className="text-sm leading-5 text-muted-txt">
                  {t("databases.noDatabaseYet")}{" "}
                  <NavLink
                    to="/create"
                    className="inline-flex items-center gap-1 text-muted-txt  transition-colors hover:text-primary-txt group"
                  >
                    {t("databases.createHere")}...
                    <Icon
                      icon="arrow-right"
                      className="h-3 w-3 group-hover:translate-0 -translate-x-3 transition-all duration-150 group-hover:opacity-100 opacity-0"
                    />
                  </NavLink>
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {error && (
        <div className="fixed bottom-4 left-4 max-w-sm">
          <Callout title={t("databases.openErrorTitle")} type="warning">
            {error}
          </Callout>
        </div>
      )}

      <ConfirmDelete
        isOpen={showDeleteModal}
        closeModal={() => setShowDeleteModal(false)}
        itemName={selected?.name ?? ""}
        itemType="space"
        onConfirmDelete={handleConfirmDelete}
      />
    </>
  );
}
