export interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export type AgentProvider = "lmstudio" | "openrouter";

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolFunctionDefinition {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

export interface OpenAIToolDefinition {
  type: "function";
  function: OpenAIToolFunctionDefinition;
}

export interface AosintContextSnapshotTool {
  name: string;
  description: string;
  parameters?: unknown;
}

export interface AosintContextSnapshotDiff {
  previousSnapshotId?: string;
  addedMessages: number;
  removedMessages: number;
  changedMessages: number;
  addedTools: string[];
  removedTools: string[];
  approxAddedTokens: number;
  approxRemovedTokens: number;
  changedSections: string[];
}

export interface AosintContextSnapshot {
  id: string;
  caseId: string;
  round: number;
  model: string;
  createdAt: string;
  messages: OpenAIChatMessage[];
  tools: AosintContextSnapshotTool[];
  metrics: {
    messageCount: number;
    toolCount: number;
    approxTokenCount: number;
    systemPromptChars: number;
    toolSchemaChars: number;
  };
  diff?: AosintContextSnapshotDiff;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments?: string;
  };
}

export interface LMStudioOpenAIClientConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  headers?: Record<string, string>;
  label?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface LMStudioChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  tools?: OpenAIToolDefinition[];
  tool_choice?: "auto" | "none";
  temperature?: number;
  max_tokens?: number;
  parallel_tool_calls?: boolean;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      schema: Record<string, unknown>;
    };
  };
  signal?: AbortSignal;
}

export interface LMStudioChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    finish_reason: string | null;
    message: OpenAIChatMessage;
  }>;
}

export interface BrowserCommandBase<TType extends string, TPayload> {
  id: string;
  type: TType;
  payload: TPayload;
}

export interface BrowserPageLink {
  href: string;
  text: string;
  rel: string;
  target: string;
  selector: string;
}

export type BrowserSearchEngine = "google" | "duckduckgo" | "brave";

export interface BrowserExtractedSearchResult {
  engine: BrowserSearchEngine;
  position: number;
  url: string;
  title: string;
  description: string;
  displayUrl: string;
}

export interface BrowserSearchResult {
  position: number;
  url: string;
  engines: BrowserSearchEngine[];
  title: string;
  description: string;
  displayUrl: string;
}

export interface BrowserSearchData {
  query: string;
  engines: BrowserSearchEngine[];
  pages: number;
  deduplicatedCount: number;
  results: BrowserSearchResult[];
  engineErrors?: Array<{
    engine: BrowserSearchEngine;
    page?: number;
    message: string;
  }>;
}

export interface BrowserReadablePageData {
  title: string;
  excerpt: string;
  byline: string;
  siteName: string;
  publishedTime: string | null;
  markdown: string;
  text: string;
  links: BrowserPageLink[];
  truncated: boolean;
  source: "readability" | "fallback";
}

export type BrowserCommand =
  | BrowserCommandBase<
      "navigate",
      { url: string; timeoutMs?: number; waitForLoad?: boolean }
    >
  | BrowserCommandBase<
      "getReadableContent",
      { maxChars?: number; includeTitle?: boolean }
    >
  | BrowserCommandBase<
      "getVisibleText",
      { maxChars?: number; includeTitle?: boolean }
    >
  | BrowserCommandBase<"getLinks", {}>
  | BrowserCommandBase<"getMetadata", {}>
  | BrowserCommandBase<"click", { selector: string }>
  | BrowserCommandBase<
      "type",
      { selector: string; text: string; submit?: boolean }
    >
  | BrowserCommandBase<
      "waitFor",
      { selector?: string; text?: string; timeoutMs?: number }
    >
  | BrowserCommandBase<
      "webSearch",
      {
        query: string;
        limit?: number;
        engines?: BrowserSearchEngine[];
        pages?: number;
        timeoutMs?: number;
      }
    >
  | BrowserCommandBase<"screenshot", { format?: "png"; quality?: number }>;

export interface BrowserPageSnapshot {
  url: string;
  title?: string;
}

export type BrowserResult<TData = unknown> =
  | {
      id: string;
      ok: true;
      data: TData;
      page: BrowserPageSnapshot;
    }
  | {
      id: string;
      ok: false;
      error: { code: string; message: string };
      page?: BrowserPageSnapshot;
    };

export interface OsintCaseContext {
  caseId: string;
  notes: string[];
  updatedAt: string;
}

export interface OsintReport {
  summary: string;
  entities: string[];
  contacts: string[];
  domains: string[];
  evidence: string[];
  unknowns: string[];
}

export type OsintWorkflowName = "recon" | "pivot" | "report" | "harness";

export interface AosintHarnessSeedEntity {
  id: string;
  label: string;
  description?: string;
  source?: string;
  author?: string;
  ctime?: string;
  mtime?: string;
  datapoints: Record<string, string | number | boolean | null>;
}

export interface AosintHarnessNode {
  id: string;
  kind: string;
  label: string;
  prompt?: string;
  permission?: string;
  config?: Record<string, string | number | boolean | null>;
}

export interface AosintHarnessEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AosintHarnessContext {
  version: 1;
  name: string;
  templateId?: string;
  templateVersion?: number;
  templateVersionLabel?: string;
  runtimeSettings?: {
    provider?: string;
    model?: string;
    browserMode?: "background" | "visible";
    temperature?: number;
    maxTurns?: number;
    contextLength?: number;
    maxTokens?: number;
    enabledRuntimeTools?: string[];
  };
  caseId?: string;
  caseLabel?: string;
  permissionMode: string;
  seedEntities: AosintHarnessSeedEntity[];
  nodes: AosintHarnessNode[];
  edges: AosintHarnessEdge[];
}

export interface AosintCustomWorkflow {
  id?: string;
  version?: number;
  versionLabel?: string;
  name: string;
  description?: string;
  prompt: string;
  systemPrompt?: string;
}

export interface RunOsintWorkflowPayload {
  target: string;
  workflow?: OsintWorkflowName;
  prompt?: string;
  systemPrompt?: string;
  caseId?: string;
  browserMode?: "background" | "visible";
  provider?: AgentProvider;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTurns?: number;
  contextLength?: number;
  maxTokens?: number;
  generateReport?: boolean;
  enabledRuntimeTools?: string[];
  nearEndUserPrompt?: string;
  includeMessages?: boolean;
  harness?: AosintHarnessContext;
  customWorkflow?: AosintCustomWorkflow;
  runtimeToolContext?: {
    entityTypes?: Array<{
      label: string;
      description?: string;
      category?: string;
      fields?: string[];
    }>;
  };
}

export interface RunOsintWorkflowResult {
  workflow: OsintWorkflowName;
  target: string;
  finalAnswer: string;
  report: OsintReport | null;
  caseContext: OsintCaseContext;
  messages: OpenAIChatMessage[];
}

export type AosintWorkflowEvent =
  | {
      type: "agent_start";
      caseId: string;
      maxTurns: number;
      messageCount: number;
      model: string;
    }
  | {
      type: "model_loading";
      caseId: string;
      model: string;
      phase: "started" | "progress" | "loaded" | "failed";
      progress?: number;
      message?: string;
    }
  | {
      type: "round_start";
      caseId: string;
      round: number;
      maxTurns: number;
      messageCount: number;
    }
  | {
      type: "context_snapshot";
      caseId: string;
      round: number;
      snapshot: AosintContextSnapshot;
    }
  | {
      type: "round_end";
      caseId: string;
      round: number;
      messageCount: number;
    }
  | {
      type: "assistant_message";
      caseId: string;
      round: number;
      hasToolCalls: boolean;
      content: string;
    }
  | {
      type: "llm_message";
      caseId: string;
      round: number;
      messageIndex: number;
      role: OpenAIChatMessage["role"];
      message: OpenAIChatMessage;
    }
  | {
      type: "tool_call";
      caseId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_result";
      caseId: string;
      toolCallId: string;
      toolName: string;
      ok: boolean;
      durationMs: number;
      result?: unknown;
      error?: string;
    };
