import { randomUUID } from "node:crypto";
import {
  osintToolArgumentSchemas,
  runtimeToolArgumentSchemas,
  type RuntimeToolInputMap,
  type RuntimeToolName,
  type OsintToolInputMap,
  type OsintToolName,
} from "./agentTools";
import type {
  BrowserCommand,
  BrowserResult,
  OsintCaseContext,
} from "./agentTypes";
import type { UserToolDefinition } from "../userTools";

const DEFAULT_HTTP_TIMEOUT_MS = 12000;
const DEFAULT_HTTP_MAX_CHARS = 80000;
const DEFAULT_SEARCH_LIMIT = 5;

const toolNameAliases = {
  browser_navigate: "open_page",
  browser_get_visible_text: "read_page",
  browser_get_links: "list_links",
  browser_click: "click_element",
  browser_type: "fill_input",
  browser_wait_for: "wait_for_match",
  http_fetch: "fetch_url",
  search_web: "web_search",
} as const;

async function fetchText(
  url: string,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "OMOIKA-OSINT-Agent/0.1",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function trimText(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function isValidHttpUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function runHttpFetch(url: string, maxChars = DEFAULT_HTTP_MAX_CHARS) {
  if (!isValidHttpUrl(url)) {
    throw new Error(`Invalid HTTP URL: ${url}`);
  }

  const response = await fetchText(url);
  const body = await response.text();
  const headers = Object.fromEntries(response.headers.entries());

  return {
    url: response.url,
    status: response.status,
    ok: response.ok,
    headers,
    body: trimText(body, maxChars),
  };
}

export interface CaseMemoryStore {
  appendNote(caseId: string, note: string): OsintCaseContext;
  getContext(caseId: string): OsintCaseContext;
}

export class InMemoryCaseMemoryStore implements CaseMemoryStore {
  private readonly contexts = new Map<string, OsintCaseContext>();

  appendNote(caseId: string, note: string): OsintCaseContext {
    const current = this.getContext(caseId);
    const next: OsintCaseContext = {
      caseId,
      notes: [...current.notes, note],
      updatedAt: new Date().toISOString(),
    };
    this.contexts.set(caseId, next);
    return next;
  }

  getContext(caseId: string): OsintCaseContext {
    const existing = this.contexts.get(caseId);
    if (existing) return existing;

    const fresh: OsintCaseContext = {
      caseId,
      notes: [],
      updatedAt: new Date().toISOString(),
    };
    this.contexts.set(caseId, fresh);
    return fresh;
  }
}

export interface OsintToolExecutorDeps {
  caseId?: string;
  caseMemory?: CaseMemoryStore;
  executeBrowserCommand?: (command: BrowserCommand) => Promise<BrowserResult>;
  enabledRuntimeTools?: RuntimeToolName[];
  runtimeToolContext?: {
    entityTypes?: Array<{
      label: string;
      description?: string;
      category?: string;
      fields?: string[];
    }>;
  };
  userTools?: UserToolDefinition[];
}

function createBrowserProxy(
  executeBrowserCommand: (command: BrowserCommand) => Promise<BrowserResult>
) {
  return {
    navigate: (url: string) =>
      executeBrowserCommand({
        id: randomUUID(),
        type: "navigate",
        payload: { url, waitForLoad: true },
      }),
    readPage: (maxChars?: number) =>
      executeBrowserCommand({
        id: randomUUID(),
        type: "getReadableContent",
        payload: { maxChars },
      }),
    getLinks: () =>
      executeBrowserCommand({ id: randomUUID(), type: "getLinks", payload: {} }),
    click: (selector: string) =>
      executeBrowserCommand({
        id: randomUUID(),
        type: "click",
        payload: { selector },
      }),
    fillInput: (selector: string, text: string, submit?: boolean) =>
      executeBrowserCommand({
        id: randomUUID(),
        type: "type",
        payload: { selector, text, submit },
      }),
    waitFor: (opts: {
      selector?: string;
      text?: string;
      timeoutMs?: number;
    }) =>
      executeBrowserCommand({
        id: randomUUID(),
        type: "waitFor",
        payload: opts,
      }),
    fetch: (url: string, maxChars?: number) => runHttpFetch(url, maxChars),
  };
}

async function executeUserToolScript(
  tool: UserToolDefinition,
  browser: ReturnType<typeof createBrowserProxy>,
  args: unknown
): Promise<unknown> {
  // Wrap user script in an async function with browser and args in scope.
  // eslint-disable-next-line no-new-func
  const invoke = new Function(
    "browser",
    "args",
    `"use strict"; return (async function(browser, args) {\n${tool.script}\n})(browser, args);`
  ) as (
    browser: ReturnType<typeof createBrowserProxy>,
    args: unknown
  ) => Promise<unknown>;
  return invoke(browser, args);
}

function requireBrowserExecutor(
  executeBrowserCommand: OsintToolExecutorDeps["executeBrowserCommand"]
) {
  if (!executeBrowserCommand) {
    throw new Error("Browser executor is not configured.");
  }

  return executeBrowserCommand;
}

function normalizeToolName(name: string): OsintToolName | null {
  const normalized = (
    name in toolNameAliases
      ? toolNameAliases[name as keyof typeof toolNameAliases]
      : name
  ) as string;

  return normalized in osintToolArgumentSchemas
    ? (normalized as OsintToolName)
    : null;
}

function normalizeRuntimeToolName(
  name: string,
  enabledRuntimeTools?: RuntimeToolName[]
): RuntimeToolName | null {
  if (!(name in runtimeToolArgumentSchemas)) return null;
  if (!enabledRuntimeTools?.includes(name as RuntimeToolName)) return null;
  return name as RuntimeToolName;
}

function scoreRuntimeEntityType(
  entityType: NonNullable<OsintToolExecutorDeps["runtimeToolContext"]>["entityTypes"][number],
  tokens: string[]
) {
  if (!tokens.length) return 1;

  const label = entityType.label.toLowerCase();
  const haystack = [
    entityType.label,
    entityType.description,
    entityType.category,
    ...(entityType.fields ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.reduce((score, token) => {
    if (label === token) return score + 80;
    if (label.includes(token)) return score + 30;
    if (haystack.includes(token)) return score + 8;
    return score;
  }, 0);
}

function searchRuntimeEntityTypes(
  input: RuntimeToolInputMap["search_entity_types"],
  entityTypes: NonNullable<OsintToolExecutorDeps["runtimeToolContext"]>["entityTypes"] = []
) {
  const query = input.query?.trim() ?? "";
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  const limit = input.limit ?? 8;

  const matches = entityTypes
    .map((entityType) => ({
      ...entityType,
      score: scoreRuntimeEntityType(entityType, tokens),
    }))
    .filter((entityType) => entityType.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ score: _score, ...entityType }) => entityType);

  return {
    ok: true,
    source: "python_ipc_plugin_blueprints",
    query,
    count: matches.length,
    entity_types: matches,
  };
}

export function createOsintToolExecutor(deps: OsintToolExecutorDeps = {}) {
  const caseMemory = deps.caseMemory ?? new InMemoryCaseMemoryStore();
  const caseId = deps.caseId ?? "default";

  return async function executeTool(name: string, args: unknown) {
    const startedAt = Date.now();
    const normalizedName = normalizeToolName(name);
    const runtimeToolName = normalizeRuntimeToolName(
      name,
      deps.enabledRuntimeTools
    );
    console.log("[aosint:tool] dispatch:start", {
      caseId,
      toolName: normalizedName ?? name,
      rawToolName: name,
      args,
    });

    if (runtimeToolName) {
      const schema = runtimeToolArgumentSchemas[runtimeToolName];
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          error: "INVALID_ARGUMENTS",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        };
      }

      let result: unknown;
      switch (runtimeToolName) {
        case "search_entity_types":
          result = searchRuntimeEntityTypes(
            parsed.data as RuntimeToolInputMap["search_entity_types"],
            deps.runtimeToolContext?.entityTypes
          );
          break;
        case "add_unverified_entity_to_graph": {
          const input =
            parsed.data as RuntimeToolInputMap["add_unverified_entity_to_graph"];
          result = {
            ok: true,
            status: "captured_unverified_entity_intent",
            toolName: runtimeToolName,
            entity: {
              ...input,
              submitted_at: new Date().toISOString(),
            },
          };
          break;
        }
        case "ENTITY_RESOLUTION_FINISHED": {
          const input =
            parsed.data as RuntimeToolInputMap["ENTITY_RESOLUTION_FINISHED"];
          result = {
            ok: true,
            status: "entity_resolution_finished",
            toolName: runtimeToolName,
            ...input,
            finished_at: new Date().toISOString(),
          };
          break;
        }
        default:
          throw new Error(`Unhandled runtime tool: ${runtimeToolName}`);
      }

      console.log("[aosint:tool] dispatch:runtime-tool:success", {
        caseId,
        toolName: runtimeToolName,
        durationMs: Date.now() - startedAt,
      });
      return result;
    }

    if (!normalizedName) {
      const userTool = deps.userTools?.find((t) => t.enabled && t.name === name);
      if (userTool) {
        try {
          const browserProxy = createBrowserProxy(
            requireBrowserExecutor(deps.executeBrowserCommand)
          );
          const result = await executeUserToolScript(userTool, browserProxy, args);
          console.log("[aosint:tool] dispatch:user-tool:success", {
            caseId,
            toolName: name,
            durationMs: Date.now() - startedAt,
          });
          return result;
        } catch (error) {
          console.error("[aosint:tool] dispatch:user-tool:error", {
            caseId,
            toolName: name,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      console.error("[aosint:tool] dispatch:unknown", { caseId, toolName: name });
      throw new Error(`Unknown tool: ${name}`);
    }

    const schema = osintToolArgumentSchemas[normalizedName];
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      console.warn("[aosint:tool] dispatch:invalid-args", {
        caseId,
        toolName: normalizedName,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return {
        ok: false,
        error: "INVALID_ARGUMENTS",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    }

    const input = parsed.data;

    try {
      let result: unknown;

      switch (normalizedName) {
        case "open_page": {
          const typedInput = input as OsintToolInputMap["open_page"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "navigate",
            payload: {
              url: typedInput.url,
              waitForLoad: typedInput.waitForLoad ?? true,
              timeoutMs: typedInput.timeoutMs ?? 30000,
            },
          });
          break;
        }
        case "read_page": {
          const typedInput = input as OsintToolInputMap["read_page"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "getReadableContent",
            payload: { maxChars: typedInput.maxChars },
          });
          break;
        }
        case "list_links":
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "getLinks",
            payload: {},
          });
          break;
        case "click_element": {
          const typedInput = input as OsintToolInputMap["click_element"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "click",
            payload: { selector: typedInput.selector },
          });
          break;
        }
        case "fill_input": {
          const typedInput = input as OsintToolInputMap["fill_input"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "type",
            payload: {
              selector: typedInput.selector,
              text: typedInput.text,
              submit: typedInput.submit,
            },
          });
          break;
        }
        case "wait_for_match": {
          const typedInput = input as OsintToolInputMap["wait_for_match"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "waitFor",
            payload: {
              selector: typedInput.selector,
              text: typedInput.text,
              timeoutMs: typedInput.timeoutMs,
            },
          });
          break;
        }
        case "fetch_url": {
          const typedInput = input as OsintToolInputMap["fetch_url"];
          result = await runHttpFetch(typedInput.url, typedInput.maxChars);
          break;
        }
        case "web_search": {
          const typedInput = input as OsintToolInputMap["web_search"];
          result = await requireBrowserExecutor(deps.executeBrowserCommand)({
            id: randomUUID(),
            type: "webSearch",
            payload: {
              query: typedInput.query,
              limit: typedInput.limit ?? DEFAULT_SEARCH_LIMIT,
              engines: typedInput.engines,
              pages: typedInput.pages,
              timeoutMs: typedInput.timeoutMs ?? 30000,
            },
          });
          break;
        }
        default:
          throw new Error(`Unhandled tool: ${normalizedName}`);
      }

      console.log("[aosint:tool] dispatch:success", {
        caseId,
        toolName: normalizedName,
        durationMs: Date.now() - startedAt,
        resultPreview: JSON.stringify(result).slice(0, 240),
      });
      return result;
    } catch (error) {
      console.error("[aosint:tool] dispatch:error", {
        caseId,
        toolName: normalizedName,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
