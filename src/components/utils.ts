export function formatTime(date: Date) {
  var hours = date.getHours();
  var minutes: string | number = date.getMinutes();
  var ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? "0" + minutes : minutes;
  var strTime = hours + ":" + minutes + " " + ampm;
  return strTime;
}

export function formatDate(date: string, showAt: boolean = false): string {
  if (date) {
    const dateStr = date.replace(" ", "T");
    return `${new Date(dateStr).toDateString()}${showAt ? " at " : " "}${formatTime(new Date(dateStr))}`;
  }
  return "";
}

// i.e. Mon Jun 29 2026 8:53 pm -> Created 4 days ago
// i.e. Mon Jun 29 2025 8:53 pm -> Created 1 year and 4 days ago
export function formatDateFrom(date: string): string {
  if (!date) return "";

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const today = new Date();
  const fromDay = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
  );
  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  if (fromDay > todayDay) return "Created in the future";

  let years = todayDay.getFullYear() - fromDay.getFullYear();
  const anniversary = new Date(
    fromDay.getFullYear() + years,
    fromDay.getMonth(),
    fromDay.getDate(),
  );

  if (anniversary > todayDay) {
    years -= 1;
    anniversary.setFullYear(anniversary.getFullYear() - 1);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (todayDay.getTime() - anniversary.getTime()) / msPerDay,
  );
  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  }

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }

  if (parts.length === 0) return "today";
  if (parts.length === 1) return `${parts[0]} ago`;

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} ago`;
}

/** Build a full-year (53 weeks) date map initialized to 0 so the UI always
 *  renders a complete year regardless of returned buckets. */
export function buildFullYearMap(): Record<string, number> {
  const map: Record<string, number> = {};
  const sizeWeeks = 53;
  const end = new Date();
  const daysToSunday = end.getDay();
  const endShift = 6 - daysToSunday;
  end.setDate(end.getDate() + endShift);
  const totalDays = sizeWeeks * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    const key = `${year}-${month}-${day}`;
    map[key] = 0;
  }
  return map;
}

export interface CommunityPluginRepo {
  id: string;
  name: string;
  author: string;
  description: string;
  repo: string;
  installed: boolean;
  license?: string;
  tags?: string[];
  min_app_version?: string;
  homepage?: string;
}

export interface RepoPythonFile {
  id: string;
  repoId: string;
  path: string;
  name: string;
  description: string;
  url: string;
  tags: string[];
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
}

const normalizeTag = (tag: string) =>
  tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueTags = (tags: string[]) => Array.from(new Set(tags));

export const buildFileTags = (
  path: string,
  repoTags: string[] = [],
): string[] => {
  const pathSegments = path
    .split("/")
    .map((segment) => normalizeTag(segment))
    .filter(Boolean);

  const tags = new Set<string>();

  for (const tag of repoTags) {
    const normalized = normalizeTag(tag);
    if (normalized) tags.add(normalized);
  }

  // Only add folder segments — exclude the filename (last segment)
  const folderSegments = pathSegments.slice(0, -1);
  for (const segment of folderSegments.slice(0, 3)) {
    if (segment.length > 1) tags.add(segment);
  }

  if (pathSegments.some((segment) => segment.includes("entity"))) {
    tags.add("entities");
  }
  if (pathSegments.some((segment) => segment.includes("transform"))) {
    tags.add("transforms");
  }
  if (pathSegments.some((segment) => segment.includes("plugin"))) {
    tags.add("plugins");
  }

  return uniqueTags(Array.from(tags));
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

export async function loadCommunityPlugins(): Promise<CommunityPluginRepo[]> {
  try {
    const plugins = await window.api.market.listCommunityPlugins();
    if (!Array.isArray(plugins)) return [];

    return plugins
      .map((plugin) => ({
        id: String(plugin?.id ?? "").trim(),
        name: String(plugin?.name ?? "").trim(),
        author: String(plugin?.author ?? "").trim(),
        description: String(plugin?.description ?? "").trim(),
        repo: String(plugin?.repo ?? "").trim(),
        installed: Boolean(plugin?.installed),
        license:
          typeof plugin?.license === "string" ? plugin.license : undefined,
        tags: Array.isArray(plugin?.tags)
          ? plugin.tags.map((tag) => String(tag))
          : undefined,
        min_app_version:
          typeof plugin?.min_app_version === "string"
            ? plugin.min_app_version
            : undefined,
        homepage:
          typeof plugin?.homepage === "string" ? plugin.homepage : undefined,
      }))
      .filter((plugin) => plugin.id.length > 0 && plugin.repo.length > 0);
  } catch (error) {
    console.error("[Market] Failed to load community plugins:", error);
    return [];
  }
}

async function fetchJson<T>(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.text();
}

export async function fetchRepoReadme(repoRef: string): Promise<string> {
  const parsed = parseGitHubRepoRef(repoRef);
  if (!parsed) return "";

  const { owner, repo } = parsed;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github.raw",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        content?: string;
        encoding?: string;
        download_url?: string;
      };

      if (typeof payload.content === "string") {
        if (payload.encoding === "base64") {
          try {
            return atob(payload.content.replace(/\n/g, ""));
          } catch {
            return payload.content;
          }
        }
        return payload.content;
      }

      if (typeof payload.download_url === "string" && payload.download_url) {
        return await fetchText(payload.download_url);
      }
    }

    return await response.text();
  } catch {
    const fallbackBranches = ["main", "master", "HEAD"];
    for (const branch of fallbackBranches) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
      try {
        return await fetchText(rawUrl);
      } catch {
        // continue with next branch fallback
      }
    }
  }

  return "";
}

type GitHubRepoResponse = {
  default_branch?: string;
};

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
};

export async function fetchRepoPythonFiles(
  repoId: string,
  repoRef: string,
  repoTags: string[] = [],
): Promise<RepoPythonFile[]> {
  const parsed = parseGitHubRepoRef(repoRef);
  if (!parsed) return [];

  const { owner, repo } = parsed;
  const repoInfo = await fetchJson<GitHubRepoResponse>(
    `https://api.github.com/repos/${owner}/${repo}`,
  );
  const branch = repoInfo.default_branch || "main";

  const tree = await fetchJson<GitHubTreeResponse>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      branch,
    )}?recursive=1`,
  );

  const pythonFiles = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path?.endsWith(".py"))
    .map((entry) => {
      const filePath = entry.path as string;
      const fileName = filePath.split("/").at(-1) || filePath;
      const displayName = fileName.replace(/\.py$/i, "");
      const folderPath = filePath.includes("/")
        ? filePath.split("/").slice(0, -1).join(" / ")
        : "root";

      return {
        id: `${repoId}:${filePath}`,
        repoId,
        path: filePath,
        name: displayName,
        description: `Python plugin file in ${folderPath}`,
        url: `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`,
        tags: buildFileTags(filePath, repoTags),
      } satisfies RepoPythonFile;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return pythonFiles;
}
