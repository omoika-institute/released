import { net } from "electron";

function parseGitHubOwnerRepo(
  repoUrl: string
): { owner: string; repo: string } | null {
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

export async function fetchRepoFile(
  repoUrl: string,
  filePath: string,
  branch: string
): Promise<string> {
  const parsed = parseGitHubOwnerRepo(repoUrl);
  if (!parsed) throw new Error("Invalid GitHub repo URL");

  const { owner, repo } = parsed;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

  const response = await net.fetch(rawUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${filePath}`);
  }
  return response.text();
}
