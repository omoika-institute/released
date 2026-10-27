import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { toast } from "react-toastify";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { Button } from "@/components/buttons/Button";
import { Icon } from "@/components/icons";
import {
  CommunityPluginRepo,
  buildFileTags,
  parseGitHubRepoRef,
} from "@/components/utils";
import PythonEditor from "@/components/editor/PythonEditor";
import JsonEditor from "@/components/editor/JsonEditor";
import CodeMirrorViewer from "@/components/editor/CodeMirrorViewer";
import { dispatchPluginCatalogChanged } from "@/renderer/plugins/catalog";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function confirmCommunityRepoTrust(
  repo: CommunityPluginRepo,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<boolean> {
  return new Promise((resolve) => {
    let isSettled = false;
    let toastId: string | number | undefined;

    const finalize = (accepted: boolean) => {
      if (isSettled) return;
      isSettled = true;
      if (toastId !== undefined) {
        toast.dismiss(toastId);
      }
      resolve(accepted);
    };

    toastId = toast(
      <div className="w-lg space-y-3">
        <div className="space-y-1">
          <p className="flex items-baseline justify-between text-lg font-semibold text-primary-txt">
            {t("marketplace.repo.trustTitle")}
            <a
              href={`#`}
              onClick={(event) => {
                event.preventDefault();
                window.api.openExternal(`https://github.com/${repo.repo}`);
              }}
              title={t("marketplace.repo.openExternal")}
              className="group relative flex pb-1 font-mono text-sm text-primary-txt"
            >
              {repo.repo}{" "}
              <Icon
                icon="external-link"
                className="relative -top-1 h-3.5 w-3.5 group-hover:animate-wiggle-8 group-hover:text-review-border"
              />
            </a>
          </p>
          <p className="text-[0.9rem] leading-5 tracking-wide text-secondary-txt">
            {t("marketplace.repo.trustBody", { repo: repo.repo })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 ">
          <Button
            variant="danger"
            type="button"
            onClick={() => finalize(false)}
            className="mr-auto"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => finalize(true)}
          >
            {t("marketplace.repo.trustAction", { repo: repo.repo })}
          </Button>
        </div>
      </div>,
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        style: {
          backgroundColor: "rgba(0, 2, 22, 0.94)",
          color: "#e2e8f0",
          backdropFilter:
            "var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)",

          width: "32rem",
        },
        toastId: `market-install-trust:${repo.id}`,
        onClose: () => finalize(false),
      },
    );
  });
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const { t } = useTranslation();
  if (!markdown.trim()) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <Icon icon="book-open" className="h-7 w-7 text-muted-txt" />
        <div>
          <p className="text-sm font-medium text-muted-txt">
            {t("marketplace.repo.noReadme")}
          </p>
          <p className="mt-0.5 text-xs text-muted-txt/70">
            {t("marketplace.repo.noReadmeBody")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <MarkdownRenderer
      markdown={markdown}
      className="space-y-1 text-secondary-txt"
    />
  );
}

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

type EditorType = "markdown" | "python" | "json" | "text";

function detectEditorType(filePath: string): EditorType {
  if (/\.(md|markdown)$/i.test(filePath)) return "markdown";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".json")) return "json";
  return "text";
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

interface RepoFile {
  id: string;
  path: string;
  name: string;
  url: string;
  tags: string[];
  source?: "file" | "readme" | "manifest";
}

type FileTreeNode =
  | {
      type: "directory";
      id: string;
      name: string;
      path: string;
      children: FileTreeNode[];
    }
  | {
      type: "file";
      id: string;
      file: RepoFile;
    };

function buildFileTree(files: RepoFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const directories = new Map<
    string,
    Extract<FileTreeNode, { type: "directory" }>
  >();

  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= 1) {
      root.push({ type: "file", id: file.id, file });
      continue;
    }

    let siblings = root;
    let currentPath = "";
    for (const directoryName of parts.slice(0, -1)) {
      currentPath = currentPath
        ? `${currentPath}/${directoryName}`
        : directoryName;
      let directory = directories.get(currentPath);
      if (!directory) {
        directory = {
          type: "directory",
          id: `dir:${currentPath}`,
          name: directoryName,
          path: currentPath,
          children: [],
        };
        directories.set(currentPath, directory);
        siblings.push(directory);
      }
      siblings = directory.children;
    }

    siblings.push({ type: "file", id: file.id, file });
  }

  return root;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type OutletContext = {
  repo: CommunityPluginRepo;
  repos: CommunityPluginRepo[];
  isLoadingRepos: boolean;
  refreshRepos: () => Promise<void>;
  setPanelActions: (actions: ComponentChildren) => void;
  removeLocalPlugin: (pluginId: string) => void;
};

export default function MarketplaceRepo() {
  const { t } = useTranslation();
  // const { repoId } = useParams<{ repoId: string }>();
  const {
    repo,
    isLoadingRepos,
    refreshRepos,
    setPanelActions,
    removeLocalPlugin,
  } = useOutletContext<OutletContext>();

  const [scanResult, setScanResult] = useState<{
    files: string[];
    manifest: any;
    readme: string | null;
    branch: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [previewContent, setPreviewContent] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const tagsContainerRef = useRef<HTMLDivElement | null>(null);

  const isLocal = repo?.id.startsWith("local:") ?? false;
  const localRepoPath = useMemo(
    () => (repo ? formatLocalRepoPath(repo.repo) : ""),
    [repo],
  );

  useEffect(() => {
    if (!repo) return;
    let isMounted = true;
    setIsLoading(true);
    setError("");
    setSearchQuery("");
    setSelectedTags(new Set());
    setSelectedFileId(null);
    setPreviewContent("");
    setPreviewError("");
    setScanResult(null);

    const scan = isLocal
      ? window.api.market.scanLocalDir(repo.repo)
      : window.api.market.scanRepo(repo.repo);

    scan
      .then((result) => {
        if (isMounted) setScanResult(result);
      })
      .catch(() => {
        if (isMounted)
          setError(
            isLocal
              ? t("marketplace.repo.readLocalFailed")
              : t("marketplace.repo.scanFailed"),
          );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [repo?.id, isLocal, t]);

  const repoFiles = useMemo((): RepoFile[] => {
    if (!scanResult || !repo) return [];

    const files: RepoFile[] = [];
    if (scanResult.readme?.trim()) {
      files.push({
        id: `${repo.id}:README.md`,
        path: "README.md",
        name: "README",
        url: isLocal
          ? `${repo.repo}/README.md`
          : `https://github.com/${repo.repo}`,
        tags: ["docs"],
        source: "readme",
      });
    }
    if (scanResult.manifest) {
      files.push({
        id: `${repo.id}:manifest.json`,
        path: "manifest.json",
        name: "manifest",
        url: isLocal
          ? `${repo.repo}/manifest.json`
          : `https://github.com/${repo.repo}`,
        tags: ["manifest", "data"],
        source: "manifest",
      });
    }

    if (isLocal) {
      const localFiles = scanResult.files
        .filter((f) => /\.(py|json|csv|md|markdown|txt)$/i.test(f))
        .filter(
          (f) =>
            !(
              f.toLowerCase() === "readme.md" ||
              (scanResult.manifest && f === "manifest.json")
            ),
        )
        .map((filePath) => {
          const fileName = filePath.split(/[\\/]/).at(-1) || filePath;
          return {
            id: `${repo.id}:${filePath}`,
            path: filePath,
            name: fileName.replace(/\.(py|json|csv|md|markdown|txt)$/i, ""),
            url: `${repo.repo}/${filePath}`,
            source: "file" as const,
            tags: [
              ...buildFileTags(filePath, repo.tags ?? []),
              ...(filePath.endsWith(".py")
                ? []
                : /\.(md|markdown|txt)$/i.test(filePath)
                  ? ["docs"]
                  : ["data"]),
            ],
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      return [...files, ...localFiles];
    }

    const parsed = parseGitHubRepoRef(repo.repo);
    if (!parsed) return [];
    const { owner, repo: repoName } = parsed;
    const { branch } = scanResult;

    const remoteFiles = scanResult.files
      .filter((f) => /\.(py|json|csv|md|markdown|txt)$/i.test(f))
      .filter(
        (f) =>
          !(
            f === "README.md" ||
            (scanResult.manifest && f === "manifest.json")
          ),
      )
      .map((filePath) => {
        const fileName = filePath.split("/").at(-1) || filePath;
        return {
          id: `${repo.id}:${filePath}`,
          path: filePath,
          name: fileName.replace(/\.(py|json|csv|md|markdown|txt)$/i, ""),
          url: `https://github.com/${owner}/${repoName}/blob/${branch}/${filePath}`,
          source: "file" as const,
          tags: [
            ...buildFileTags(filePath, repo.tags ?? []),
            ...(filePath.endsWith(".py")
              ? []
              : /\.(md|markdown|txt)$/i.test(filePath)
                ? ["docs"]
                : ["data"]),
          ],
        };
      })
      .sort((a, b) => {
        // manifest.json always floats to top
        const aIsManifest = a.name === "manifest" && a.path.endsWith(".json");
        const bIsManifest = b.name === "manifest" && b.path.endsWith(".json");
        if (aIsManifest !== bIsManifest) return aIsManifest ? -1 : 1;
        return a.path.localeCompare(b.path);
      });
    return [...files, ...remoteFiles];
  }, [scanResult, repo, isLocal]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const file of repoFiles) for (const tag of file.tags) tags.add(tag);
    return Array.from(tags).sort();
  }, [repoFiles]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const hasTags = selectedTags.size > 0;
    return repoFiles.filter((file) => {
      const matchesSearch =
        !query ||
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query);
      const matchesTag =
        !hasTags || file.tags.some((tag) => selectedTags.has(tag));
      return matchesSearch && matchesTag;
    });
  }, [repoFiles, searchQuery, selectedTags]);

  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  useEffect(() => {
    const nextExpanded = new Set<string>();
    const visit = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type !== "directory") continue;
        nextExpanded.add(node.id);
        visit(node.children);
      }
    };
    visit(fileTree);
    setExpandedDirectoryIds(nextExpanded);
  }, [fileTree]);

  const selectedFile = useMemo(() => {
    return repoFiles.find((file) => file.id === selectedFileId) ?? null;
  }, [repoFiles, selectedFileId]);

  useEffect(() => {
    if (!repoFiles.length) {
      setSelectedFileId(null);
      return;
    }
    if (
      selectedFileId &&
      repoFiles.some((file) => file.id === selectedFileId)
    ) {
      return;
    }

    const defaultFile =
      repoFiles.find((file) => file.source === "readme") ??
      repoFiles.find((file) => file.source === "manifest") ??
      repoFiles.find((file) => file.path.endsWith(".py")) ??
      repoFiles[0];
    setSelectedFileId(defaultFile.id);
  }, [repoFiles, selectedFileId]);

  useEffect(() => {
    if (!repo || !scanResult || !selectedFile) {
      setPreviewContent("");
      setPreviewError("");
      setIsLoadingPreview(false);
      return;
    }

    if (selectedFile.source === "readme") {
      setPreviewContent(scanResult.readme ?? "");
      setPreviewError("");
      setIsLoadingPreview(false);
      return;
    }

    if (selectedFile.source === "manifest") {
      setPreviewContent(JSON.stringify(scanResult.manifest ?? {}, null, 2));
      setPreviewError("");
      setIsLoadingPreview(false);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);
    setPreviewError("");

    const request = isLocal
      ? window.api.market.readLocalFile({
          dirPath: repo.repo,
          filePath: selectedFile.path,
        })
      : window.api.market.fetchRepoFile({
          repoUrl: repo.repo,
          filePath: selectedFile.path,
          branch: scanResult.branch,
        });

    request
      .then((text) => {
        if (isMounted) setPreviewContent(text);
      })
      .catch(() => {
        if (isMounted) {
          setPreviewContent("");
          setPreviewError(t("marketplace.repo.loadFileFailed"));
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isLocal, repo, scanResult, selectedFile, t]);

  const onTagWheel = (event: any) => {
    const el = tagsContainerRef.current;
    if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    el.scrollLeft += event.deltaY;
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.size === 1 && prev.has(tag) ? new Set() : new Set([tag]),
    );
  };

  const toggleDirectory = (directoryId: string) => {
    setExpandedDirectoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(directoryId)) {
        next.delete(directoryId);
      } else {
        next.add(directoryId);
      }
      return next;
    });
  };

  const renderFileTree = (nodes: FileTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.type === "directory") {
        const isExpanded = expandedDirectoryIds.has(node.id);
        return (
          <div key={node.id} className="min-w-0">
            <button
              type="button"
              onClick={() => toggleDirectory(node.id)}
              className="group flex w-full min-w-0 items-center gap-1.5 rounded-sm border border-transparent py-1.5 pr-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-secondary-txt transition-colors hover:border-review-border/20 hover:bg-panel/30 hover:text-primary-txt"
              style={{
                paddingLeft: `${Math.min(depth, 4) * 0.75 + 0.25}rem`,
              }}
            >
              <Icon
                icon="chevron-down"
                className={`h-3.5 w-3.5 shrink-0 text-muted-txt transition-transform ${
                  isExpanded ? "rotate-0" : "-rotate-90"
                }`}
              />
              <Icon
                icon={isExpanded ? "folder-open" : "folder"}
                className="h-3.5 w-3.5 shrink-0 text-review-border/80"
              />
              <span className="min-w-0 truncate">{node.name}</span>
              <span className="ml-auto shrink-0 text-[9px] text-muted-txt">
                {node.children.length}
              </span>
            </button>
            {isExpanded && (
              <div className="min-w-0">
                {renderFileTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const isActive = selectedFile?.id === node.file.id;
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => setSelectedFileId(node.file.id)}
          className={`group flex w-full min-w-0 items-start gap-1.5 rounded-sm border py-1.5 pr-2 text-left transition-colors ${
            isActive
              ? "border-review-border/45 bg-review-border/10 text-primary-txt"
              : "border-transparent text-secondary-txt hover:border-review-border/20 hover:bg-panel/35 hover:text-primary-txt"
          }`}
          style={{ paddingLeft: `${Math.min(depth, 4) * 0.75 + 0.75}rem` }}
        >
          <Icon
            icon={node.file.path.endsWith(".py") ? "file-code" : "file"}
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
              isActive ? "text-review-border" : "text-muted-txt"
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-xs font-semibold leading-tight tracking-tight">
              {node.file.name}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-txt">
              {node.file.path}
            </span>
          </span>
        </button>
      );
    });
  };

  const renderPreview = () => {
    if (isLoading || isLoadingPreview) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="font-display text-xs uppercase tracking-[0.28em] text-muted-txt">
            {isLoading
              ? isLocal
                ? t("marketplace.repo.scanningLocal")
                : t("marketplace.repo.scanningRemote")
              : t("marketplace.repo.loadingFile")}
          </p>
        </div>
      );
    }

    if (previewError) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-txt">{previewError}</p>
        </div>
      );
    }

    if (!selectedFile) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-txt">
            {scanResult
              ? t("marketplace.repo.emptyFiltered")
              : t("marketplace.repo.emptyUnselected")}
          </p>
        </div>
      );
    }

    const editorType = detectEditorType(selectedFile.path);
    if (editorType === "markdown") {
      return (
        <div className="h-full overflow-y-auto px-8 py-6 lg:px-14 xl:px-20">
          <MarkdownPreview markdown={previewContent} />
        </div>
      );
    }

    if (editorType === "python") {
      return (
        <PythonEditor
          value={previewContent}
          onChange={() => {}}
          className="h-full overflow-auto"
        />
      );
    }

    if (editorType === "json") {
      return (
        <JsonEditor
          value={previewContent}
          onChange={() => {}}
          className="h-full overflow-auto"
        />
      );
    }

    return (
      <CodeMirrorViewer
        value={previewContent}
        className="h-full overflow-auto"
        language="text"
        showLineNumbers
      />
    );
  };

  const handleInstall = async () => {
    if (!repo || repo.installed || isInstalling) return;

    const isTrusted = await confirmCommunityRepoTrust(repo, t);
    if (!isTrusted) return;

    setIsInstalling(true);
    const installToastId = toast.loading(
      t("marketplace.repo.installing", { name: repo.name }),
      {
        closeOnClick: false,
      },
    );

    try {
      const result = await window.api.market.installCommunityPlugin(repo.repo);
      dispatchPluginCatalogChanged({
        reason: "community-install",
        repo: repo.repo,
      });
      await refreshRepos();
      toast.update(installToastId, {
        render: result.alreadyInstalled
          ? t("marketplace.repo.alreadyInstalled", { name: repo.name })
          : t("marketplace.repo.installedTo", {
              name: repo.name,
              path: result.installPath,
            }),
        type: "success",
        isLoading: false,
        autoClose: 4500,
        closeButton: true,
      });
    } catch (installError) {
      toast.update(installToastId, {
        render: t("marketplace.repo.installFailed", {
          name: repo.name,
          message: toErrorMessage(installError),
        }),
        type: "error",
        isLoading: false,
        autoClose: 7000,
        closeButton: true,
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!repo || !repo.installed || isUninstalling) return;

    setIsUninstalling(true);
    const uninstallToastId = toast.loading(
      t("marketplace.repo.uninstalling", { name: repo.name }),
      {
        closeOnClick: false,
      },
    );

    try {
      const result = await window.api.market.uninstallCommunityPlugin(
        repo.repo,
      );
      dispatchPluginCatalogChanged({
        reason: "community-uninstall",
        repo: repo.repo,
      });
      await refreshRepos();
      toast.update(uninstallToastId, {
        render: result.removed
          ? t("marketplace.repo.uninstalledFrom", {
              name: repo.name,
              path: result.installPath,
            })
          : t("marketplace.repo.notInstalled", { name: repo.name }),
        type: "success",
        isLoading: false,
        autoClose: 4500,
        closeButton: true,
      });
    } catch (uninstallError) {
      toast.update(uninstallToastId, {
        render: t("marketplace.repo.uninstallFailed", {
          name: repo.name,
          message: toErrorMessage(uninstallError),
        }),
        type: "error",
        isLoading: false,
        autoClose: 7000,
        closeButton: true,
      });
    } finally {
      setIsUninstalling(false);
    }
  };

  useEffect(() => {
    if (isLoadingRepos || !repo) {
      setPanelActions(null);
      return () => setPanelActions(null);
    }

    setPanelActions(
      <>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {isLocal ? (
              <div className="inline-flex h-9 min-w-0 max-w-[28rem] items-center gap-2 rounded-sm border border-subtle bg-paper px-2 font-mono text-[10px] uppercase tracking-wider text-secondary-txt">
                <Icon icon="folder" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate" title={repo.repo}>
                  {localRepoPath}
                </span>
                <span className="rounded-sm border border-subtle bg-black/20 px-1 py-px text-[9px] text-muted-txt">
                  local
                </span>
              </div>
            ) : (
              <button
                type="button"
                title={t("marketplace.repo.openExternal")}
                onClick={() =>
                  window.api.openExternal(`https://github.com/${repo.repo}`)
                }
                className="group relative inline-flex h-9 min-w-0 max-w-[28rem] items-center gap-2 rounded-sm border border-subtle bg-paper px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-txt transition-colors hover:border-review-border/25 hover:bg-panel hover:text-review-border active:outline-none"
              >
                <span className="min-w-0 truncate">{repo.repo}</span>
                <Icon
                  icon="external-link"
                  className="relative bottom-px h-4 w-4 shrink-0 group-hover:text-review-border"
                />
              </button>
            )}

            <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-sm border border-subtle/50 bg-black/30 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <Icon icon="search" className="h-4 w-4 shrink-0 text-muted-txt" />
              <input
                type="search"
                placeholder={t("marketplace.repo.searchFiles")}
                value={searchQuery}
                onInput={(e) =>
                  setSearchQuery((e.target as HTMLInputElement).value)
                }
                className="min-w-0 flex-1 bg-transparent font-mono text-xs text-primary-txt outline-none placeholder:text-muted-txt"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-muted-txt transition-colors hover:text-primary-txt"
                  title="Clear file search"
                >
                  <Icon icon="x" className="h-4 w-4" />
                </button>
              )}
            </div>

            {isLocal ? (
              <Button
                variant="ghost"
                onClick={() => removeLocalPlugin(repo.id)}
                title="Remove local plugin"
                className="h-9 shrink-0 border-danger-400/35 bg-danger-500/8 text-danger-300 hover:border-danger-300/55 hover:bg-danger-500/14 hover:text-danger-200"
              >
                <Icon icon="trash" className="h-4 w-4" />
                Remove local
              </Button>
            ) : repo.installed ? (
              <Button
                variant="ghost"
                onClick={handleUninstall}
                disabled={isUninstalling}
                title={t("marketplace.repo.uninstallTitle", {
                  name: repo.name,
                })}
                className="h-9 shrink-0 border-danger-400/35 bg-danger-500/8 text-danger-300 hover:border-danger-300/55 hover:bg-danger-500/14 hover:text-danger-200"
              >
                <Icon icon="trash" className="h-4 w-4" />
                {isUninstalling
                  ? t("marketplace.repo.uninstalling", { name: repo.name })
                  : t("marketplace.repo.uninstallAction")}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleInstall}
                disabled={isInstalling}
                title={t("marketplace.repo.installTitle", {
                  name: repo.name,
                })}
                className="h-9 shrink-0"
              >
                <Icon icon="download" className="h-4 w-4" />
                {isInstalling
                  ? t("marketplace.repo.installing", { name: repo.name })
                  : t("marketplace.repo.installAction")}
              </Button>
            )}
          </div>

          {availableTags.length > 0 && (
            <div
              ref={tagsContainerRef}
              onWheel={onTagWheel}
              className="flex h-7 min-w-0 max-w-full items-center gap-2 overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => setSelectedTags(new Set())}
                className={`h-6 rounded-sm border px-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${selectedTags.size === 0 ? "border-review-border/50 bg-review-border/10 text-review-border" : "border-subtle bg-paper text-muted-txt hover:border-review-border/25 hover:text-primary-txt"}`}
              >
                {t("common.all")}
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`h-6 whitespace-nowrap rounded-sm border px-2 font-mono text-[10px] uppercase tracking-wide transition-colors ${selectedTags.has(tag) ? "border-review-border/50 bg-review-border/10 text-review-border" : "border-subtle bg-paper text-muted-txt hover:border-review-border/25 hover:text-primary-txt"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </>,
    );

    return () => setPanelActions(null);
  }, [
    availableTags,
    isInstalling,
    isLocal,
    isLoadingRepos,
    isUninstalling,
    localRepoPath,
    removeLocalPlugin,
    repo,
    searchQuery,
    selectedTags,
    setPanelActions,
    t,
  ]);

  if (isLoadingRepos) {
    return (
      <section className="flex h-full flex-1 min-w-0 items-center justify-center">
        <p className="font-display text-xs uppercase tracking-[0.28em] text-muted-txt">
          {t("marketplace.repo.loadingRegistry")}
        </p>
      </section>
    );
  }

  if (!repo) {
    return (
      <section className="flex h-full flex-1 min-w-0 items-center justify-center">
        <p className="font-display text-xs uppercase tracking-[0.28em] text-muted-txt">
          {t("marketplace.repo.selectRepo")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-subtle/75 bg-canvas/15">
        <div className="border-b border-subtle px-4 py-3">
          <span className="font-display tabular-nums text-[10px] uppercase tracking-[0.28em] text-muted-txt">
            {t("marketplace.repo.filesCount", {
              filtered:
                scanResult && filteredFiles?.length ? filteredFiles.length : 0,
              total: scanResult && repoFiles?.length ? repoFiles.length : 0,
            })}
          </span>
          {error && <p className="mt-2 text-xs text-muted-txt">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {filteredFiles.length === 0 && !isLoading ? (
            <div className="rounded-sm border border-dashed border-subtle/50 bg-canvas p-4 text-sm text-muted-txt">
              {scanResult
                ? t("marketplace.repo.emptyFiltered")
                : t("marketplace.repo.emptyUnselected")}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {renderFileTree(fileTree)}
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden bg-black/10">
            {renderPreview()}
          </div>
        </div>
      </main>
    </section>
  );
}
