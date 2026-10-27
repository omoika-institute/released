import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useTranslation } from "react-i18next";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Logo from "@/assets/images/wordmark.svg?react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/buttons/Button";
import OverlayModal from "@/components/modals/OverlayModal";
import { CommunityPluginRepo, loadCommunityPlugins } from "@/components/utils";
import WorldMapBackground from "@/components/WorldMapBackground";
import { Grid, Hatch } from "@/components/Geometry";
import { dispatchPluginCatalogChanged } from "@/renderer/plugins/catalog";

// Local plugin persistence
const LOCAL_PLUGINS_KEY = "omoika:local-plugins";

interface LocalPlugin {
  id: string;
  name: string;
  description: string;
  filepath: string;
}

interface RegistryItem {
  id: string;
  label: string;
  description: string;
  repo: string;
  isLocal: boolean;
}

function readLocalPlugins(): LocalPlugin[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLUGINS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.filepath === "string",
    );
  } catch {
    return [];
  }
}

function saveLocalPlugins(plugins: LocalPlugin[]) {
  localStorage.setItem(LOCAL_PLUGINS_KEY, JSON.stringify(plugins));
}

function toLocalRepo(plugin: LocalPlugin): CommunityPluginRepo {
  return {
    id: plugin.id,
    name: plugin.name,
    author: "local",
    description: plugin.description,
    repo: plugin.filepath,
    installed: true,
  };
}

function formatLocalRepoPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const unixHome = normalized.match(/\/home\/[^/]+(\/.*)?$/i);
  if (unixHome) return `~${unixHome[1] ?? ""}`;

  const macHome = normalized.match(/\/Users\/[^/]+(\/.*)?$/i);
  if (macHome) return `~${macHome[1] ?? ""}`;

  const windowsHome = normalized.match(/[A-Za-z]:\/Users\/[^/]+(\/.*)?$/i);
  if (windowsHome) return `~${windowsHome[1] ?? ""}`;

  return normalized;
}

// Add local plugin modal
interface AddLocalPluginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (plugin: LocalPlugin) => void;
}

function AddLocalPluginModal({
  isOpen,
  onClose,
  onAdd,
}: AddLocalPluginModalProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<any>(null);
  const [filepath, setFilepath] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleBrowse = async () => {
    setError("");
    const result = await window.api.openFolderDialog();
    if (!result?.canceled && result?.filePaths?.[0]) {
      setFilepath(result.filePaths[0]);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = (data.get("name") as string).trim();
    const description = ((data.get("description") as string) ?? "").trim();
    const path = filepath.trim();
    if (!name || !path) return;

    setError("");
    setIsValidating(true);

    try {
      await window.api.market.validateLocalDir(path);
      onAdd({
        id: `local:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        description,
        filepath: path,
      });
      (e.currentTarget as HTMLFormElement).reset();
      setFilepath("");
      onClose();
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : t("marketplace.repo.readLocalFailed"),
      );
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <OverlayModal isOpen={isOpen} closeModal={onClose} cancelRef={cancelRef}>
      <form
        onSubmit={handleSubmit}
        className="relative overflow-hidden rounded-md border border-subtle bg-canvas px-6 py-7 text-primary-txt shadow-[0_32px_120px_rgba(0,0,0,0.8)]"
      >
        <div className="pointer-events-none absolute bottom-5 right-5 h-3 w-12 border-b border-r border-subtle" />
        <div className="pointer-events-none absolute left-5 top-5 h-3 w-10 border-t border-l border-subtle" />

        <section className="relative border-b border-ink/10 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt">
            {t("marketplace.registry")}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-display text-xl text-primary-txt">
              {t("marketplace.addLocal.title")}
            </h1>
            <Icon icon="folder" className="h-5 w-5 text-review-border" />
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-secondary-txt">
            {t("marketplace.addLocal.body")}
          </p>
        </section>

        <div className="relative mt-5 grid w-full grid-cols-1 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] uppercase tracking-[0.28em] text-muted-txt">
              {t("marketplace.addLocal.name")}
            </span>
            <input
              name="name"
              placeholder={t("marketplace.addLocal.namePlaceholder")}
              required
              className="w-full rounded-sm border border-subtle/50 bg-black/30 px-3 py-2 text-sm text-primary-txt outline-none transition duration-150 placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] uppercase tracking-[0.28em] text-muted-txt">
              {t("marketplace.addLocal.description")}
            </span>
            <textarea
              rows={3}
              name="description"
              placeholder={t("marketplace.addLocal.descriptionPlaceholder")}
              className="w-full resize-none rounded-sm border border-subtle/50 bg-black/30 px-3 py-2 text-sm text-primary-txt outline-none transition duration-150 placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] uppercase tracking-[0.28em] text-muted-txt">
              {t("marketplace.addLocal.filePath")}
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={filepath}
                onInput={(e) => {
                  setError("");
                  setFilepath((e.target as HTMLInputElement).value);
                }}
                placeholder={t("marketplace.addLocal.filePathPlaceholder")}
                required
                className="min-w-0 flex-1 rounded-sm border border-subtle/50 bg-black/30 px-3 py-2 text-sm text-primary-txt outline-none transition duration-150 placeholder:text-muted-txt focus:border-review-border/15 focus:bg-black/40"
              />
              <button
                type="button"
                onClick={handleBrowse}
                title={t("marketplace.addLocal.browseFolder")}
                className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-subtle bg-paper px-3 py-2 text-xs text-primary-txt transition-colors hover:border-review-border/25 hover:bg-panel hover:text-review-border"
              >
                <Icon icon="folder-open" className="h-4 w-4" />
                {t("common.browse")}
              </button>
            </div>
            {error && (
              <p className="text-xs leading-5 text-danger-400">{error}</p>
            )}
          </label>
        </div>

        <div className="relative mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} type="button">
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={isValidating}>
            <Icon icon="plus" className="h-4 w-4" />
            {isValidating
              ? t("common.loading")
              : t("marketplace.addLocal.addPlugin")}
          </Button>
        </div>
      </form>
    </OverlayModal>
  );
}

function RegistrySection({
  label,
  show,
  setShow,
  isLoading,
  items,
  onRemoveLocal,
}: {
  label: string;
  show: boolean;
  setShow: () => void;
  isLoading: boolean;
  items: RegistryItem[];
  onRemoveLocal?: (id: string) => void;
}) {
  return (
    <section className="group/section ">
      <button
        type="button"
        onClick={setShow}
        className="flex w-full items-center border-b border-subtle px-1 py-2 text-left transition-colors hover:border-review-border/25"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary-txt">
          {label}
        </span>
        <Icon
          icon="chevron-down"
          className={`ml-auto h-4 w-4 text-muted-txt transition-transform ${show ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`overflow-hidden px-1.5 transition-all duration-200 ${show ? "max-h-[36rem] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="space-y-1.5 py-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-sm border border-dashed border-subtle/10 bg-canvas p-2.5"
              >
                <div className="h-3 w-24 animate-pulse rounded bg-panel/10" />
                <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-panel/12" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-panel/10" />
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="rounded-sm border border-dashed border-subtle/50 bg-canvas px-2.5 py-4 text-center text-xs text-secondary-txt">
              No plugins match the active filters.
            </div>
          ) : (
            items.map((item) => (
              <NavLink
                key={item.id}
                to={`/marketplace/${encodeURIComponent(item.id)}`}
                className={({ isActive }) =>
                  `group/item block rounded-sm border border-dashed bg-canvas/20 p-2.5 transition duration-150 hover:-translate-y-0.5 hover:border-review-border/25 hover:bg-panel/50 ${
                    isActive
                      ? "border-review-border/35 shadow-[inset_2px_0_0_var(--color-review-border)]"
                      : "border-subtle/25"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <h3 className="flex truncate text-sm font-medium uppercase tracking-normal text-primary-txt">
                      {item.label}{" "}
                      {item.isLocal && onRemoveLocal ? (
                        <span
                          role="button"
                          tabIndex={0}
                          title="Remove local plugin"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onRemoveLocal(item.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            onRemoveLocal(item.id);
                          }}
                          className={`ml-auto inline-flex h-5 w-5 items-center justify-center rounded-sm border border-transparent transition-colors hover:border-danger-400/45 hover:bg-danger-500/10 hover:text-danger-300 ${isActive ? "text-review-border" : "text-muted-txt"}`}
                        >
                          <Icon icon="trash" className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <Icon
                          icon="git-fork"
                          className={`ml-auto h-3.5 w-3.5 ${isActive ? "text-review-border" : "text-muted-txt"}`}
                        />
                      )}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-secondary-txt">
                      {item.description}
                    </p>
                    <p
                      className="mt-1 truncate font-mono text-[10px] text-muted-txt"
                      title={item.repo}
                    >
                      {formatLocalRepoPath(item.repo)}
                    </p>
                  </>
                )}
              </NavLink>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

// Marketplace layout
export default function Marketplace() {
  const { t } = useTranslation();
  const { repoId } = useParams<{ repoId: string }>();
  const [repos, setRepos] = useState<CommunityPluginRepo[]>([]);
  const [localPlugins, setLocalPlugins] =
    useState<LocalPlugin[]>(readLocalPlugins);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [showInstalled, setShowInstalled] = useState(true);
  const [showCommunity, setShowCommunity] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [panelActions, setPanelActions] = useState<ComponentChildren>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Merge API repos with local plugins
  const allRepos = useMemo(
    () => [...repos, ...localPlugins.map(toLocalRepo)],
    [repos, localPlugins],
  );

  const repo = useMemo(
    () => allRepos.find((r) => r.id === repoId) ?? null,
    [allRepos, repoId],
  );

  const refreshRepos = useCallback(async () => {
    setIsLoadingRepos(true);
    try {
      const nextRepos = await loadCommunityPlugins();
      setRepos(nextRepos);
      if (nextRepos.length > 0 && location.pathname === "/marketplace") {
        const preferredRepo = nextRepos.find((repo) => !repo.installed);
        navigate(
          `/marketplace/${encodeURIComponent((preferredRepo ?? nextRepos[0]).id)}`,
          { replace: true },
        );
      }
    } finally {
      setIsLoadingRepos(false);
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    void refreshRepos();
  }, []);

  const installedRepos = useMemo(
    () => allRepos.filter((repo) => repo.installed),
    [allRepos],
  );

  const communityRepos = useMemo(
    () => allRepos.filter((repo) => !repo.installed),
    [allRepos],
  );

  const installedRepoItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return installedRepos
      .map((repo) => ({
        id: repo.id,
        label: repo.name,
        description: repo.description ?? "",
        repo: repo.repo,
        isLocal: repo.id.startsWith("local:"),
      }))
      .filter(
        (item) =>
          !q ||
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q),
      );
  }, [installedRepos, searchQuery]);

  const communityRepoItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return communityRepos
      .map((repo) => ({
        id: repo.id,
        label: repo.name,
        description: repo.description,
        repo: repo.repo,
        isLocal: repo.id.startsWith("local:"),
      }))
      .filter(
        (item) =>
          !q ||
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q),
      );
  }, [communityRepos, searchQuery]);

  const handleAddLocalPlugin = useCallback((plugin: LocalPlugin) => {
    const updated = [...localPlugins, plugin];
    setLocalPlugins(updated);
    saveLocalPlugins(updated);
    dispatchPluginCatalogChanged({
      reason: "local-add",
      pluginId: plugin.id,
      repo: plugin.filepath,
    });
    navigate(`/marketplace/${encodeURIComponent(plugin.id)}`);
  }, [localPlugins, navigate]);

  const handleRemoveLocalPlugin = useCallback((pluginId: string) => {
    const updated = localPlugins.filter((plugin) => plugin.id !== pluginId);
    setLocalPlugins(updated);
    saveLocalPlugins(updated);
    dispatchPluginCatalogChanged({
      reason: "local-remove",
      pluginId,
    });

    if (repoId !== pluginId) return;

    const nextRepo =
      repos.find((candidate) => candidate.installed) ??
      repos.find((candidate) => !candidate.installed) ??
      updated[0];

    if (nextRepo) {
      navigate(`/marketplace/${encodeURIComponent(nextRepo.id)}`, {
        replace: true,
      });
    } else {
      navigate("/marketplace", { replace: true });
    }
  }, [localPlugins, navigate, repoId, repos]);

  return (
    <WorldMapBackground>
      <div className="relative isolate flex h-screen min-h-0 w-full overflow-auto pt-8 text-primary-txt xl:overflow-hidden">
        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible xl:overflow-hidden">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[17rem_minmax(0,1fr)] xl:overflow-hidden">
            <aside className="relative min-h-0 overflow-hidden rounded-sm  rounded-tr-none border border-subtle/75">
              <div className="relative flex h-full min-h-0 flex-col">
                <div className="relative flex h-9 min-w-0 items-center gap-2 rounded-sm border border-subtle/50 bg-black/30 px-2.5">
                  <Icon
                    icon="search"
                    className="h-4 w-4 shrink-0 text-muted-txt"
                  />
                  <input
                    type="search"
                    placeholder={t("marketplace.searchPlaceholder")}
                    value={searchQuery}
                    onInput={(e) =>
                      setSearchQuery((e.target as HTMLInputElement).value)
                    }
                    className="min-w-0 flex-1 rounded-tr-none bg-transparent text-xs text-primary-txt outline-none placeholder:text-muted-txt"
                  />
                  {searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-muted-txt transition-colors hover:text-primary-txt"
                      title="Clear plugin search"
                    >
                      <Icon icon="x" className="h-4 w-4" />
                    </button>
                  )}
                </div>{" "}
                {/* </div> */}
                <div className="min-h-0 flex-1 overflow-y-auto py-3  backdrop-blur-xs">
                  <RegistrySection
                    label={t("marketplace.installed", {
                      count: installedRepos.length,
                    })}
                    show={showInstalled}
                    setShow={() => setShowInstalled(!showInstalled)}
                    isLoading={isLoadingRepos}
                    items={installedRepoItems}
                    onRemoveLocal={handleRemoveLocalPlugin}
                  />
                  <RegistrySection
                    label={t("marketplace.community", {
                      count: communityRepos.length,
                    })}
                    show={showCommunity}
                    setShow={() => setShowCommunity(!showCommunity)}
                    isLoading={isLoadingRepos}
                    items={communityRepoItems}
                  />
                </div>
                <div className="mt-auto space-y-3 border-t border-subtle px-3 py-4">
                  <Button
                    variant="panel"
                    className="w-full justify-center px-3"
                    title={t("marketplace.addLocalPluginsTitle")}
                    onClick={() => setShowAddModal(true)}
                  >
                    <Icon icon="folder-plus" className="h-4 w-4" />
                    {t("marketplace.addLocalPlugins")}
                  </Button>
                </div>
              </div>
            </aside>

            <section className="h-full min-h-0 overflow-hidden">
              <div className="relative flex h-full flex-col overflow-hidden rounded-tr-md border border-subtle bg-canvas/20 backdrop-blur-xs">
                <header className="relative z-10 flex min-h-20 shrink-0 items-stretch border-b border-subtle bg-panel/35">
                  <div className="relative flex w-80 shrink-0 flex-col justify-center items-start border-r border-subtle bg-panel/45 px-5">
                    <div className="absolute right-2 top-1 h-16 w-px bg-accent" />
                    <div className="absolute bottom-2 left-4 z-10 h-px w-40 bg-accent" />
                    <Logo class="mb-2 h-6 w-auto fill-primary-txt" />
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-review-txt">
                      {repo?.name ?? t("marketplace.registry")}
                    </p>
                    <Hatch />
                    <Grid />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                    {panelActions}
                  </div>
                </header>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <Outlet
                    context={{
                      repo,
                      repos: allRepos,
                      isLoadingRepos,
                      refreshRepos,
                      setPanelActions,
                      removeLocalPlugin: handleRemoveLocalPlugin,
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <AddLocalPluginModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddLocalPlugin}
      />
    </WorldMapBackground>
  );
}
