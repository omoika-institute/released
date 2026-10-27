import type {
  BrowserExtractedSearchResult,
  BrowserSearchEngine,
  BrowserSearchResult,
} from "./agentTypes";

export const DEFAULT_WEB_SEARCH_ENGINES: BrowserSearchEngine[] = [
  "duckduckgo",
];
export const MAX_WEB_SEARCH_PAGES = 5;

const WEB_SEARCH_ENGINE_ALLOWLIST = new Set<BrowserSearchEngine>(
  DEFAULT_WEB_SEARCH_ENGINES
);

const TRACKING_PARAM_NAMES = new Set([
  "ei",
  "fbclid",
  "gclid",
  "gbv",
  "gs_gbg",
  "gs_ivs",
  "gs_lcrp",
  "gs_lp",
  "gs_mss",
  "gs_mssp",
  "gs_rn",
  "gs_ri",
  "gs_ssp",
  "iflsig",
  "mc_cid",
  "mc_eid",
  "oq",
  "ref",
  "ref_src",
  "sei",
  "source",
  "sourceref",
  "usp",
  "ved",
]);

function isTrackingParam(name: string) {
  const normalized = name.toLowerCase();
  return (
    TRACKING_PARAM_NAMES.has(normalized) ||
    normalized.startsWith("utm_") ||
    normalized.startsWith("ga_")
  );
}

function unwrapGoogleResultUrl(url: URL) {
  if (!/(\.|^)google\./i.test(url.hostname)) return null;
  if (url.pathname !== "/url") return null;

  const nested =
    url.searchParams.get("url") ||
    url.searchParams.get("q") ||
    url.searchParams.get("imgurl");

  return nested?.trim() || null;
}

function unwrapDuckDuckGoResultUrl(url: URL) {
  if (!/(\.|^)duckduckgo\.com$/i.test(url.hostname)) return null;
  if (!url.pathname.startsWith("/l/")) return null;

  const nested =
    url.searchParams.get("uddg") || url.searchParams.get("rut");

  return nested?.trim() || null;
}

function unwrapSearchResultUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return (
      unwrapGoogleResultUrl(parsed) ||
      unwrapDuckDuckGoResultUrl(parsed) ||
      parsed.toString()
    );
  } catch {
    return rawUrl;
  }
}

export function normalizeWebSearchEngines(
  engines?: BrowserSearchEngine[]
): BrowserSearchEngine[] {
  if (!engines?.length) return [...DEFAULT_WEB_SEARCH_ENGINES];

  const seen = new Set<BrowserSearchEngine>();
  const normalized: BrowserSearchEngine[] = [];

  for (const engine of engines) {
    if (!WEB_SEARCH_ENGINE_ALLOWLIST.has(engine)) continue;
    if (seen.has(engine)) continue;
    seen.add(engine);
    normalized.push(engine);
  }

  return normalized.length ? normalized : [...DEFAULT_WEB_SEARCH_ENGINES];
}

export function getWebSearchUrl(
  engine: BrowserSearchEngine,
  query: string,
  onionMode = false,
  page = 1
) {
  const normalizedPage = Math.min(Math.max(Math.trunc(page), 1), MAX_WEB_SEARCH_PAGES);
  const encodedQuery = encodeURIComponent(query);
  const offset = normalizedPage > 1 ? `&s=${(normalizedPage - 1) * 30}` : "";

  if (engine !== "duckduckgo") {
    return `https://duckduckgo.com/?q=${encodedQuery}${offset}`;
  }

  if (onionMode) {
    return `http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/?q=${encodedQuery}${offset}`;
  }

  return `https://duckduckgo.com/?q=${encodedQuery}${offset}`;
}

export function normalizeSearchResultUrl(rawUrl: string) {
  try {
    const unwrapped = unwrapSearchResultUrl(rawUrl);
    const parsed = new URL(unwrapped);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (isTrackingParam(key)) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    parsed.pathname =
      parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "/";

    const sortedParams = [...parsed.searchParams.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );
    parsed.search = "";
    for (const [key, value] of sortedParams) {
      parsed.searchParams.append(key, value);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function deduplicateWebSearchResults(
  results: BrowserExtractedSearchResult[],
  limit?: number
) {
  const normalizedLimit =
    typeof limit === "number" ? Math.max(1, limit) : Number.POSITIVE_INFINITY;
  const seen = new Map<string, BrowserSearchResult>();
  const deduplicated: BrowserSearchResult[] = [];

  for (const result of results) {
    const normalizedUrl = normalizeSearchResultUrl(result.url);
    if (!normalizedUrl) continue;

    const existing = seen.get(normalizedUrl);
    if (existing) {
      if (!existing.engines.includes(result.engine)) {
        existing.engines.push(result.engine);
      }
      continue;
    }

    if (deduplicated.length >= normalizedLimit) {
      continue;
    }

    const merged: BrowserSearchResult = {
      position: deduplicated.length + 1,
      url: normalizedUrl,
      engines: [result.engine],
      title: result.title,
      description: result.description,
      displayUrl: result.displayUrl,
    };

    seen.set(normalizedUrl, merged);
    deduplicated.push(merged);
  }

  return deduplicated.map((result, index) => ({
    ...result,
    position: index + 1,
  }));
}

export function interleaveWebSearchResults(
  results: BrowserExtractedSearchResult[],
  engines: BrowserSearchEngine[]
) {
  if (!results.length || engines.length <= 1) {
    return [...results];
  }

  const engineBuckets = new Map<BrowserSearchEngine, BrowserExtractedSearchResult[]>();

  for (const engine of engines) {
    engineBuckets.set(engine, []);
  }

  for (const result of results) {
    const bucket = engineBuckets.get(result.engine);
    if (bucket) {
      bucket.push(result);
      continue;
    }

    engineBuckets.set(result.engine, [result]);
  }

  const interleaved: BrowserExtractedSearchResult[] = [];
  let rowIndex = 0;

  while (true) {
    let addedInRow = false;

    for (const engine of engineBuckets.keys()) {
      const candidate = engineBuckets.get(engine)?.[rowIndex];
      if (!candidate) continue;
      interleaved.push(candidate);
      addedInRow = true;
    }

    if (!addedInRow) break;
    rowIndex += 1;
  }

  return interleaved;
}
