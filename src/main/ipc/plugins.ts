import { app, net } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  getAvailablePlugins,
  getEntityBlueprints,
  getEntityTransforms,
  normalizePluginSettingsId,
} from "../app/cli";
import { scanRepo } from "../git/scanRepo";
import { fetchRepoFile } from "../git/fetchRepoFile";
import {
  installCommunityPluginRepo,
  isCommunityPluginInstalled,
  uninstallCommunityPluginRepo,
} from "../git/communityPluginInstall";
import {
  resolveCommunityPluginInstallRoot,
  resolveEffectivePluginsPath,
} from "../app/plugins";
import { toSnakeCase } from "../utils";
import { IpcContext } from "./types";
import { bindHandle } from "./handle";

const normalizeTransformLabel = (label: string): string => {
  const trimmed = label.trim().replace(/\.py$/i, "");
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const COMMUNITY_PLUGIN_REGISTRY_URL =
  "https://raw.githubusercontent.com/omoika-institute/omoika/refs/heads/main/community-plugins.json";

const LOCAL_PLUGIN_MAX_SCAN_ENTRIES = 1200;
const LOCAL_PLUGIN_MAX_FILES = 300;
const LOCAL_PLUGIN_MAX_DEPTH = 8;
const LOCAL_PLUGIN_SUPPORTED_FILE = /\.(py|json|csv|md|markdown|txt)$/i;
const LOCAL_PLUGIN_IGNORED_DIRS = new Set([
  ".cache",
  ".git",
  ".hg",
  ".next",
  ".nuxt",
  ".output",
  ".svn",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "site-packages",
  "target",
  "venv",
]);

const isLocalPluginRoot = (entries: fs.Dirent[]) =>
  entries.some(
    (entry) =>
      (entry.isDirectory() &&
        (entry.name === "entities" || entry.name === "transforms")) ||
      (entry.isFile() && entry.name === "manifest.json"),
  );

const resolveTransformsDir = (pluginsPath?: string) =>
  path.join(resolveEffectivePluginsPath(pluginsPath), "transforms");

const ensureTransformPath = (targetPath: string, transformsDir: string) => {
  const resolved = path.resolve(targetPath);
  const base = `${path.resolve(transformsDir)}${path.sep}`;
  if (!resolved.startsWith(base)) {
    throw new Error(
      "Transform path must be inside the plugins transforms dir.",
    );
  }
  return resolved;
};

type CommunityPluginRegistryItem = {
  id: string;
  name: string;
  author: string;
  description: string;
  repo: string;
  installed?: boolean;
  license?: string;
  tags?: string[];
  min_app_version?: string;
  homepage?: string;
};

const normalizeCommunityPluginRegistryItem = (
  value: unknown,
): CommunityPluginRegistryItem | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;

  const id = String(entry.id ?? "").trim();
  const name = String(entry.name ?? "").trim();
  const author = String(entry.author ?? "").trim();
  const description = String(entry.description ?? "").trim();
  const repo = String(entry.repo ?? "").trim();

  if (!id || !name || !repo) return null;

  const tags = Array.isArray(entry.tags)
    ? entry.tags
        .map((tag) => String(tag ?? "").trim())
        .filter((tag) => tag.length > 0)
    : undefined;

  const normalized: CommunityPluginRegistryItem = {
    id,
    name,
    author,
    description,
    repo,
  };

  if (typeof entry.license === "string" && entry.license.trim()) {
    normalized.license = entry.license.trim();
  }
  if (tags?.length) {
    normalized.tags = tags;
  }
  if (
    typeof entry.min_app_version === "string" &&
    entry.min_app_version.trim()
  ) {
    normalized.min_app_version = entry.min_app_version.trim();
  }
  if (typeof entry.homepage === "string" && entry.homepage.trim()) {
    normalized.homepage = entry.homepage.trim();
  }

  return normalized;
};

// ---------------------------------------------------------------------------
// Entity → plugin-dir registry
// Populated whenever blueprints are loaded so that transforms and transform
// execution can route to the correct directory without the renderer having to
// thread extraPluginDirs through every subsequent call.
// ---------------------------------------------------------------------------

const _entityPluginDir = new Map<string, string>();

function clearEntityPluginDirs() {
  _entityPluginDir.clear();
}

function recordEntityDir(label: string, dir: string) {
  const normalized = label.trim();
  if (!normalized) return;
  _entityPluginDir.set(normalized, dir);
  _entityPluginDir.set(toSnakeCase(normalized), dir);
}

function recordEntityDirs(blueprints: Record<string, any>, dir: string) {
  for (const label of Object.keys(blueprints)) {
    recordEntityDir(label, dir);
  }
}

/** Returns the plugin directory that owns `label`, falling back to `defaultDir`. */
export function getPluginDirForEntity(
  label: string | undefined | null,
  defaultDir: string,
): string {
  const normalized = label?.trim();
  if (!normalized) {
    return defaultDir;
  }
  return (
    _entityPluginDir.get(normalized) ??
    _entityPluginDir.get(toSnakeCase(normalized)) ??
    defaultDir
  );
}

function mergePluginRoots(
  defaultDir: string,
  extraDirs: string[] = [],
): string[] {
  return Array.from(new Set([defaultDir, ...extraDirs].filter(Boolean)));
}

function resolveBundledPaidPluginsPath(): string | null {
  const pluginsRoot = path.join(process.cwd(), "framework", "paid_plugins");
  return fs.existsSync(pluginsRoot) ? pluginsRoot : null;
}

function resolvePluginRoots(pluginsPath?: string, extraDirs: string[] = []) {
  return Array.from(
    new Set(
      [
        resolveEffectivePluginsPath(pluginsPath),
        resolveBundledPaidPluginsPath(),
        ...extraDirs,
      ].filter(Boolean) as string[],
    ),
  );
}

type PluginSettingDefinition = {
  name: string;
  display_name?: string;
  setting_type?: string;
  default_value?: string;
  required?: boolean;
  global_setting?: boolean;
  description?: string;
  popup?: boolean;
};

type PluginSettingsSource = {
  id: string;
  label: string;
  target?: string;
  settings: PluginSettingDefinition[];
};

export function registerPluginsIpc({ app, database }: IpcContext) {
  bindHandle(
    "plugins:list",
    async (_, payload?: { extraPluginDirs?: string[] }) => {
      const { pluginsPath, venvPath, pythonPath } = database.getSettings();
      const mainDir = resolveEffectivePluginsPath(pluginsPath);
      const extraDirs = payload?.extraPluginDirs ?? [];
      const allDirs = [mainDir, ...extraDirs];
      const results = await Promise.all(
        allDirs.map((dir) =>
          getAvailablePlugins(dir, venvPath, pythonPath).catch(() => []),
        ),
      );
      return results.flat();
    },
  );

  bindHandle(
    "plugins:blueprints",
    async (_, payload?: { extraPluginDirs?: string[] }) => {
      const { pluginsPath, venvPath, pythonPath } = database.getSettings();
      const mainDir = resolveEffectivePluginsPath(pluginsPath);
      const extraDirs = payload?.extraPluginDirs ?? [];
      const allDirs = [mainDir, ...extraDirs];

      const results = await Promise.all(
        allDirs.map((dir) =>
          getEntityBlueprints(dir, venvPath, pythonPath)
            .then((bp) => ({ dir, bp }))
            .catch(() => ({ dir, bp: {} as Record<string, any> })),
        ),
      );

      const merged: Record<string, any> = {};
      clearEntityPluginDirs();
      for (const { dir, bp } of results) {
        recordEntityDirs(bp, dir);
        Object.assign(merged, bp);
      }
      return merged;
    },
  );

  bindHandle(
    "plugins:transforms",
    async (
      _,
      payload:
        | string
        | {
            entityLabel: string;
            extraPluginDirs?: string[];
          },
    ) => {
      const { pluginsPath, venvPath, pythonPath } = database.getSettings();
      const entityLabel =
        typeof payload === "string" ? payload : payload?.entityLabel;
      const extraDirs =
        typeof payload === "string" ? [] : (payload?.extraPluginDirs ?? []);
      const defaultDir = resolveEffectivePluginsPath(pluginsPath);
      const preferredDir = getPluginDirForEntity(entityLabel, defaultDir);
      const pluginRoots = mergePluginRoots(preferredDir, [
        defaultDir,
        ...extraDirs,
      ]);
      return getEntityTransforms(
        entityLabel,
        pluginRoots,
        venvPath,
        pythonPath,
      );
    },
  );

  bindHandle(
    "plugins:settings-definitions",
    async (_, payload?: { extraPluginDirs?: string[] }) => {
      const { pluginsPath, venvPath, pythonPath } = database.getSettings();
      const pluginRoots = resolvePluginRoots(
        pluginsPath,
        payload?.extraPluginDirs ?? [],
      );
      const definitions = new Map<string, PluginSettingsSource>();

      const blueprintResults = await Promise.all(
        pluginRoots.map((dir) =>
          getEntityBlueprints(dir, venvPath, pythonPath)
            .then((bp) => ({ dir, bp }))
            .catch(() => ({ dir, bp: {} as Record<string, any> })),
        ),
      );

      clearEntityPluginDirs();
      for (const { dir, bp } of blueprintResults) {
        recordEntityDirs(bp, dir);
      }

      const entityLabels = Array.from(
        new Set(blueprintResults.flatMap(({ bp }) => Object.keys(bp))),
      );

      const transformResults = await Promise.all(
        entityLabels.map((entityLabel) => {
          const preferredDir = getPluginDirForEntity(
            entityLabel,
            pluginRoots[0] ?? resolveEffectivePluginsPath(pluginsPath),
          );
          return getEntityTransforms(
            entityLabel,
            mergePluginRoots(preferredDir, pluginRoots),
            venvPath,
            pythonPath,
          ).catch(() => []);
        }),
      );

      for (const transform of transformResults.flat()) {
        const settings = Array.isArray(transform?.settings)
          ? transform.settings
          : [];
        if (!settings.length) continue;

        const label = String(transform?.label ?? "").trim();
        const id = normalizePluginSettingsId(label);
        if (!id || definitions.has(id)) continue;

        definitions.set(id, {
          id,
          label,
          target:
            typeof transform?.target === "string"
              ? transform.target
              : undefined,
          settings: settings
            .map((setting: any) => ({
              name: String(setting?.name ?? "").trim(),
              display_name:
                typeof setting?.display_name === "string"
                  ? setting.display_name
                  : undefined,
              setting_type:
                typeof setting?.setting_type === "string"
                  ? setting.setting_type
                  : "string",
              default_value:
                setting?.default_value == null
                  ? ""
                  : String(setting.default_value),
              required: Boolean(setting?.required),
              global_setting: Boolean(setting?.global_setting),
              description:
                typeof setting?.description === "string"
                  ? setting.description
                  : undefined,
              popup: Boolean(setting?.popup),
            }))
            .filter((setting) => setting.name.length > 0),
        });
      }

      return Array.from(definitions.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    },
  );

  bindHandle("plugins:list-transform-files", async () => {
    const { pluginsPath } = database.getSettings();
    const transformsDir = resolveTransformsDir(pluginsPath);
    try {
      const files = await fs.promises.readdir(transformsDir);
      const transforms = [];
      for (const file of files) {
        if (!file.endsWith(".py")) continue;
        const filePath = path.join(transformsDir, file);
        const stat = await fs.promises.stat(filePath);
        const label = file.replace(/\.py$/i, "");
        transforms.push({
          label,
          filename: file,
          path: filePath,
          mtime: stat.mtime.toISOString(),
        });
      }
      return transforms.sort(
        (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
      );
    } catch (error) {
      console.error("[Plugins] Failed to list transform files:", error);
      return [];
    }
  });

  bindHandle(
    "plugins:read-transform-file",
    async (_, payload: { path?: string; label?: string }) => {
      const { pluginsPath } = database.getSettings();
      const transformsDir = resolveTransformsDir(pluginsPath);
      let filePath = payload?.path;
      if (!filePath && payload?.label) {
        const label = normalizeTransformLabel(payload.label);
        filePath = path.join(transformsDir, `${label}.py`);
      }
      if (!filePath) {
        throw new Error("Transform path or label is required.");
      }
      const resolved = ensureTransformPath(filePath, transformsDir);
      return await fs.promises.readFile(resolved, "utf-8");
    },
  );

  bindHandle(
    "plugins:save-transform-file",
    async (_, payload: { label: string; content: string }) => {
      const { pluginsPath } = database.getSettings();
      const transformsDir = resolveTransformsDir(pluginsPath);
      const label = normalizeTransformLabel(payload?.label || "transform");
      await fs.promises.mkdir(transformsDir, { recursive: true });
      const filePath = path.join(transformsDir, `${label}.py`);
      await fs.promises.writeFile(filePath, payload?.content ?? "", "utf-8");
      const stat = await fs.promises.stat(filePath);
      return {
        label,
        filename: `${label}.py`,
        path: filePath,
        mtime: stat.mtime.toISOString(),
      };
    },
  );

  bindHandle(
    "plugins:delete-transform-file",
    async (_, payload: { path?: string; label?: string }) => {
      const { pluginsPath } = database.getSettings();
      const transformsDir = resolveTransformsDir(pluginsPath);
      let filePath = payload?.path;
      if (!filePath && payload?.label) {
        const label = normalizeTransformLabel(payload.label);
        filePath = path.join(transformsDir, `${label}.py`);
      }
      if (!filePath) {
        throw new Error("Transform path or label is required.");
      }
      const resolved = ensureTransformPath(filePath, transformsDir);
      await fs.promises.unlink(resolved);
      return { success: true };
    },
  );

  bindHandle("market:scan-repo", async (_, repoUrl: string) => {
    return scanRepo(repoUrl);
  });

  bindHandle(
    "market:fetch-repo-file",
    async (
      _,
      payload: { repoUrl: string; filePath: string; branch: string },
    ) => {
      return fetchRepoFile(payload.repoUrl, payload.filePath, payload.branch);
    },
  );

  bindHandle("market:validate-local-dir", async (_, dirPath: string) => {
    const root = path.resolve(dirPath);
    const stat = await fs.promises.stat(root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error("Not a valid directory.");

    const rootEntries = await fs.promises.readdir(root, {
      withFileTypes: true,
    });
    if (!isLocalPluginRoot(rootEntries)) {
      throw new Error(
        "This does not look like a plugin directory. Select a folder containing entities, transforms, or manifest.json.",
      );
    }

    return { success: true };
  });

  bindHandle("market:scan-local-dir", async (_, dirPath: string) => {
    const root = path.resolve(dirPath);
    const stat = await fs.promises.stat(root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error("Not a valid directory.");

    const rootEntries = await fs.promises.readdir(root, {
      withFileTypes: true,
    });
    if (!isLocalPluginRoot(rootEntries)) {
      throw new Error(
        "This does not look like a plugin directory. Select a folder containing entities, transforms, or manifest.json.",
      );
    }

    const files: string[] = [];
    let visitedEntries = 0;

    const walkDir = async (dir: string, depth = 0) => {
      if (depth > LOCAL_PLUGIN_MAX_DEPTH) return;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        visitedEntries += 1;
        if (visitedEntries % 50 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        if (visitedEntries > LOCAL_PLUGIN_MAX_SCAN_ENTRIES) {
          throw new Error(
            "Local plugin directory is too large to preview. Select the plugin root instead of a parent folder.",
          );
        }

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(root, fullPath);
        if (entry.isDirectory()) {
          if (LOCAL_PLUGIN_IGNORED_DIRS.has(entry.name)) continue;
          await walkDir(fullPath, depth + 1);
        } else if (LOCAL_PLUGIN_SUPPORTED_FILE.test(entry.name)) {
          files.push(relPath);
          if (files.length >= LOCAL_PLUGIN_MAX_FILES) return;
        }
      }
    };

    for (const entry of rootEntries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "entities" && entry.name !== "transforms") continue;
        await walkDir(fullPath, 1);
      } else if (LOCAL_PLUGIN_SUPPORTED_FILE.test(entry.name)) {
        files.push(entry.name);
      }
    }

    let readme: string | null = null;
    for (const name of ["README.md", "readme.md", "README.txt", "readme.txt"]) {
      try {
        readme = await fs.promises.readFile(path.join(root, name), "utf-8");
        break;
      } catch {}
    }

    return { files, manifest: null, readme, branch: "local" };
  });

  bindHandle(
    "market:read-local-file",
    async (_, payload: { dirPath: string; filePath: string }) => {
      const resolved = path.resolve(payload.dirPath, payload.filePath);
      const base = path.resolve(payload.dirPath) + path.sep;
      if (!resolved.startsWith(base)) {
        throw new Error("File path must be inside the plugin directory.");
      }
      return await fs.promises.readFile(resolved, "utf-8");
    },
  );

  bindHandle("market:list-community-plugins", async () => {
    try {
      const response = await net.fetch(COMMUNITY_PLUGIN_REGISTRY_URL);
      if (!response.ok) {
        console.warn(
          `[Market] Community plugin registry unavailable: HTTP ${response.status} ${COMMUNITY_PLUGIN_REGISTRY_URL}`,
        );
        return [];
      }

      const raw = await response.text();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const { pluginsPath } = database.getSettings();
      const pluginsRoot = resolveCommunityPluginInstallRoot(pluginsPath);
      return parsed
        .map((entry) => {
          const normalized = normalizeCommunityPluginRegistryItem(entry);
          if (!normalized) return null;

          return {
            ...normalized,
            installed: isCommunityPluginInstalled(pluginsRoot, normalized.repo),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    } catch (error) {
      console.warn("[Market] Community plugin registry unavailable.", error);
      return [];
    }
  });

  bindHandle("market:install-community-plugin", async (_, repoUrl: string) => {
    try {
      const { pluginsPath } = database.getSettings();
      const pluginsRoot = resolveCommunityPluginInstallRoot(pluginsPath);
      const result = await installCommunityPluginRepo(pluginsRoot, repoUrl);
      clearEntityPluginDirs();
      return {
        success: true,
        alreadyInstalled: result.alreadyInstalled,
        installPath: result.installPath,
        pluginsRoot,
      };
    } catch (error) {
      console.error("[Market] Failed to install plugin:", error, repoUrl);
      throw error;
    }
  });

  bindHandle(
    "market:uninstall-community-plugin",
    async (_, repoUrl: string) => {
      try {
        const { pluginsPath } = database.getSettings();
        const pluginsRoot = resolveCommunityPluginInstallRoot(pluginsPath);
        const result = await uninstallCommunityPluginRepo(pluginsRoot, repoUrl);
        clearEntityPluginDirs();
        return {
          ...result,
          success: true,
          pluginsRoot,
        };
      } catch (error) {
        console.error("[Market] Failed to uninstall:", repoUrl, error);
        throw error;
      }
    },
  );
}
