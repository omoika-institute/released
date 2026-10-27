import { useEntitiesStore } from "@/stores";

export const PLUGIN_CATALOG_CHANGED_EVENT = "omoika:plugin-catalog-changed";

export type PluginCatalogChangeReason =
  | "community-install"
  | "community-uninstall"
  | "local-add"
  | "local-remove";

export type PluginCatalogChangeDetail = {
  reason: PluginCatalogChangeReason;
  repo?: string;
  pluginId?: string;
};

let refreshRequestId = 0;

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export function getLocalPluginDirs(): string[] {
  try {
    const raw = localStorage.getItem("omoika:local-plugins");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.filepath === "string" && p.filepath.trim())
      .map((p) => p.filepath as string);
  } catch {
    return [];
  }
}

export function invalidatePluginCatalog() {
  refreshRequestId += 1;
  useEntitiesStore.setState({
    plugins: [],
    blueprints: {},
    transforms: {},
    isLoadingPlugins: false,
    isLoadingTransforms: false,
  });
}

export function dispatchPluginCatalogChanged(
  detail: PluginCatalogChangeDetail,
) {
  invalidatePluginCatalog();
  window.dispatchEvent(
    new CustomEvent<PluginCatalogChangeDetail>(PLUGIN_CATALOG_CHANGED_EVENT, {
      detail,
    }),
  );
}

export function refreshPluginCatalog(extraPluginDirs = getLocalPluginDirs()) {
  const requestId = refreshRequestId + 1;
  refreshRequestId = requestId;

  useEntitiesStore.setState({
    isLoadingPlugins: true,
    error: null,
    transforms: {},
  });

  return Promise.all([
    window.api.plugins.list({ extraPluginDirs }),
    window.api.plugins.blueprints({ extraPluginDirs }),
  ])
    .then(([plugins, blueprints]) => {
      if (requestId !== refreshRequestId) return;
      useEntitiesStore.setState({
        plugins,
        blueprints,
        transforms: {},
        isLoadingPlugins: false,
      });
    })
    .catch((error) => {
      if (requestId !== refreshRequestId) return;
      useEntitiesStore.setState({
        error: toErrorMessage(error),
        isLoadingPlugins: false,
      });
      throw error;
    });
}
