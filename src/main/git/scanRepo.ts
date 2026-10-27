import { JsonObject } from "@/globals";
import { net } from "electron";

export interface RepoScanResult {
  files: string[];
  manifest: JsonObject | null;
  readme: string | null;
  branch: string;
}

const MAX_MANIFEST_SIZE = 10 * 1024 * 1024;
const MAX_README_SIZE = 2 * 1024 * 1024;
const MAX_TREE_FILES = 2000;
const PREVIEWABLE_FILE = /\.(py|json|csv|md|markdown|txt)$/i;

type GitHubRepoRef = {
  owner: string;
  repo: string;
};

type GitHubRepoResponse = {
  default_branch?: string;
};

type GitHubTreeResponse = {
  truncated?: boolean;
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
};

function parseGitHubOwnerRepo(repoUrl: string): GitHubRepoRef | null {
  const normalized = repoUrl
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  const [owner, repo] = normalized.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function githubApiUrl(path: string) {
  return `https://api.github.com${path}`;
}

function rawGitHubUrl(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await net.fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "omoika-marketplace",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchText(
  url: string,
  maxBytes: number,
): Promise<string | null> {
  const response = await net.fetch(url, {
    headers: {
      "User-Agent": "omoika-marketplace",
    },
  });

  if (!response.ok) return null;

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) return null;

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return null;
  return text;
}

async function fetchFirstText(
  urls: string[],
  maxBytes: number,
): Promise<string | null> {
  for (const url of urls) {
    const text = await fetchText(url, maxBytes).catch(() => null);
    if (text !== null) return text;
  }
  return null;
}

export async function scanRepo(repoUrl: string): Promise<RepoScanResult> {
  const parsed = parseGitHubOwnerRepo(repoUrl);
  if (!parsed) throw new Error("Invalid GitHub repo URL");

  const { owner, repo } = parsed;
  const repoInfo = await fetchJson<GitHubRepoResponse>(
    githubApiUrl(`/repos/${owner}/${repo}`),
  );
  const branch = repoInfo.default_branch || "main";

  const tree = await fetchJson<GitHubTreeResponse>(
    githubApiUrl(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    ),
  );

  const files = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => entry.path as string)
    .filter(
      (filePath) =>
        PREVIEWABLE_FILE.test(filePath) ||
        filePath === "manifest.json" ||
        /^readme\.(md|markdown|txt)$/i.test(filePath),
    )
    .slice(0, MAX_TREE_FILES)
    .sort((a, b) => a.localeCompare(b));

  const manifestText = await fetchText(
    rawGitHubUrl(owner, repo, branch, "manifest.json"),
    MAX_MANIFEST_SIZE,
  );
  let manifest: JsonObject | null = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText) as JsonObject;
    } catch {
      console.error("Invalid or unreadable manifest.json");
    }
  }

  const readme = await fetchFirstText(
    ["README.md", "README.markdown", "README.txt", "readme.md"].map((file) =>
      rawGitHubUrl(owner, repo, branch, file),
    ),
    MAX_README_SIZE,
  );

  return {
    files,
    manifest,
    readme,
    branch,
  };
}
