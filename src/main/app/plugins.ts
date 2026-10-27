import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const APP_DATA_DIR = "omoika";

export function resolveDefaultPluginsPath(): string {
  return path.join(process.cwd(), "plugins");
}

export function resolveMarketplacePluginsRoot(): string {
  return path.join(app.getPath("appData"), APP_DATA_DIR, "plugins");
}

function hasPluginContent(root: string): boolean {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries.some((entry) => {
      if (!entry.isDirectory()) {
        return false;
      }

      if (entry.name === "entities" || entry.name === "transforms") {
        return true;
      }

      const childRoot = path.join(root, entry.name);
      return (
        fs.existsSync(path.join(childRoot, "entities")) ||
        fs.existsSync(path.join(childRoot, "transforms"))
      );
    });
  } catch {
    return false;
  }
}

export function resolveEffectivePluginsPath(pluginsPath?: string): string {
  const configuredPath = pluginsPath?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  const marketplaceRoot = resolveMarketplacePluginsRoot();
  if (hasPluginContent(marketplaceRoot)) {
    return marketplaceRoot;
  }

  return resolveDefaultPluginsPath();
}

export function resolveCommunityPluginInstallRoot(pluginsPath?: string): string {
  return pluginsPath?.trim() || resolveMarketplacePluginsRoot();
}

export function listCommunityPluginRoots(pluginsPath?: string): string[] {
  return Array.from(
    new Set([
      resolveEffectivePluginsPath(pluginsPath),
      resolveMarketplacePluginsRoot(),
    ])
  );
}
