import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

type GitHubRepoRef = {
  owner: string;
  repo: string;
};

export function parseGitHubRepoRef(repoRef: string): GitHubRepoRef | null {
  const trimmed = repoRef.trim();
  if (!trimmed) return null;

  const sanitized = trimmed
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  const [owner, repo] = sanitized.split("/");
  if (!owner || !repo) return null;

  return { owner, repo };
}

export function normalizeGitHubRepoUrl(repoRef: string): string {
  const parsed = parseGitHubRepoRef(repoRef);
  if (!parsed) {
    throw new Error("Invalid GitHub repo reference");
  }

  return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

export function getCommunityPluginInstallSlug(repoRef: string): string {
  const parsed = parseGitHubRepoRef(repoRef);
  if (!parsed) {
    throw new Error("Invalid GitHub repo reference");
  }

  return `${parsed.owner}-${parsed.repo}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
}

export function getCommunityPluginInstallDir(
  pluginsRoot: string,
  repoRef: string
): string {
  return path.join(pluginsRoot, getCommunityPluginInstallSlug(repoRef));
}

export function isCommunityPluginInstalled(
  pluginsRoot: string,
  repoRef: string
): boolean {
  const installDir = getCommunityPluginInstallDir(pluginsRoot, repoRef);
  return fs.existsSync(path.join(installDir, ".git"));
}

export async function installCommunityPluginRepo(
  pluginsRoot: string,
  repoRef: string
): Promise<{ installPath: string; alreadyInstalled: boolean }> {
  const installPath = getCommunityPluginInstallDir(pluginsRoot, repoRef);

  await fsp.mkdir(pluginsRoot, { recursive: true });

  if (fs.existsSync(path.join(installPath, ".git"))) {
    return { installPath, alreadyInstalled: true };
  }

  if (fs.existsSync(installPath)) {
    const entries = await fsp.readdir(installPath);
    if (entries.length > 0) {
      throw new Error(
        `Install directory already exists and is not a valid git clone: ${installPath}`
      );
    }
    await fsp.rm(installPath, { recursive: true, force: true });
  }

  try {
    await git.clone({
      fs,
      http,
      dir: installPath,
      url: normalizeGitHubRepoUrl(repoRef),
    });
    return { installPath, alreadyInstalled: false };
  } catch (error) {
    await fsp.rm(installPath, { recursive: true, force: true });
    throw error;
  }
}

export async function uninstallCommunityPluginRepo(
  pluginsRoot: string,
  repoRef: string
): Promise<{ installPath: string; removed: boolean }> {
  const installPath = getCommunityPluginInstallDir(pluginsRoot, repoRef);
  const existed = fs.existsSync(installPath);

  await fsp.rm(installPath, { recursive: true, force: true });

  return { installPath, removed: existed };
}
