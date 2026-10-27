import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useNavigate } from "react-router-dom";
import GridLayout from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { Icon } from "@/components/icons";
import {
  ViewportPortal,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  PositionMode,
  type TransformLayoutAlgorithm,
  useAttachmentsStore,
  useEntitiesStore,
  useFlowStore,
} from "@/stores";
import { AttachmentItem, Graph, entitiesApi } from "@/api";
import { toast } from "react-toastify";
import { useParams } from "react-router-dom";
import {
  GRAPHEXA_ALGORITHM_PREFIX,
  type LayoutAlgorithmOption,
  type LayoutConfig,
} from "./Graph";
import type {
  AgentProvider,
  AosintWorkflowEvent,
  OpenAIChatMessage,
} from "@/lib/aosint/agentTypes";
import { truncateAosintTraceText } from "@/lib/aosint/workflowPayloads";
import { DEFAULT_OSINT_SYSTEM_PROMPT } from "@/lib/aosint/agentPrompts";
import { Collapsible } from "@/components/Collapsible";
import Input from "@/components/inputs";
import { toSnakeCase } from "../utils";
import Logomark from "@/assets/images/logomark.svg?react";
import {
  getCitationStatus,
  normalizeEvidenceCitations,
} from "./unverifiedEntityUtils";
import { EntityOption, type PluginEntity } from "./OverlayEntityOption";
import { OverlaySidebar } from "./OverlaySidebar";
import { ProactiveQueuePanel } from "./ProactiveQueuePanel";
import { AuditTimelineBar } from "./AuditTimelineBar";
import {
  getLocalPluginDirs,
  refreshPluginCatalog,
} from "@/renderer/plugins/catalog";

const resolveIcon = (value?: string) => (value && value.trim() ? value : "");
const resolveColor = (value?: string) => (value && value.trim() ? value : "");
const normalizeCategories = (value?: string | string[]) => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const DEFAULT_LAYOUT_ALGORITHM = "graphexa.layered";
const DEFAULT_LAYOUT_DIRECTION = "RIGHT";
const DEFAULT_NODE_SPACING = 180;
const DEFAULT_LAYER_SPACING = 420;
const DEFAULT_GRAPHEXA_SCALE = 720;
const DEFAULT_GRAPHEXA_ITERATIONS = 120;
const DEFAULT_GRAPHEXA_MAX_ITER = 100;
const DEFAULT_GRAPHEXA_SCALING_RATIO = 1200;
const DEFAULT_GRAPHEXA_GRAVITY = 1;
const DEFAULT_GRAPHEXA_JITTER_TOLERANCE = 1;
const DEFAULT_GRAPHEXA_THRESHOLD = 0.0001;
const DEFAULT_GRAPHEXA_RESOLUTION = 0.35;
// Proactive intelligence is intentionally commented out for this release.
// Flip this gate when the feature is ready to ship.
const PROACTIVE_INTELLIGENCE_RELEASED = false;
const PROACTIVE_AGENT_ERROR_TOAST_ID = "proactive-agent-error";
const DEFAULT_PROACTIVE_PANEL_HEIGHT_RATIO = 0.2;
const MIN_PROACTIVE_PANEL_HEIGHT_RATIO = 0.14;
const MAX_PROACTIVE_PANEL_HEIGHT_RATIO = 0.5;
const UNVERIFIED_NODE_TYPE = "unverifiedNodeType";
const AGENT_RESOLVER_NAME = "Agent Smith";
const SEARCH_ENTITY_TYPES_TOOL = "search_entity_types";
const ADD_UNVERIFIED_ENTITY_TOOL = "add_unverified_entity_to_graph";
const ENTITY_RESOLUTION_FINISHED_TOOL = "ENTITY_RESOLUTION_FINISHED";
const MAX_RESOLUTION_BLUEPRINTS = 6;
const MAX_RESOLUTION_ATTEMPTS = 3;
const MAX_RESOLUTION_TURNS = 24;
const MAX_RESOLUTION_HINTS = 20;
const MAX_RESOLUTION_MESSAGES = 12;
const MAX_RESOLUTION_ENTITIES_PER_MESSAGE = 5;
const MAX_RESOLUTION_BLUEPRINT_FIELDS = 12;
const MAX_RESOLUTION_USER_PROMPT_CHARS = 30_000;
const MAX_PROACTIVE_LOGS = 80;
const MAX_PROACTIVE_LOG_CONTENT_CHARS = 20_000;
const MAX_PROACTIVE_LOG_PROMPT_CHARS = 30_000;
const MAX_PROACTIVE_LOG_CONTEXT_CHARS = 50_000;
const PROACTIVE_LOG_ROW_HEIGHT = 44;
const PROACTIVE_LOG_OVERSCAN = 8;
const PROACTIVE_AGENT_CONCURRENCY = 1;
const OPENROUTER_PROACTIVE_AGENT_CONCURRENCY = 1;
const ONE_TIME_INVESTIGATION_EVENT = "omoika:one-time-investigation-log";
const PROACTIVE_PIVOT_INSTRUCTIONS_KEY = "omoika:proactive-pivot-instructions";
const PROACTIVE_RESOLUTION_SYSTEM_PROMPT = [
  "You are a graph entity-resolution worker for Omoika.",
  "Your task is to convert one queued proactive expansion target and its supplied history into unverified graph entity intents.",
  "Use the supplied graph context, proactive chat/tool history, browser observations, and Python IPC blueprint summaries. Do not perform broad OSINT pivots or produce a dossier.",
  "Treat graph context and prior assistant text as hints, not verified real-world evidence. Treat tool and browser observations as evidence only to the extent their outputs explicitly support.",
  "Prefer specific concrete entities represented by the queued target and supplied evidence: websites, domains, URLs, organizations, people, emails, IP addresses, social profiles, addresses, usernames, or similar.",
  "If the queued target is already a website or domain, resolve that target unless the supplied evidence clearly identifies a better new entity connected to it.",
  "Process each useful unresolved entity once. Skip duplicates, already-connected graph nodes, unsupported guesses, and low-value fragments.",
  "For each entity, call search_entity_types to pick the closest available blueprint, then call add_unverified_entity_to_graph once for that entity.",
  "When there are no more useful entities to submit, call ENTITY_RESOLUTION_FINISHED.",
  "Do not include per-message extraction objects, and do not include empty arrays.",
  "Keep facts flat and concrete with plain keys such as company, title, domain, url, address, email, ip, or username.",
  "After ENTITY_RESOLUTION_FINISHED, reply with only the requested concise JSON summary.",
].join("\n");

const GRAPHEXA_SCALE_ALGORITHMS = new Set([
  "graphexa.bfs",
  "graphexa.circular",
  "graphexa.kamada_kawai",
  "graphexa.multipartite",
  "graphexa.planar",
  "graphexa.investigation_hub_rings",
  "graphexa.rescale",
  "graphexa.shell",
  "graphexa.spectral",
  "graphexa.spiral",
  "graphexa.spring",
]);

const TRANSFORM_LAYOUT_OPTIONS: Array<{
  label: string;
  value: TransformLayoutAlgorithm;
  description: string;
}> = [
  {
    label: "Incremental",
    value: "transform_incremental",
    description:
      "Preserve positioned nodes, place new transform nodes, then relax them.",
  },
  {
    label: "Locked",
    value: "transform_locked",
    description:
      "Keep positioned nodes fixed and only place new transform nodes.",
  },
];

type AgentMode = "none" | "proactive";

type AgentGraphEntity = {
  id: string;
  target: string;
  prompt: string;
  systemPromptContext: string;
  orderIndex: number;
};

type ResolutionEntityHint = {
  value: string;
  kind: "url" | "domain" | "email" | "handle" | "ip" | "term";
  source: string;
};

type ResolutionEntitiesByMessage = Array<{
  message_index: number;
  message_id: string;
  message_label: string;
  entities: ResolutionEntityHint[];
}>;

type ProactiveLogTone = "sea" | "ink" | "muted" | "danger" | "success";
type ProactiveLogAction = "resolveQueuedExpansion";
type ProactiveResolutionStatus = "idle" | "resolving" | "resolved" | "failed";
type ProactiveModelLoadingStatus = {
  model: string;
  phase: "started" | "progress" | "loaded" | "failed";
  progress: number;
  message: string;
};

type ProactiveLogEntry = {
  id: string;
  kind: string;
  label: string;
  meta: string;
  content: string;
  tone: ProactiveLogTone;
  createdAt: number;
  textInk?: boolean;
  action?: ProactiveLogAction;
  entityId?: string;
  target?: string;
  prompt?: string;
  systemPromptContext?: string;
  round?: number;
  resolutionStatus?: ProactiveResolutionStatus;
  resolvedEntityId?: string;
};

type DuplicateQueueEntry = {
  nodeId: string;
  nodeLabel: string;
  blueprintLabel: string;
  queue: Record<string, unknown>[];
};

type AuditTimelineEntry = {
  id: string;
  kind: "entity" | "edge";
  label: string;
  meta: string;
  time: number | null;
  seq?: number;
  nodeId?: string;
  edgeId?: string;
};

type CaseAuditEvent = {
  seq: number;
  category: "entity" | "edge";
  event_type: "create" | "update" | "delete" | string;
  payload: Record<string, any>;
  recorded_at: string;
  actor_id?: string;
  correlation_id?: string;
};

type OneTimeInvestigationLogEvent = {
  graphId?: string;
  caseId?: string;
  status?: {
    runningTarget?: string;
    runningEntityId?: string;
    lastCompletedTarget?: string;
    lastError?: string;
  };
  entry?: Omit<ProactiveLogEntry, "id" | "createdAt">;
};

const toPositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const flattenBlueprintElements = (elements: any[] = []) =>
  elements.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const clampProgress = (value: number | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const truncateLogText = (value: string, maxLength = 1600) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const formatLogValue = (value: unknown, maxLength = 1600) => {
  if (value == null) return "";
  if (typeof value === "string") return truncateLogText(value, maxLength);
  try {
    return truncateLogText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncateLogText(String(value), maxLength);
  }
};

const formatBrowserResult = (result: unknown, maxLength = 1600) => {
  if (result == null || typeof result !== "object")
    return formatLogValue(result, maxLength);
  const r = result as Record<string, unknown>;
  if ("ok" in r && "id" in r && "data" in r) {
    const { data, page } = r;
    return formatLogValue(page ? { data, page } : data, maxLength);
  }
  return formatLogValue(result, maxLength);
};

const compactProactiveLogEntry = (
  entry: ProactiveLogEntry,
): ProactiveLogEntry => ({
  ...entry,
  content: truncateLogText(
    entry.content ?? "",
    MAX_PROACTIVE_LOG_CONTENT_CHARS,
  ),
  prompt: entry.prompt
    ? truncateLogText(entry.prompt, MAX_PROACTIVE_LOG_PROMPT_CHARS)
    : entry.prompt,
  systemPromptContext: entry.systemPromptContext
    ? truncateLogText(
        entry.systemPromptContext,
        MAX_PROACTIVE_LOG_CONTEXT_CHARS,
      )
    : entry.systemPromptContext,
});

const BROWSER_TOOL_NAMES = new Set([
  "open_page",
  "read_page",
  "list_links",
  "click_element",
  "fill_input",
  "wait_for_match",
  "web_search",
]);

const extractBrowserToolName = (label: string) => {
  const match = label.match(/^Tool result:\s*(.+)$/);
  return match?.[1]?.trim() ?? "";
};

const buildProactiveBrowserObservationContext = (
  logs: ProactiveLogEntry[],
  currentEntity?: Pick<AgentGraphEntity, "id" | "target">,
) => {
  const observations = logs
    .filter((log) => {
      if (log.kind !== "tool") return false;
      const toolName = extractBrowserToolName(log.label);
      return BROWSER_TOOL_NAMES.has(toolName);
    })
    .slice(-16)
    .map((log) => {
      const toolName = extractBrowserToolName(log.label);
      return [
        `- tool: ${toolName}`,
        log.meta ? `  status: ${log.meta}` : undefined,
        log.target ? `  target: ${log.target}` : undefined,
        `  observed: ${truncateAosintTraceText(log.content, 900)}`,
      ]
        .filter(Boolean)
        .join("\n");
    });

  if (!observations.length) return "";

  return [
    "Recent browser-agent observations from proactive intelligence runs:",
    currentEntity
      ? `Use these to avoid repeating searches and to bias pivots for current target "${currentEntity.target}" (${currentEntity.id}).`
      : undefined,
    observations.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
};

const formatLogTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const cloneAuditValue = <T,>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

const normalizeAgentProvider = (
  value: AgentProvider | string | null | undefined,
): AgentProvider => (value === "openrouter" ? "openrouter" : "lmstudio");

const formatAgentValue = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatAgentValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    try {
      return truncateAosintTraceText(JSON.stringify(value), 8_000);
    } catch {
      return "";
    }
  }
  return "";
};

const getEntityPrimaryValue = (node: Node, blueprints: any) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const entityType = formatAgentValue(data.label);
  const blueprint =
    entityType && blueprints && typeof blueprints === "object"
      ? blueprints[entityType]
      : null;

  const primaryElement = flattenBlueprintElements(blueprint?.elements ?? [])
    .map((element: any) =>
      typeof element?.label === "string" ? toSnakeCase(element.label) : "",
    )
    .find((key: string) => key && formatAgentValue(data[key]));

  if (primaryElement) return formatAgentValue(data[primaryElement]);

  const preferredKeys = [
    "name",
    "title",
    "value",
    "url",
    "domain",
    "email",
    "username",
    "handle",
    "ip",
    "address",
  ];
  for (const key of preferredKeys) {
    const value = formatAgentValue(data[key]);
    if (value) return value;
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === "label" || key.startsWith("__")) continue;
    const formatted = formatAgentValue(value);
    if (formatted) return formatted;
  }

  return entityType || node.id;
};

const buildAgentEntitySummary = (node: Node, blueprints: any) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const entityType = formatAgentValue(data.label);
  const primaryValue = getEntityPrimaryValue(node, blueprints);
  const fields = Object.entries(data)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => [key, formatAgentValue(value)] as const)
    .filter(([, value]) => value)
    .slice(0, 12)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return [
    entityType ? `Entity type: ${entityType}` : undefined,
    `Primary value: ${primaryValue}`,
    fields ? `Known fields:\n${fields}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
};

const buildAgentNeighborSummary = (node: Node, blueprints: any) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const entityType = formatAgentValue(data.label);
  const primaryValue = getEntityPrimaryValue(node, blueprints);
  const fields = Object.entries(data)
    .filter(([key]) => key !== "label" && !key.startsWith("__"))
    .map(([key, value]) => [key, formatAgentValue(value)] as const)
    .filter(([, value]) => value)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return [
    primaryValue,
    entityType ? `type: ${entityType}` : undefined,
    fields || undefined,
  ]
    .filter(Boolean)
    .join(" | ");
};

const formatAgentEdgeValue = (edge: Edge) => {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const candidates = [
    data.label,
    data.type,
    edge.label,
    edge.id ? `edge ${edge.id}` : undefined,
  ];
  return formatAgentValue(
    candidates.find((candidate) => formatAgentValue(candidate)),
  );
};

const buildDirectedGraphNeighborhoodContext = (
  node: Node,
  nodesById: Map<string, Node>,
  edges: Edge[],
  blueprints: any,
) => {
  const incoming = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => {
      const sourceNode = nodesById.get(edge.source);
      if (!sourceNode) return null;
      return `- ${buildAgentNeighborSummary(sourceNode, blueprints)} (${formatAgentEdgeValue(edge)} -> current)`;
    })
    .filter(Boolean)
    .slice(0, 12);

  const outgoing = edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => {
      const targetNode = nodesById.get(edge.target);
      if (!targetNode) return null;
      return `- ${buildAgentNeighborSummary(targetNode, blueprints)} (current -> ${formatAgentEdgeValue(edge)})`;
    })
    .filter(Boolean)
    .slice(0, 12);

  return [
    incoming.length
      ? `Incoming nodes (edges where another node points to the current entity):\n${incoming.join("\n")}`
      : "Incoming nodes: none in the current graph.",
    outgoing.length
      ? `Outgoing nodes (edges where the current entity points to another node):\n${outgoing.join("\n")}`
      : "Outgoing nodes: none in the current graph.",
  ].join("\n\n");
};

const buildAgentGraphContext = (graph?: Graph | null) => {
  const title = graph?.label?.trim();
  const description = graph?.description?.trim();
  return [
    title ? `Graph title: ${title}` : undefined,
    description ? `Graph description: ${description}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
};

const getNodeCreatedTime = (node: Node) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const nodeRecord = node as unknown as Record<string, unknown>;
  const candidates = [
    nodeRecord.ctime,
    nodeRecord.created_at,
    nodeRecord.createdAt,
    nodeRecord.sys_from,
    nodeRecord.valid_from,
    data.ctime,
    data.created_at,
    data.createdAt,
    data.sys_from,
    data.valid_from,
  ];

  for (const candidate of candidates) {
    const formatted = formatAgentValue(candidate);
    if (!formatted) continue;
    const time = new Date(formatted).getTime();
    if (Number.isFinite(time)) return time;
  }

  return null;
};

const getEdgeCreatedTime = (edge: Edge) => {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  const edgeRecord = edge as unknown as Record<string, unknown>;
  const candidates = [
    edgeRecord.ctime,
    edgeRecord.created_at,
    edgeRecord.createdAt,
    edgeRecord.sys_from,
    edgeRecord.valid_from,
    data.ctime,
    data.created_at,
    data.createdAt,
    data.sys_from,
    data.valid_from,
  ];

  for (const candidate of candidates) {
    const formatted = formatAgentValue(candidate);
    if (!formatted) continue;
    const time = new Date(formatted).getTime();
    if (Number.isFinite(time)) return time;
  }

  return null;
};

const getAgentGraphEntities = (
  nodes: Node[],
  edges: Edge[],
  blueprints: any,
  graph?: Graph | null,
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return nodes
    .map((node, orderIndex) => ({ node, orderIndex }))
    .filter(({ node }) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      return data.__nodeType !== "markdown";
    })
    .sort((a, b) => {
      const aTime = getNodeCreatedTime(a.node);
      const bTime = getNodeCreatedTime(b.node);

      if (aTime !== null && bTime !== null && aTime !== bTime) {
        return aTime - bTime;
      }
      if (aTime !== null && bTime === null) return 1;
      if (aTime === null && bTime !== null) return -1;
      return a.orderIndex - b.orderIndex;
    })
    .map(({ node, orderIndex }) => {
      const target = getEntityPrimaryValue(node, blueprints);
      const graphContext = buildAgentGraphContext(graph);
      const entitySummary = buildAgentEntitySummary(node, blueprints);
      const neighborhoodContext = buildDirectedGraphNeighborhoodContext(
        node,
        nodesById,
        edges,
        blueprints,
      );
      const systemPromptContext = [
        "The active investigation target is one node in a directed React Flow graph.",
        "Use this graph neighborhood as investigation context, not as verified real-world evidence. Validate important claims with tools.",
        graphContext ? `Current graph context:\n${graphContext}` : undefined,
        `Current entity:\n${entitySummary}`,
        neighborhoodContext,
      ]
        .filter(Boolean)
        .join("\n\n");
      const prompt = [
        "Search for public, evidence-backed expansions for this graph entity.",
        "Find related entities, aliases, accounts, organizations, domains, contact points, infrastructure, and next validation leads.",
        "Prefer direct observations from tools. Separate facts, inferences, unknowns, and suggested graph additions.",
        "Use the current graph neighborhood in the system prompt to prioritize pivots, disambiguate aliases, and avoid duplicating already-connected nodes.",
        "",
        entitySummary,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        id: node.id,
        target,
        prompt,
        systemPromptContext,
        orderIndex,
      };
    })
    .filter((entity) => entity.target.trim()) satisfies AgentGraphEntity[];
};

const orderAgentGraphEntities = (
  entities: AgentGraphEntity[],
  orderedIds: string[],
) => {
  if (!orderedIds.length) return entities;

  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((entity): entity is AgentGraphEntity => Boolean(entity));
  const orderedSet = new Set(ordered.map((entity) => entity.id));
  const remaining = entities.filter((entity) => !orderedSet.has(entity.id));

  return [...ordered, ...remaining];
};

const mergeSystemPrompt = (
  savedSystemPrompt: string | undefined,
  graphContext: string | undefined,
) => {
  const trimmedGraphContext = graphContext?.trim();
  const basePrompt = savedSystemPrompt?.trim() || DEFAULT_OSINT_SYSTEM_PROMPT;
  if (!trimmedGraphContext) return savedSystemPrompt?.trim() || undefined;

  return [
    basePrompt,
    "",
    "Current graph intelligence context:",
    trimmedGraphContext,
  ].join("\n");
};

const buildResolutionSystemPrompt = (graphContext: string | undefined) => {
  const trimmedGraphContext = graphContext?.trim();
  if (!trimmedGraphContext) return PROACTIVE_RESOLUTION_SYSTEM_PROMPT;

  return [
    PROACTIVE_RESOLUTION_SYSTEM_PROMPT,
    "",
    "Current graph intelligence context:",
    trimmedGraphContext,
  ].join("\n");
};

const formatSentPromptLog = ({
  systemPrompt,
  userPrompt,
  nearEndUserPrompt,
}: {
  systemPrompt?: string;
  userPrompt: string;
  nearEndUserPrompt?: string;
}) =>
  [
    "System prompt:",
    systemPrompt?.trim() || DEFAULT_OSINT_SYSTEM_PROMPT,
    "",
    "User prompt:",
    userPrompt,
    nearEndUserPrompt ? "" : undefined,
    nearEndUserPrompt ? "Near-end user prompt:" : undefined,
    nearEndUserPrompt,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

const mergeUserPrompt = (currentPrompt: string, savedUserPrompt?: string) => {
  const saved = savedUserPrompt?.trim();
  if (!saved) return currentPrompt;
  return [currentPrompt, "", "Additional user instructions:", saved].join("\n");
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseAgentResolutionJson = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(),
    trimmed.match(/\{[\s\S]*\}/)?.[0]?.trim(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return isRecord(parsed) ? parsed : null;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
};

const normalizeResolvedReactFlowCandidates = (
  parsedResolution: Record<string, any> | null,
  relevantBlueprints: Record<string, unknown>,
  fallbackTarget: string,
) => {
  const blueprintLabels = Object.keys(relevantBlueprints);
  const fallbackLabel = blueprintLabels[0] ?? "Unverified Agent Resolution";
  const rawEntities = Array.isArray(parsedResolution?.reactflow_entities)
    ? parsedResolution?.reactflow_entities
    : Array.isArray(parsedResolution?.entities)
      ? parsedResolution?.entities
      : parsedResolution
        ? [parsedResolution]
        : [];

  return rawEntities.filter(isRecord).map((entity) => {
    const requestedType = formatAgentValue(
      entity.entity_type ?? entity.label ?? entity.type,
    );
    const entityType =
      requestedType && blueprintLabels.includes(requestedType)
        ? requestedType
        : fallbackLabel;
    const fields = isRecord(entity.fields) ? entity.fields : {};
    const data = isRecord(entity.data)
      ? { ...entity.data }
      : {
          ...fields,
        };
    const displayName =
      formatAgentValue(entity.display_name) ||
      formatAgentValue(entity.name) ||
      fallbackTarget;

    const evidence = Array.isArray(entity.evidence) ? entity.evidence : [];
    const evidenceCitations = normalizeEvidenceCitations(evidence, {
      fallbackObservation:
        formatAgentValue(entity.graph_reason) ||
        formatAgentValue(entity.summary) ||
        displayName,
      confidence: entity.confidence,
      toolName: ADD_UNVERIFIED_ENTITY_TOOL,
    });

    return {
      entity_type: entityType,
      label: entityType,
      display_name: displayName,
      confidence: entity.confidence ?? null,
      data: {
        label: entityType,
        name: displayName,
        ...data,
      },
      evidence,
      evidence_citations: evidenceCitations,
      citation_status: getCitationStatus(evidenceCitations),
      unknowns: Array.isArray(entity.unknowns) ? entity.unknowns : [],
      graph_reason: formatAgentValue(entity.graph_reason),
    };
  });
};

const getBlueprintFieldKeys = (blueprint: any) =>
  new Set(
    flattenBlueprintElements(blueprint?.elements ?? [])
      .map((element: any) =>
        typeof element?.label === "string" ? toSnakeCase(element.label) : "",
      )
      .filter(Boolean),
  );

const getBlueprintFieldKeyList = (blueprint: any) =>
  flattenBlueprintElements(blueprint?.elements ?? [])
    .map((element: any) =>
      typeof element?.label === "string" ? toSnakeCase(element.label) : "",
    )
    .filter(Boolean);

const getResolutionEntities = (
  parsedResolution: Record<string, any> | null,
) => {
  const rawEntities = Array.isArray(parsedResolution?.reactflow_entities)
    ? parsedResolution?.reactflow_entities
    : Array.isArray(parsedResolution?.entities)
      ? parsedResolution?.entities
      : parsedResolution
        ? [parsedResolution]
        : [];

  return rawEntities.filter(isRecord);
};

const getResolutionCandidateIssues = (
  candidate: Record<string, any>,
  blueprints: Record<string, unknown>,
) => {
  const issues: string[] = [];
  const entityType = formatAgentValue(
    candidate.entity_type ?? candidate.label ?? candidate.type,
  );
  const blueprint = entityType ? blueprints[entityType] : null;
  const data = isRecord(candidate.data) ? candidate.data : null;

  if (!entityType) {
    issues.push("entity_type is missing");
  } else if (!blueprint) {
    issues.push(
      `entity_type "${entityType}" is not an available entity schema`,
    );
  }

  if (!data) {
    issues.push("data must be an object");
  } else if (formatAgentValue(data.label) !== entityType) {
    issues.push("data.label must exactly equal entity_type");
  }

  if (data && blueprint) {
    const fieldKeys = getBlueprintFieldKeys(blueprint);
    const customKeys = Object.keys(data).filter(
      (key) =>
        !["label", "name", "title"].includes(key) && !key.startsWith("__"),
    );
    const unknownKeys = customKeys.filter((key) => !fieldKeys.has(key));
    if (fieldKeys.size > 0 && customKeys.length > 0 && unknownKeys.length) {
      issues.push(
        `data contains fields outside the "${entityType}" schema: ${unknownKeys.join(", ")}`,
      );
    }
  }

  return issues;
};

const getSchemaValidResolutionCandidates = (
  candidates: Record<string, any>[],
  blueprints: Record<string, unknown>,
) =>
  candidates.filter(
    (candidate) =>
      getResolutionCandidateIssues(candidate, blueprints).length === 0,
  );

const getResolutionCandidateKey = (candidate: Record<string, any>) =>
  [
    formatAgentValue(candidate.entity_type),
    formatAgentValue(candidate.display_name),
    formatAgentValue(candidate.data?.name),
    formatAgentValue(candidate.data?.title),
    JSON.stringify(candidate.data ?? {}),
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

const buildResolutionValidationFeedback = (
  candidates: Record<string, any>[],
  blueprints: Record<string, unknown>,
) => {
  if (!candidates.length) {
    return [
      "No React Flow candidate was returned.",
      `Call ${SEARCH_ENTITY_TYPES_TOOL} to inspect available schemas, then call ${ADD_UNVERIFIED_ENTITY_TOOL} with a schema-valid candidate.`,
    ].join(" ");
  }

  return candidates
    .map((candidate, index) => {
      const label =
        formatAgentValue(
          candidate.entity_type ?? candidate.label ?? candidate.type,
        ) || `candidate ${index + 1}`;
      const issues = getResolutionCandidateIssues(candidate, blueprints);
      return issues.length
        ? `${label}: ${issues.join("; ")}`
        : `${label}: schema-valid`;
    })
    .join("\n");
};

const parseToolMessageJson = (content?: string | null) => {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getConversationTrace = (messages: OpenAIChatMessage[] = []) =>
  messages.map((message, index) => ({
    index,
    role: message.role,
    content: truncateAosintTraceText(message.content ?? ""),
    tool_call_id: message.tool_call_id,
    tool_calls: message.tool_calls?.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments:
        parseAgentResolutionJson(
          truncateAosintTraceText(call.function.arguments ?? "{}", 24_000),
        ) ?? {},
    })),
  }));

const getUnverifiedEntityToolSubmissions = (
  messages: OpenAIChatMessage[] = [],
) => {
  const submissions: Record<string, any>[] = [];

  for (const message of messages) {
    if (message.role !== "tool") continue;

    const parsed = parseToolMessageJson(message.content);
    if (
      parsed?.ok === true &&
      parsed.toolName === ADD_UNVERIFIED_ENTITY_TOOL &&
      isRecord(parsed.entity)
    ) {
      submissions.push(parsed.entity);
    }
  }

  if (submissions.length) return submissions;

  for (const message of messages) {
    for (const call of message.tool_calls ?? []) {
      if (call.function.name !== ADD_UNVERIFIED_ENTITY_TOOL) continue;
      const parsed = parseAgentResolutionJson(call.function.arguments ?? "{}");
      if (isRecord(parsed)) submissions.push(parsed);
    }
  }

  return submissions;
};

const getUnverifiedEntityToolSubmissionFromEvent = (
  event: AosintWorkflowEvent,
) => {
  if (
    event.type !== "tool_result" ||
    event.toolName !== ADD_UNVERIFIED_ENTITY_TOOL ||
    !event.ok ||
    !isRecord(event.result)
  ) {
    return null;
  }

  return event.result.ok === true &&
    event.result.toolName === ADD_UNVERIFIED_ENTITY_TOOL &&
    isRecord(event.result.entity)
    ? event.result.entity
    : null;
};

const hasEntityResolutionFinished = (
  messages: OpenAIChatMessage[] = [],
  finalAnswer = "",
) => {
  if (finalAnswer.includes(ENTITY_RESOLUTION_FINISHED_TOOL)) return true;

  return messages.some((message) => {
    if (message.role === "tool") {
      const parsed = parseToolMessageJson(message.content);
      return (
        parsed?.ok === true &&
        (parsed.toolName === ENTITY_RESOLUTION_FINISHED_TOOL ||
          parsed.status === "entity_resolution_finished")
      );
    }

    return (message.tool_calls ?? []).some(
      (call) => call.function.name === ENTITY_RESOLUTION_FINISHED_TOOL,
    );
  });
};

const dedupeResolutionSubmissions = (submissions: Record<string, any>[]) => {
  const seen = new Set<string>();
  const deduped: Record<string, any>[] = [];

  for (const submission of submissions) {
    const key = [
      formatAgentValue(submission.name),
      formatAgentValue(submission.display_name),
      formatAgentValue(submission.suggested_entity_type),
      formatAgentValue(submission.entity_type),
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(submission);
  }

  return deduped;
};

const normalizeToolSubmittedCandidate = (
  submission: Record<string, any> | null,
  blueprints: Record<string, unknown>,
  fallbackTarget: string,
) => {
  if (!submission) return [];

  const displayName =
    formatAgentValue(submission.display_name) ||
    formatAgentValue(submission.name) ||
    fallbackTarget;
  const requestedType =
    formatAgentValue(submission.entity_type) ||
    formatAgentValue(submission.suggested_entity_type) ||
    formatAgentValue(submission.label) ||
    formatAgentValue(submission.type);
  const exactType =
    requestedType && blueprints[requestedType]
      ? requestedType
      : Object.keys(blueprints).find(
          (label) => label.toLowerCase() === requestedType.toLowerCase(),
        );
  const facts = {
    ...(isRecord(submission.facts) ? submission.facts : {}),
    ...(isRecord(submission.fields) ? submission.fields : {}),
    ...(isRecord(submission.data) ? submission.data : {}),
  };
  const tokenText = [
    fallbackTarget,
    displayName,
    requestedType,
    submission.summary,
    submission.graph_reason,
    submission.notes,
    ...Object.keys(facts),
    ...Object.values(facts).map(formatAgentValue),
    ...(Array.isArray(submission.evidence) ? submission.evidence : []),
    ...(Array.isArray(submission.unknowns) ? submission.unknowns : []),
  ]
    .map(formatAgentValue)
    .filter(Boolean)
    .join(" ");
  const tokens = new Set(
    tokenText
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2),
  );
  const entityType =
    exactType ||
    Object.entries(blueprints)
      .map(([label, blueprint]) => ({
        label,
        score: scoreResolutionBlueprint(
          label,
          blueprint,
          tokens,
          requestedType,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))[0]
      ?.label ||
    Object.keys(blueprints)[0] ||
    "Unverified Agent Resolution";
  const blueprint = blueprints[entityType];
  const fieldKeys = getBlueprintFieldKeyList(blueprint);
  const fieldKeySet = new Set(fieldKeys);
  const fields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(facts)) {
    if (value == null || value === "") continue;
    const normalizedKey = toSnakeCase(key);
    if (fieldKeySet.has(normalizedKey)) {
      fields[normalizedKey] = value;
    }
  }

  if (fieldKeys[0] && fields[fieldKeys[0]] == null && displayName) {
    fields[fieldKeys[0]] = displayName;
  }

  const data = {
    label: entityType,
    name: displayName,
    title: displayName,
    ...fields,
  };

  const evidence = Array.isArray(submission.evidence)
    ? submission.evidence
    : [];
  const evidenceCitations = normalizeEvidenceCitations(evidence, {
    fallbackObservation:
      formatAgentValue(submission.graph_reason) ||
      formatAgentValue(submission.summary) ||
      formatAgentValue(submission.notes) ||
      displayName,
    confidence: submission.confidence,
    toolName: ADD_UNVERIFIED_ENTITY_TOOL,
  });

  return [
    {
      entity_type: entityType,
      label: entityType,
      display_name: displayName,
      confidence: submission.confidence ?? null,
      fields,
      data,
      evidence,
      evidence_citations: evidenceCitations,
      citation_status: getCitationStatus(evidenceCitations),
      unknowns: Array.isArray(submission.unknowns) ? submission.unknowns : [],
      graph_reason:
        formatAgentValue(submission.graph_reason) ||
        formatAgentValue(submission.summary) ||
        formatAgentValue(submission.notes),
      submitted_intent: submission,
    },
  ];
};

const buildRuntimeEntityTypeContext = (blueprints: any) => {
  if (!isRecord(blueprints)) return [];

  return Object.entries<any>(blueprints)
    .map(([label, blueprint]) => ({
      label,
      description: formatAgentValue(blueprint?.description),
      category: formatAgentValue(blueprint?.category),
      fields: flattenBlueprintElements(blueprint?.elements ?? [])
        .map((element: any) =>
          typeof element?.label === "string" ? toSnakeCase(element.label) : "",
        )
        .filter(Boolean)
        .slice(0, 30),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getNodeEntityType = (node?: Node | null) =>
  formatAgentValue((node?.data as Record<string, unknown> | undefined)?.label);

const addResolutionHint = (
  hints: Map<string, ResolutionEntityHint>,
  value: string,
  kind: ResolutionEntityHint["kind"],
  source: string,
) => {
  const trimmed = value.trim().replace(/[),.;:]+$/, "");
  if (trimmed.length < 3) return;
  const key = `${kind}:${trimmed.toLowerCase()}`;
  if (!hints.has(key)) hints.set(key, { value: trimmed, kind, source });
};

const MESSAGE_ENTITY_PATTERNS: Array<[ResolutionEntityHint["kind"], RegExp]> = [
  ["url", /https?:\/\/[^\s"'<>]+/gi],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["ip", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ["handle", /@[A-Z0-9_][A-Z0-9_.-]{2,}/gi],
  ["domain", /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi],
];

const extractEntitiesFromMessageText = (
  text: string,
  source: string,
  limit = 12,
) => {
  const hints = new Map<string, ResolutionEntityHint>();

  for (const [kind, pattern] of MESSAGE_ENTITY_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      addResolutionHint(hints, match[0], kind, source);
      if (hints.size >= limit) break;
    }
  }

  const quotedTerms = text.match(/["'`]([^"'`\n]{3,96})["'`]/g) ?? [];
  for (const term of quotedTerms) {
    addResolutionHint(
      hints,
      term.replace(/^["'`]|["'`]$/g, ""),
      "term",
      source,
    );
    if (hints.size >= limit) break;
  }

  return [...hints.values()].slice(0, limit);
};

const extractResolutionEntitiesByMessage = (
  logs: ProactiveLogEntry[],
  entry: Pick<ProactiveLogEntry, "id" | "target" | "content" | "createdAt">,
) =>
  logs
    .filter((log) => log.id === entry.id || log.createdAt <= entry.createdAt)
    .slice(-40)
    .map((log, index) => {
      const text = [log.label, log.meta, log.target, log.content]
        .filter(Boolean)
        .join("\n");
      const entities = extractEntitiesFromMessageText(
        text,
        `proactive_message:${log.id}`,
      );
      return {
        message_index: index,
        message_id: log.id,
        message_label: log.label,
        entities,
      };
    })
    .filter((entry) => entry.entities.length > 0);

const compactResolutionHints = (hints: ResolutionEntityHint[]) => {
  const seen = new Set<string>();
  const compacted: ResolutionEntityHint[] = [];

  for (const hint of hints) {
    const value = truncateAosintTraceText(formatAgentValue(hint.value), 160);
    if (!value) continue;
    const key = `${hint.kind}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compacted.push({
      value,
      kind: hint.kind,
      source: truncateAosintTraceText(formatAgentValue(hint.source), 120),
    });
    if (compacted.length >= MAX_RESOLUTION_HINTS) break;
  }

  return compacted;
};

const compactResolutionEntitiesByMessage = (
  messages: ResolutionEntitiesByMessage,
): ResolutionEntitiesByMessage =>
  messages
    .slice(-MAX_RESOLUTION_MESSAGES)
    .map((message, index) => ({
      message_index: index,
      message_id: truncateAosintTraceText(message.message_id, 120),
      message_label: truncateAosintTraceText(message.message_label, 120),
      entities: compactResolutionHints(message.entities).slice(
        0,
        MAX_RESOLUTION_ENTITIES_PER_MESSAGE,
      ),
    }))
    .filter((message) => message.entities.length > 0);

const buildCompactResolutionBlueprintContext = (
  blueprints: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(blueprints).map(([label, blueprint]) => {
      const record = isRecord(blueprint) ? blueprint : {};
      return [
        label,
        {
          description: truncateAosintTraceText(
            formatAgentValue(record.description),
            500,
          ),
          category: truncateAosintTraceText(
            formatAgentValue(record.category),
            160,
          ),
          fields: (Array.isArray(record.fields)
            ? record.fields.map(formatAgentValue)
            : flattenBlueprintElements(record.elements as any[]).map(
                (element: any) =>
                  typeof element?.label === "string"
                    ? toSnakeCase(element.label)
                    : "",
              )
          )
            .filter(Boolean)
            .slice(0, MAX_RESOLUTION_BLUEPRINT_FIELDS),
        },
      ];
    }),
  );

const extractResolutionEntityHints = (
  logs: ProactiveLogEntry[],
  entry: Pick<ProactiveLogEntry, "id" | "target" | "content" | "createdAt">,
  sourceNode: Node | undefined,
  blueprints: any,
) => {
  const hints = new Map<string, ResolutionEntityHint>();
  const target = formatAgentValue(entry.target || entry.content);
  if (target) addResolutionHint(hints, target, "term", "queued_target");

  if (sourceNode) {
    const sourceLabel = getNodeEntityType(sourceNode);
    const sourceValue = getEntityPrimaryValue(sourceNode, blueprints);
    if (sourceLabel)
      addResolutionHint(hints, sourceLabel, "term", "source_type");
    if (sourceValue)
      addResolutionHint(hints, sourceValue, "term", "source_entity");
  }

  const conversationText = logs
    .filter((log) => log.id === entry.id || log.createdAt <= entry.createdAt)
    .slice(-40)
    .map((log) =>
      [
        log.label,
        log.meta,
        log.target,
        truncateAosintTraceText(log.content, 20_000),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  for (const [kind, pattern] of MESSAGE_ENTITY_PATTERNS) {
    for (const match of conversationText.matchAll(pattern)) {
      addResolutionHint(hints, match[0], kind, "proactive_history");
      if (hints.size >= 60) break;
    }
  }

  return [...hints.values()].slice(0, 40);
};

const buildResolutionHistoryContext = (hints: ResolutionEntityHint[]) => {
  if (!hints.length) return "No prior proactive entities were extracted.";
  return hints
    .map((hint) => `- ${hint.kind}: ${hint.value} (${hint.source})`)
    .join("\n");
};

const scoreResolutionBlueprint = (
  label: string,
  blueprint: any,
  tokens: Set<string>,
  sourceLabel: string,
) => {
  const normalizedLabel = label.toLowerCase();
  let score = normalizedLabel === sourceLabel.toLowerCase() ? 120 : 0;

  for (const token of tokens) {
    if (normalizedLabel === token) score += 18;
    else if (normalizedLabel.includes(token)) score += 8;
  }

  const searchableParts = [
    blueprint?.description,
    blueprint?.category,
    blueprint?.author,
    ...flattenBlueprintElements(blueprint?.elements ?? []).map(
      (element: any) => element?.label,
    ),
  ]
    .map((value) => formatAgentValue(value).toLowerCase())
    .filter(Boolean);

  for (const token of tokens) {
    if (searchableParts.some((part) => part.includes(token))) score += 3;
  }

  return score;
};

const getRelevantResolutionBlueprints = (
  entity: Pick<ProactiveLogEntry, "target" | "entityId">,
  sourceNode: Node | undefined,
  blueprints: any,
  hints: ResolutionEntityHint[] = [],
) => {
  if (!isRecord(blueprints)) return {};

  const sourceLabel = getNodeEntityType(sourceNode);
  const tokens = new Set(
    [
      entity.target,
      sourceLabel,
      ...hints.flatMap((hint) => [hint.value, hint.kind]),
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2),
  );

  const scored = Object.entries(blueprints)
    .map(([label, blueprint]) => ({
      label,
      blueprint,
      score: scoreResolutionBlueprint(label, blueprint, tokens, sourceLabel),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, MAX_RESOLUTION_BLUEPRINTS);

  const selected = scored.length
    ? scored
    : sourceLabel && blueprints[sourceLabel]
      ? [{ label: sourceLabel, blueprint: blueprints[sourceLabel], score: 1 }]
      : Object.entries(blueprints)
          .slice(0, MAX_RESOLUTION_BLUEPRINTS)
          .map(([label, blueprint]) => ({ label, blueprint, score: 0 }));

  return selected.reduce<Record<string, unknown>>((acc, entry) => {
    acc[entry.label] = entry.blueprint;
    return acc;
  }, {});
};

const buildResolutionPrompt = ({
  entry,
  sourceNode,
  blueprints,
  relevantBlueprints,
  extractedHints,
  extractedEntitiesByMessage,
  browserObservationContext,
}: {
  entry: ProactiveLogEntry;
  sourceNode: Node | undefined;
  blueprints: any;
  relevantBlueprints: Record<string, unknown>;
  extractedHints: ResolutionEntityHint[];
  extractedEntitiesByMessage: ResolutionEntitiesByMessage;
  browserObservationContext?: string;
}) =>
  [
    "Resolve this Proactive Intelligence queued expansion in one compact pass.",
    "Use the prior proactive chat/entity hints below plus the Python IPC blueprints to identify useful unverified entity intents.",
    "You do not need to produce blueprint-ready React Flow data; the app will map your submitted intent into the closest local blueprint.",
    `For each useful entity, call ${SEARCH_ENTITY_TYPES_TOOL} to search the Python IPC plugin blueprints for the appropriate entity_type, then call ${ADD_UNVERIFIED_ENTITY_TOOL} with: name, optional suggested_entity_type, optional display_name, confidence, facts, evidence, unknowns, and graph_reason.`,
    `Keep submitting entities until the queued target and supplied hints have been processed. When done, call ${ENTITY_RESOLUTION_FINISHED_TOOL}.`,
    "Put concrete extracted attributes in facts using plain keys such as company, title, domain, url, address, or username. Do not include empty arrays or per-message extraction objects.",
    "After the finish tool call, provide a concise final JSON summary using this shape: { entities: [{ name, suggested_entity_type, display_name, confidence, facts, evidence, unknowns, graph_reason }], finished: true }.",
    "Do not write to the database directly and do not browse unless the provided history is insufficient; the app will save an unverified node containing your tool call and trace.",
    "",
    `Queued expansion target: ${entry.target ?? entry.content}`,
    `Source node id: ${entry.entityId ?? "unknown"}`,
    sourceNode
      ? `Source entity:\n${buildAgentEntitySummary(sourceNode, blueprints)}`
      : undefined,
    "",
    "Extracted proactive conversation/entity hints:",
    buildResolutionHistoryContext(compactResolutionHints(extractedHints)),
    "",
    "Extracted entities by proactive message:",
    formatLogValue(
      compactResolutionEntitiesByMessage(extractedEntitiesByMessage),
      4_000,
    ),
    "",
    "Recent browser-agent observations:",
    browserObservationContext || "No browser observations captured.",
    "",
    "Relevant JSON blueprints from Python IPC worker:",
    formatLogValue(
      buildCompactResolutionBlueprintContext(relevantBlueprints),
      4_000,
    ),
  ]
    .filter(Boolean)
    .join("\n");

const buildNearEndResolutionPrompt = (
  extractedEntitiesByMessage: ResolutionEntitiesByMessage,
) =>
  [
    `Continue resolving any remaining useful entities. For each one, search for an appropriate entity type with ${SEARCH_ENTITY_TYPES_TOOL}, then call ${ADD_UNVERIFIED_ENTITY_TOOL}.`,
    "Use search results from the Python IPC plugin blueprints only as hints.",
    `When all useful entities have been submitted, call ${ENTITY_RESOLUTION_FINISHED_TOOL}.`,
    `Each ${ADD_UNVERIFIED_ENTITY_TOOL} call requires name. Helpful optional fields: suggested_entity_type, display_name, confidence, facts, evidence, unknowns, graph_reason.`,
    "Do not send extracted_entities_by_message or empty arrays; the app already captured per-message hints and will map your intent to a blueprint.",
    "",
    "Per-message extracted entity candidates:",
    formatLogValue(
      compactResolutionEntitiesByMessage(extractedEntitiesByMessage),
      3_000,
    ),
  ].join("\n");

const buildInlineGraphCapturePrompt = ({
  target,
  browserObservationContext,
}: {
  target: string;
  browserObservationContext?: string;
}) =>
  [
    "Graph capture instructions:",
    `As soon as you find a useful entity connected to ${target}, call ${SEARCH_ENTITY_TYPES_TOOL} to choose the closest available local blueprint, then immediately call ${ADD_UNVERIFIED_ENTITY_TOOL}.`,
    "Do this during the investigation, not at the end. Submit each concrete entity once when evidence appears.",
    "Useful entities include websites, domains, URLs, organizations, people, emails, IP addresses, social profiles, addresses, usernames, and strong aliases.",
    "Skip duplicates, unsupported guesses, low-value fragments, and entities already represented in the supplied graph neighborhood.",
    "Use name plus concise evidence. Helpful optional fields: suggested_entity_type, display_name, confidence, facts, evidence, unknowns, and graph_reason.",
    "Keep facts flat and concrete with plain keys such as company, title, domain, url, address, email, ip, or username. Do not include empty arrays or per-message extraction objects.",
    browserObservationContext
      ? `Recent browser-agent observations:\n${browserObservationContext}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

const buildWorkflowLogEntry = (
  event: AosintWorkflowEvent,
  currentRound?: number | null,
): ProactiveLogEntry | null => {
  const createdAt = Date.now();
  const eventRound =
    "round" in event && typeof event.round === "number"
      ? event.round
      : currentRound || undefined;
  const base = {
    id: `${createdAt}-${Math.random().toString(16).slice(2)}`,
    createdAt,
    round: eventRound,
  };

  switch (event.type) {
    case "agent_start":
      return {
        ...base,
        kind: "agent",
        label: "Agent started",
        meta: event.model,
        content: `${event.messageCount} messages loaded. Max turns: ${event.maxTurns}.`,
        tone: "sea",
      };
    case "model_loading":
      if (event.phase === "progress") return null;
      return {
        ...base,
        kind: "agent",
        label:
          event.phase === "failed"
            ? "Model load failed"
            : event.phase === "loaded"
              ? "Model ready"
              : "Loading model",
        meta: event.model,
        content:
          event.message ||
          (event.phase === "loaded"
            ? "LM Studio model ready."
            : "Loading LM Studio model."),
        tone: event.phase === "failed" ? "danger" : "sea",
      };
    case "round_start":
    case "round_end":
      return null;
    case "context_snapshot": {
      const { snapshot } = event;
      const diff = snapshot.diff;
      const changedSections = diff?.changedSections.length
        ? diff.changedSections.join(", ")
        : "none";
      return {
        ...base,
        kind: "context",
        label: "Context metrics",
        meta: `${snapshot.metrics.approxTokenCount} tok · ${snapshot.metrics.messageCount} msgs · ${snapshot.metrics.toolCount} tools`,
        content: formatLogValue(
          {
            id: snapshot.id,
            model: snapshot.model,
            storage: "metrics_only",
            sourceOfTruth: "event trace",
            metrics: snapshot.metrics,
            diff: diff
              ? {
                  previousSnapshotId: diff.previousSnapshotId,
                  addedMessages: diff.addedMessages,
                  removedMessages: diff.removedMessages,
                  changedMessages: diff.changedMessages,
                  addedTools: diff.addedTools,
                  removedTools: diff.removedTools,
                  approxAddedTokens: diff.approxAddedTokens,
                  approxRemovedTokens: diff.approxRemovedTokens,
                  changedSections,
                }
              : null,
          },
          8_000,
        ),
        tone: "muted",
        textInk: true,
      };
    }
    case "assistant_message":
      return {
        ...base,
        kind: "message",
        label: `Assistant message`,
        meta: "",
        content: formatLogValue(event.content),
        tone: event.hasToolCalls ? "sea" : "ink",
        textInk: true,
      };
    case "tool_call":
      return {
        ...base,
        kind: "tool",
        label: `Tool call: ${event.toolName}`,
        meta: event.toolCallId,
        content: formatLogValue(event.args),
        tone: "sea",
      };
    case "tool_result": {
      const textInkTools = new Set([SEARCH_ENTITY_TYPES_TOOL, "web_search"]);
      return {
        ...base,
        kind: "tool",
        label: `Tool result: ${event.toolName}`,
        meta: `${event.ok ? "ok" : "failed"} · ${event.durationMs}ms`,
        content: event.ok
          ? BROWSER_TOOL_NAMES.has(event.toolName)
            ? formatBrowserResult(event.result)
            : formatLogValue(event.result)
          : event.error || "Tool failed.",
        tone: event.ok ? "success" : "danger",
        textInk: event.ok && textInkTools.has(event.toolName),
      };
    }
    default:
      return {
        ...base,
        kind: "event",
        label: "Workflow event",
        meta: "",
        content: formatLogValue(event),
        tone: "muted",
      };
  }
};

interface OverlayMenusProps {
  positionMode: PositionMode;
  graph: Graph | null;
  setLayout: (x: LayoutConfig) => void;
  layoutAlgorithms: LayoutAlgorithmOption[];
  fitView: Function;
  clearGraph: () => void;
  toggleSettings: () => void;
  onResolveDuplicateQueueAction?: (
    entity: Node,
    duplicateMode: "mergeBest" | "forceCreate",
  ) => Promise<void>;
  applyTransformResultsToGraph: (
    incomingNodes?: any[],
    incomingEdges?: any[],
  ) => Promise<any>;
}

export default function OverlayMenus({
  positionMode,
  setLayout,
  layoutAlgorithms,
  graph,
  fitView,
  clearGraph,
  toggleSettings,
  onResolveDuplicateQueueAction,
  applyTransformResultsToGraph,
}: OverlayMenusProps) {
  const setPositionMode = useFlowStore((state) => state.setPositionMode);
  const addRelationship = useFlowStore((state) => state.addRelationship);
  const updateFlowEntity = useFlowStore((state) => state.updateEntity);
  const setGraphSnapshot = useFlowStore((state) => state.setGraph);
  const setTimelinePlaybackReadOnly = useFlowStore(
    (state) => state.setTimelinePlaybackReadOnly,
  );
  const transformLayoutAlgorithm = useFlowStore(
    (state) => state.transformLayoutAlgorithm,
  );
  const setTransformLayoutAlgorithm = useFlowStore(
    (state) => state.setTransformLayoutAlgorithm,
  );
  const graphNodes = useFlowStore((state) => state.nodes);
  const graphEdges = useFlowStore((state) => state.edges);
  const reactFlow = useReactFlow();
  const navigate = useNavigate();
  const { hid } = useParams();
  const attachments = useAttachmentsStore();
  // Use the entities store to fetch plugin entities
  const [searchFilter, setSearchFilter] = useState("");
  const { plugins, blueprints } = useEntitiesStore();
  const [isEntityCatalogLoading, setIsEntityCatalogLoading] = useState(false);

  const applyResolutionLayout = applyTransformResultsToGraph;
  const [agentMode, setAgentMode] = useState<AgentMode>("none");
  const [proactivePanelRequested, setProactivePanelRequested] = useState(false);
  const [proactivePanelCollapsed, setProactivePanelCollapsed] = useState(true);
  const [proactivePanelHeightRatio, setProactivePanelHeightRatio] = useState(
    DEFAULT_PROACTIVE_PANEL_HEIGHT_RATIO,
  );
  const [proactivePivotInstructions, setProactivePivotInstructions] = useState(
    () => {
      try {
        return localStorage.getItem(PROACTIVE_PIVOT_INSTRUCTIONS_KEY) ?? "";
      } catch {
        return "";
      }
    },
  );
  const [proactiveLogs, setProactiveLogs] = useState<ProactiveLogEntry[]>([]);
  const [proactiveLogViewport, setProactiveLogViewport] = useState({
    scrollTop: 0,
    height: 0,
  });
  const [proactiveModelLoading, setProactiveModelLoading] =
    useState<ProactiveModelLoadingStatus | null>(null);
  const [proactiveAgentStatus, setProactiveAgentStatus] = useState({
    queuedCount: 0,
    runningTarget: "",
    runningEntityId: "",
    runningCount: 0,
    lastQueuedTarget: "",
    lastCompletedTarget: "",
    lastError: "",
  });
  const proactiveAgentTimerRef = useRef<number | null>(null);
  const proactiveAgentRunTokenRef = useRef(0);
  const proactiveAgentActiveCountRef = useRef(0);
  const proactiveAgentActiveEntityIdsRef = useRef<Set<string>>(new Set());
  const proactiveAgentConcurrencyRef = useRef(PROACTIVE_AGENT_CONCURRENCY);
  const proactiveModelLoadingTimerRef = useRef<number | null>(null);
  const proactiveAgentCursorRef = useRef(0);
  const proactiveAgentRoundRef = useRef<number | null>(null);
  const proactiveVisibleCaseIdsRef = useRef<Set<string>>(new Set());
  const proactiveQueueOrderRef = useRef<string[]>([]);
  const blueprintsRef = useRef(blueprints);
  const graphNodesRef = useRef(graphNodes);
  const graphEdgesRef = useRef(graphEdges);
  const graphRef = useRef(graph);
  const timelineLiveGraphRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(
    null,
  );
  const timelineReplayFrameRef = useRef<number | null>(null);
  const pendingTimelineJumpRef = useRef<{
    index: number;
    focus: boolean;
  } | null>(null);
  const proactiveLogEntriesRef = useRef<ProactiveLogEntry[]>([]);
  const proactiveLogsRef = useRef<HTMLDivElement>(null);
  const resolveQueuedExpansionRef = useRef<
    ((entry: ProactiveLogEntry) => Promise<void>) | null
  >(null);
  const proactiveAgentEnabled =
    PROACTIVE_INTELLIGENCE_RELEASED && agentMode === "proactive";

  const updateProactiveModelLoading = useCallback(
    (event: Extract<AosintWorkflowEvent, { type: "model_loading" }>) => {
      if (proactiveModelLoadingTimerRef.current) {
        window.clearTimeout(proactiveModelLoadingTimerRef.current);
        proactiveModelLoadingTimerRef.current = null;
      }

      const progress =
        event.phase === "loaded" ? 1 : clampProgress(event.progress);
      setProactiveModelLoading({
        model: event.model,
        phase: event.phase,
        progress,
        message: event.message || "Loading LM Studio model",
      });

      if (event.phase === "loaded" || event.phase === "failed") {
        proactiveModelLoadingTimerRef.current = window.setTimeout(() => {
          setProactiveModelLoading(null);
          proactiveModelLoadingTimerRef.current = null;
        }, 900);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (proactiveModelLoadingTimerRef.current) {
        window.clearTimeout(proactiveModelLoadingTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    try {
      const trimmed = proactivePivotInstructions.trim();
      if (trimmed) {
        localStorage.setItem(PROACTIVE_PIVOT_INSTRUCTIONS_KEY, trimmed);
      } else {
        localStorage.removeItem(PROACTIVE_PIVOT_INSTRUCTIONS_KEY);
      }
    } catch {
      // localStorage can be unavailable in hardened renderer contexts.
    }
  }, [proactivePivotInstructions]);

  const appendProactiveLog = useCallback(
    (entry: Omit<ProactiveLogEntry, "id" | "createdAt">) => {
      const createdAt = Date.now();
      const nextEntry: ProactiveLogEntry = {
        ...entry,
        id: `${createdAt}-${Math.random().toString(16).slice(2)}`,
        createdAt,
      };
      const compactedEntry = compactProactiveLogEntry(nextEntry);
      setProactiveLogs((logs) => [
        ...logs.slice(-(MAX_PROACTIVE_LOGS - 1)),
        compactedEntry,
      ]);
      return nextEntry.id;
    },
    [],
  );

  const updateProactiveLog = useCallback(
    (id: string, updates: Partial<ProactiveLogEntry>) => {
      setProactiveLogs((logs) =>
        logs.map((log) =>
          log.id === id
            ? compactProactiveLogEntry({ ...log, ...updates })
            : log,
        ),
      );
    },
    [],
  );

  const toggleAgentMode = useCallback(() => {
    if (!PROACTIVE_INTELLIGENCE_RELEASED) return;

    setProactivePanelRequested(true);
    setProactivePanelCollapsed(false);
    if (proactiveAgentEnabled) {
      proactiveAgentRunTokenRef.current += 1;
      proactiveAgentActiveCountRef.current = 0;
      proactiveAgentActiveEntityIdsRef.current.clear();
      proactiveVisibleCaseIdsRef.current.clear();
      if (proactiveAgentTimerRef.current) {
        window.clearTimeout(proactiveAgentTimerRef.current);
        proactiveAgentTimerRef.current = null;
      }
      if (hid) {
        void window.api.aosint.cancelWorkflows({ caseId: hid });
        void window.api.aosint.cancelWorkflows({
          caseIdPrefix: `${hid}:`,
        });
      }
      setProactiveAgentStatus((status) => ({
        ...status,
        queuedCount: 0,
        runningTarget: "",
        runningEntityId: "",
        runningCount: 0,
      }));
      setAgentMode("none");
      return;
    }

    proactiveAgentRoundRef.current = null;
    proactiveVisibleCaseIdsRef.current.clear();
    setAgentMode("proactive");
  }, [hid, proactiveAgentEnabled]);

  useEffect(() => {
    blueprintsRef.current = blueprints;
  }, [blueprints]);

  useEffect(() => {
    let cancelled = false;

    const loadEntityCatalog = async () => {
      const hasPlugins = Array.isArray(plugins) && plugins.length > 0;
      const hasBlueprints =
        blueprints &&
        typeof blueprints === "object" &&
        Object.keys(blueprints).length > 0;

      if (hasPlugins && hasBlueprints) return;

      setIsEntityCatalogLoading(true);
      try {
        await refreshPluginCatalog(getLocalPluginDirs());
        if (cancelled) return;
      } catch (error) {
        if (!cancelled) {
          console.error("[FLOW] Failed to load entity catalog:", error);
        }
      } finally {
        if (!cancelled) setIsEntityCatalogLoading(false);
      }
    };

    void loadEntityCatalog();

    return () => {
      cancelled = true;
    };
  }, [blueprints, plugins]);

  useEffect(() => {
    graphNodesRef.current = graphNodes;
  }, [graphNodes]);

  useEffect(() => {
    graphEdgesRef.current = graphEdges;
  }, [graphEdges]);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    proactiveLogEntriesRef.current = proactiveLogs;
  }, [proactiveLogs]);

  const queueProactiveAgentExpansion = useCallback(
    (entity: AgentGraphEntity, token: number) => {
      if (
        !hid ||
        token !== proactiveAgentRunTokenRef.current ||
        proactiveAgentActiveEntityIdsRef.current.has(entity.id) ||
        proactiveAgentActiveCountRef.current >=
          proactiveAgentConcurrencyRef.current
      ) {
        return;
      }

      proactiveAgentActiveCountRef.current += 1;
      proactiveAgentActiveEntityIdsRef.current.add(entity.id);

      const logEntryId = appendProactiveLog({
        kind: "queue",
        label: "Queued entity expansion",
        meta: entity.id,
        content: entity.target,
        tone: "muted",
        action: "resolveQueuedExpansion",
        entityId: entity.id,
        target: entity.target,
        prompt: entity.prompt,
        systemPromptContext: entity.systemPromptContext,
        resolutionStatus: "idle",
      });

      setProactiveAgentStatus((status) => ({
        ...status,
        queuedCount: status.queuedCount + 1,
        runningCount: proactiveAgentActiveCountRef.current,
        runningTarget:
          proactiveAgentActiveCountRef.current > 1
            ? `${proactiveAgentActiveCountRef.current} entities running`
            : entity.target,
        runningEntityId: status.runningEntityId || entity.id,
        lastQueuedTarget: entity.target,
        lastError: "",
      }));

      const queueNextEntity = () => {
        if (
          token !== proactiveAgentRunTokenRef.current ||
          proactiveAgentActiveCountRef.current >=
            proactiveAgentConcurrencyRef.current
        ) {
          return;
        }

        const entities = orderAgentGraphEntities(
          getAgentGraphEntities(
            graphNodesRef.current,
            graphEdgesRef.current,
            blueprintsRef.current,
            graphRef.current,
          ),
          proactiveQueueOrderRef.current,
        );
        if (!entities.length) return;

        for (let attempts = 0; attempts < entities.length; attempts += 1) {
          const cursor = proactiveAgentCursorRef.current % entities.length;
          proactiveAgentCursorRef.current = cursor + 1;
          const candidate = entities[cursor];
          if (!proactiveAgentActiveEntityIdsRef.current.has(candidate.id)) {
            queueProactiveAgentExpansion(candidate, token);
            return;
          }
        }
      };

      void (async () => {
        let unsubscribeImmediateToolListener: (() => void) | null = null;
        let immediateCreationQueue: Promise<void> = Promise.resolve();

        try {
          const settings = await window.api.settings.get();
          if (token !== proactiveAgentRunTokenRef.current) return;

          const provider = normalizeAgentProvider(settings.agentProvider);
          const systemPrompt = settings.agentSystemPrompt?.trim();
          const sourceNode = graphNodesRef.current.find(
            (node) => node.id === entity.id,
          );
          const workerBlueprints = blueprintsRef.current;
          const browserObservationContext =
            buildProactiveBrowserObservationContext(
              proactiveLogEntriesRef.current,
              entity,
            );
          const inlineGraphCapturePrompt = buildInlineGraphCapturePrompt({
            target: entity.target,
            browserObservationContext,
          });
          const workflowSystemPrompt = mergeSystemPrompt(
            systemPrompt,
            [entity.systemPromptContext, browserObservationContext]
              .filter(Boolean)
              .join("\n\n"),
          );
          const workflowUserPrompt = mergeUserPrompt(
            [entity.prompt, inlineGraphCapturePrompt]
              .filter(Boolean)
              .join("\n\n"),
            [
              proactivePivotInstructions.trim(),
              settings.agentUserPrompt?.trim(),
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
          const createdCandidateKeys = new Set<string>();
          const createdEntities: Array<
            Awaited<ReturnType<typeof window.api.graph.createEntity>>
          > = [];
          const resolvedAt = new Date().toISOString();
          const fallbackPosition = reactFlow.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
          const basePosition = sourceNode?.position
            ? {
                x: sourceNode.position.x + 280,
                y: sourceNode.position.y + 120,
              }
            : fallbackPosition;
          unsubscribeImmediateToolListener = window.api.aosint.onWorkflowEvent(
            (event) => {
              if (event.caseId !== hid) return;

              const submission =
                getUnverifiedEntityToolSubmissionFromEvent(event);
              if (!submission) return;
              const toolCallId =
                event.type === "tool_result" ? event.toolCallId : "";

              immediateCreationQueue = immediateCreationQueue
                .then(async () => {
                  const candidates = getSchemaValidResolutionCandidates(
                    normalizeToolSubmittedCandidate(
                      submission,
                      workerBlueprints,
                      entity.target,
                    ),
                    workerBlueprints,
                  );

                  if (!candidates.length) {
                    appendProactiveLog({
                      kind: "resolve",
                      label: "Captured entity needs schema repair",
                      meta: toolCallId,
                      content: buildResolutionValidationFeedback(
                        normalizeToolSubmittedCandidate(
                          submission,
                          workerBlueprints,
                          entity.target,
                        ),
                        workerBlueprints,
                      ),
                      tone: "muted",
                    });
                    return;
                  }

                  const resolutionNodes: any[] = [];
                  const resolutionEdges: any[] = [];
                  for (const candidate of candidates) {
                    const candidateKey = getResolutionCandidateKey(candidate);
                    if (
                      !candidateKey ||
                      createdCandidateKeys.has(candidateKey)
                    ) {
                      continue;
                    }
                    createdCandidateKeys.add(candidateKey);

                    const index = createdEntities.length;
                    const displayName =
                      formatAgentValue(candidate.display_name) ||
                      formatAgentValue(candidate.data?.title) ||
                      formatAgentValue(candidate.data?.name) ||
                      entity.target;
                    const position = {
                      x: basePosition.x + (index % 3) * 260,
                      y: basePosition.y + Math.floor(index / 3) * 180,
                    };
                    const evidenceCitations = normalizeEvidenceCitations(
                      candidate.evidence_citations?.length
                        ? candidate.evidence_citations
                        : candidate.evidence,
                      {
                        sourceGraphEntityId: entity.id,
                        sourceGraphEntityLabel: getNodeEntityType(sourceNode),
                        resolutionCaseId: hid,
                        resolvedAt,
                        toolName: ADD_UNVERIFIED_ENTITY_TOOL,
                        fallbackObservation:
                          candidate.graph_reason ||
                          candidate.display_name ||
                          entity.target,
                        confidence: candidate.confidence,
                      },
                    );
                    const resolutionData = {
                      label: "Unverified Agent Resolution",
                      name: displayName,
                      title: displayName,
                      __nodeType: UNVERIFIED_NODE_TYPE,
                      __resolutionStatus: "unverified",
                      resolved_by: AGENT_RESOLVER_NAME,
                      resolved_at: resolvedAt,
                      resolution_case_id: hid,
                      resolution_target: entity.target,
                      resolution_index: index,
                      resolution_finished: false,
                      source_graph_entity_id: entity.id,
                      source_graph_entity_label: getNodeEntityType(sourceNode),
                      reactflow_blueprint_candidates: [candidate],
                      evidence_citations: evidenceCitations,
                      citation_status: getCitationStatus(evidenceCitations),
                      agent_resolution_summary:
                        "Captured immediately from the proactive workflow.",
                      agent_resolution_tool_submission: submission,
                      agent_resolution_tool_submissions: [submission],
                      agent_resolution_conversation_trace: [],
                    };

                    const createdEntity = await window.api.graph.createEntity({
                      graphId: hid as string,
                      entity: {
                        label: "Unverified Agent Resolution",
                        x: position.x,
                        y: position.y,
                        data: resolutionData,
                      },
                    });

                    createdEntities.push(createdEntity);
                    resolutionNodes.push({
                      ...createdEntity,
                      type: UNVERIFIED_NODE_TYPE,
                      data: resolutionData,
                    });

                    if (sourceNode) {
                      const createdEdge = await window.api.graph.createEdge({
                        graphId: hid as string,
                        edge: {
                          source: sourceNode.id,
                          target: createdEntity.id,
                          data: {
                            type: "sfloat",
                            isUnverifiedResolution: true,
                            resolution_case_id: hid,
                            resolved_by: AGENT_RESOLVER_NAME,
                          },
                        },
                      });
                      resolutionEdges.push({
                        ...createdEdge,
                        type: "sfloat",
                        data: {
                          ...(createdEdge.data ?? {}),
                          isUnverifiedResolution: true,
                        },
                      });
                    }
                  }

                  if (!resolutionNodes.length) return;

                  await applyResolutionLayout(resolutionNodes, resolutionEdges);
                  appendProactiveLog({
                    kind: "resolve",
                    label: `Added ${resolutionNodes.length} captured unverified ${
                      resolutionNodes.length === 1 ? "entity" : "entities"
                    }`,
                    meta: resolutionNodes.at(-1)?.id ?? toolCallId,
                    content: `${ADD_UNVERIFIED_ENTITY_TOOL} succeeded during the proactive workflow and was added to the graph immediately.`,
                    tone: "success",
                  });
                })
                .catch((error) => {
                  appendProactiveLog({
                    kind: "resolve",
                    label: "Immediate graph insert failed",
                    meta: toolCallId,
                    content: toErrorMessage(error),
                    tone: "danger",
                  });
                });
            },
          );

          appendProactiveLog({
            kind: "prompt",
            label: "Sent workflow prompts",
            meta: entity.target,
            content: formatSentPromptLog({
              systemPrompt: workflowSystemPrompt,
              userPrompt: workflowUserPrompt,
            }),
            tone: "ink",
            textInk: true,
          });

          await window.api.aosint.runWorkflow({
            caseId: hid,
            target: entity.target,
            workflow: "pivot",
            browserMode: "visible",
            prompt: workflowUserPrompt,
            provider,
            baseUrl:
              provider === "lmstudio"
                ? settings.agentLmStudioBaseUrl?.trim() || undefined
                : undefined,
            apiKey:
              provider === "openrouter"
                ? settings.agentOpenRouterApiKey?.trim() || undefined
                : undefined,
            model:
              provider === "openrouter"
                ? settings.agentOpenRouterModel?.trim() || undefined
                : settings.agentLmStudioModel?.trim() || undefined,
            temperature: settings.agentLmStudioTemperature,
            maxTurns: settings.agentLmStudioMaxTurns,
            contextLength:
              provider === "lmstudio"
                ? settings.agentLmStudioContextLength
                : undefined,
            maxTokens: settings.agentLmStudioMaxTokens,
            systemPrompt: workflowSystemPrompt,
            generateReport: false,
            enabledRuntimeTools: [
              SEARCH_ENTITY_TYPES_TOOL,
              ADD_UNVERIFIED_ENTITY_TOOL,
            ],
            runtimeToolContext: {
              entityTypes: buildRuntimeEntityTypeContext(workerBlueprints),
            },
            includeMessages: false,
          });

          unsubscribeImmediateToolListener?.();
          unsubscribeImmediateToolListener = null;
          await immediateCreationQueue;

          if (token !== proactiveAgentRunTokenRef.current) return;

          appendProactiveLog({
            kind: "run",
            label: "Workflow completed",
            meta: entity.id,
            content: createdEntities.length
              ? `${entity.target}\n\nCaptured ${createdEntities.length} unverified graph ${
                  createdEntities.length === 1 ? "entity" : "entities"
                } during the workflow.`
              : entity.target,
            tone: "success",
          });
        } catch (error) {
          if (token !== proactiveAgentRunTokenRef.current) return;

          const message = toErrorMessage(error);
          appendProactiveLog({
            kind: "error",
            label: "Workflow failed",
            meta: entity.id,
            content: message,
            tone: "danger",
          });
          setProactiveAgentStatus((status) => ({
            ...status,
            lastError: message,
          }));
          toast.error(`Proactive agent failed: ${message}`, {
            toastId: PROACTIVE_AGENT_ERROR_TOAST_ID,
          });
        } finally {
          unsubscribeImmediateToolListener?.();
          await immediateCreationQueue;

          proactiveAgentActiveEntityIdsRef.current.delete(entity.id);
          proactiveAgentActiveCountRef.current = Math.max(
            0,
            proactiveAgentActiveCountRef.current - 1,
          );
          const nextActiveId =
            proactiveAgentActiveEntityIdsRef.current.values().next().value ??
            "";
          const nextActiveTarget = nextActiveId
            ? (getAgentGraphEntities(
                graphNodesRef.current,
                graphEdgesRef.current,
                blueprintsRef.current,
                graphRef.current,
              ).find((candidate) => candidate.id === nextActiveId)?.target ??
              "")
            : "";
          setProactiveAgentStatus((status) => ({
            ...status,
            queuedCount: Math.max(0, status.queuedCount - 1),
            runningCount: proactiveAgentActiveCountRef.current,
            runningTarget:
              proactiveAgentActiveCountRef.current > 1
                ? `${proactiveAgentActiveCountRef.current} entities running`
                : nextActiveTarget,
            runningEntityId: nextActiveId,
            lastCompletedTarget:
              token === proactiveAgentRunTokenRef.current
                ? entity.target
                : status.lastCompletedTarget,
          }));

          queueNextEntity();
        }
      })();
    },
    [
      appendProactiveLog,
      applyResolutionLayout,
      hid,
      proactivePivotInstructions,
      reactFlow,
    ],
  );

  useEffect(() => {
    if (proactiveAgentTimerRef.current) {
      window.clearTimeout(proactiveAgentTimerRef.current);
      proactiveAgentTimerRef.current = null;
    }

    proactiveAgentRunTokenRef.current += 1;
    proactiveAgentCursorRef.current = 0;
    proactiveAgentActiveCountRef.current = 0;
    proactiveAgentActiveEntityIdsRef.current.clear();

    if (!proactiveAgentEnabled || !hid) {
      setProactiveAgentStatus((status) => ({
        ...status,
        queuedCount: 0,
        runningTarget: "",
        runningEntityId: "",
        runningCount: 0,
      }));
      return;
    }

    const token = proactiveAgentRunTokenRef.current;

    // Fill the initial worker slots immediately; each completed entity queues
    // the next one while the switch stays enabled.
    proactiveAgentTimerRef.current = window.setTimeout(() => {
      void (async () => {
        if (token !== proactiveAgentRunTokenRef.current) return;

        try {
          const settings = await window.api.settings.get();
          if (token !== proactiveAgentRunTokenRef.current) return;
          proactiveAgentConcurrencyRef.current =
            normalizeAgentProvider(settings.agentProvider) === "openrouter"
              ? OPENROUTER_PROACTIVE_AGENT_CONCURRENCY
              : PROACTIVE_AGENT_CONCURRENCY;
        } catch {
          proactiveAgentConcurrencyRef.current = PROACTIVE_AGENT_CONCURRENCY;
        }

        const entities = orderAgentGraphEntities(
          getAgentGraphEntities(
            graphNodesRef.current,
            graphEdgesRef.current,
            blueprintsRef.current,
            graphRef.current,
          ),
          proactiveQueueOrderRef.current,
        );

        if (entities.length > 0) {
          const initialCount = Math.min(
            proactiveAgentConcurrencyRef.current,
            entities.length,
          );
          for (let index = 0; index < initialCount; index += 1) {
            const cursor = proactiveAgentCursorRef.current % entities.length;
            proactiveAgentCursorRef.current = cursor + 1;
            queueProactiveAgentExpansion(entities[cursor], token);
          }
        }
      })();
    }, 0);

    return () => {
      if (proactiveAgentTimerRef.current) {
        window.clearTimeout(proactiveAgentTimerRef.current);
        proactiveAgentTimerRef.current = null;
      }
      proactiveAgentRunTokenRef.current += 1;
      proactiveAgentActiveCountRef.current = 0;
      proactiveAgentActiveEntityIdsRef.current.clear();
    };
  }, [hid, proactiveAgentEnabled, queueProactiveAgentExpansion]);

  useEffect(() => {
    if (!proactiveAgentEnabled || !hid) return;

    const unsubscribe = window.api.aosint.onWorkflowEvent((event) => {
      if (
        event.caseId !== hid &&
        !proactiveVisibleCaseIdsRef.current.has(event.caseId)
      ) {
        return;
      }
      if ("round" in event && typeof event.round === "number") {
        proactiveAgentRoundRef.current = event.round;
      }
      if (event.type === "model_loading") {
        updateProactiveModelLoading(event);
      }
      const entry = buildWorkflowLogEntry(
        event,
        proactiveAgentRoundRef.current,
      );
      if (entry) {
        setProactiveLogs((logs) => [
          ...logs.slice(-(MAX_PROACTIVE_LOGS - 1)),
          compactProactiveLogEntry(entry),
        ]);
      }
    });

    return unsubscribe;
  }, [hid, proactiveAgentEnabled, updateProactiveModelLoading]);

  useEffect(() => {
    if (!PROACTIVE_INTELLIGENCE_RELEASED || !hid) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OneTimeInvestigationLogEvent>)
        .detail;
      if (!detail || detail.graphId !== hid) return;

      setProactivePanelRequested(true);
      setProactivePanelCollapsed(false);
      setProactivePanelHeightRatio(
        (heightRatio) => heightRatio || DEFAULT_PROACTIVE_PANEL_HEIGHT_RATIO,
      );

      if (detail.status) {
        setProactiveAgentStatus((status) => ({
          ...status,
          ...detail.status,
        }));
      }

      if (detail.entry) {
        appendProactiveLog(detail.entry);
      }
    };

    window.addEventListener(ONE_TIME_INVESTIGATION_EVENT, handler);
    return () =>
      window.removeEventListener(ONE_TIME_INVESTIGATION_EVENT, handler);
  }, [appendProactiveLog, hid]);

  useEffect(() => {
    if (!PROACTIVE_INTELLIGENCE_RELEASED || !hid) return;

    const unsubscribe = window.api.aosint.onWorkflowEvent((event) => {
      if (!event.caseId.startsWith(`${hid}:investigate:`)) {
        return;
      }
      if (event.type === "model_loading") {
        updateProactiveModelLoading(event);
      }

      const entry = buildWorkflowLogEntry(
        event,
        proactiveAgentRoundRef.current,
      );
      if (entry) {
        setProactivePanelRequested(true);
        setProactivePanelCollapsed(false);
        setProactiveLogs((logs) => [
          ...logs.slice(-(MAX_PROACTIVE_LOGS - 1)),
          compactProactiveLogEntry(entry),
        ]);
      }
    });

    return unsubscribe;
  }, [hid, updateProactiveModelLoading]);

  useEffect(() => {
    const container = proactiveLogsRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setProactiveLogViewport({
      scrollTop: container.scrollTop,
      height: container.clientHeight,
    });
  }, [proactiveLogs]);

  useEffect(() => {
    const container = proactiveLogsRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setProactiveLogViewport((viewport) => ({
        ...viewport,
        height: container.clientHeight,
      }));
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [proactivePanelRequested, proactivePanelCollapsed]);

  const handleProactiveLogScroll = useCallback((event: Event) => {
    const target = event.currentTarget as HTMLDivElement;
    setProactiveLogViewport({
      scrollTop: target.scrollTop,
      height: target.clientHeight,
    });
  }, []);

  const handleProactivePanelResizeStart = useCallback((event: any) => {
    event.preventDefault();
    event.stopPropagation();

    const updateHeight = (clientY: number) => {
      const viewportHeight = Math.max(window.innerHeight || 1, 1);
      const nextRatio = clamp(
        (viewportHeight - clientY) / viewportHeight,
        MIN_PROACTIVE_PANEL_HEIGHT_RATIO,
        MAX_PROACTIVE_PANEL_HEIGHT_RATIO,
      );
      setProactivePanelHeightRatio(nextRatio);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateHeight(moveEvent.clientY);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("proactive-panel-resizing");
    };

    document.body.classList.add("proactive-panel-resizing");
    updateHeight(event.clientY);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, []);

  useEffect(
    () => () => {
      document.body.classList.remove("proactive-panel-resizing");
    },
    [],
  );

  const resolveQueuedExpansion = useCallback(
    async (entry: ProactiveLogEntry) => {
      const target = (entry.target || entry.content).trim();
      if (!hid || !target || entry.resolutionStatus === "resolving") return;

      const sourceNode = graphNodesRef.current.find(
        (node) => node.id === entry.entityId,
      );
      const resolutionCaseId = `${hid}:resolution:${entry.id}`;
      proactiveVisibleCaseIdsRef.current.add(resolutionCaseId);
      updateProactiveLog(entry.id, { resolutionStatus: "resolving" });

      try {
        const extraPluginDirs = getLocalPluginDirs();
        let workerBlueprints = blueprintsRef.current;
        try {
          const refreshed = await window.api.plugins.blueprints({
            extraPluginDirs,
          });
          if (isRecord(refreshed) && Object.keys(refreshed).length > 0) {
            workerBlueprints = refreshed;
          }
        } catch (error) {
          console.warn("Failed to refresh Python IPC blueprints:", error);
        }

        const extractedHints = extractResolutionEntityHints(
          proactiveLogs,
          { ...entry, target },
          sourceNode,
          workerBlueprints,
        );
        const browserObservationContext =
          buildProactiveBrowserObservationContext(proactiveLogs, {
            id: entry.entityId ?? "",
            target,
          });
        const extractedEntitiesByMessage = extractResolutionEntitiesByMessage(
          proactiveLogs,
          { ...entry, target },
        );
        const promptHints = compactResolutionHints(extractedHints);
        const promptEntitiesByMessage = compactResolutionEntitiesByMessage(
          extractedEntitiesByMessage,
        );
        const relevantBlueprints = getRelevantResolutionBlueprints(
          { ...entry, target },
          sourceNode,
          workerBlueprints,
          promptHints,
        );
        const promptBlueprints =
          buildCompactResolutionBlueprintContext(relevantBlueprints);
        const resolutionPrompt = buildResolutionPrompt({
          entry: { ...entry, target },
          sourceNode,
          blueprints: workerBlueprints,
          relevantBlueprints: promptBlueprints,
          extractedHints: promptHints,
          extractedEntitiesByMessage: promptEntitiesByMessage,
          browserObservationContext,
        });

        appendProactiveLog({
          kind: "resolve",
          label: "Resolution chat started",
          meta: resolutionCaseId,
          content: [
            `Target: ${target}`,
            "Extracted proactive conversation/entity hints:",
            formatLogValue(promptHints, 2_000),
            "Extracted entities by proactive message:",
            formatLogValue(promptEntitiesByMessage, 3_000),
            "Recent browser-agent observations:",
            browserObservationContext || "No browser observations captured.",
            "Relevant JSON blueprints from Python IPC worker:",
            formatLogValue(promptBlueprints, 4_000),
          ].join("\n\n"),
          tone: "sea",
        });

        const settings = await window.api.settings.get();
        const provider = normalizeAgentProvider(settings.agentProvider);
        const workflowSystemPrompt = buildResolutionSystemPrompt(
          entry.systemPromptContext,
        );
        const resolutionMaxTurns = Math.min(
          Math.max(settings.agentLmStudioMaxTurns ?? 12, 8),
          MAX_RESOLUTION_TURNS,
        );
        const runtimeToolContext = {
          entityTypes: buildRuntimeEntityTypeContext(workerBlueprints),
        };
        let result: Awaited<
          ReturnType<typeof window.api.aosint.runWorkflow>
        > | null = null;
        let conversationTrace: ReturnType<typeof getConversationTrace> = [];
        let toolSubmissions: Record<string, any>[] = [];
        let parsedResolution: Record<string, any> | null = null;
        let validationFeedback = "";
        let resolutionFinished = false;
        const resolvedAt = new Date().toISOString();
        const fallbackPosition = reactFlow.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        const basePosition = sourceNode?.position
          ? {
              x: sourceNode.position.x + 280,
              y: sourceNode.position.y + 120,
            }
          : fallbackPosition;
        const createdCandidateKeys = new Set<string>();
        const createdEntities: Array<
          Awaited<ReturnType<typeof window.api.graph.createEntity>>
        > = [];

        const createUnverifiedGraphEntities = async (
          candidates: Record<string, any>[],
          options: {
            result: Awaited<
              ReturnType<typeof window.api.aosint.runWorkflow>
            > | null;
            parsedResolution: Record<string, any> | null;
            conversationTrace: ReturnType<typeof getConversationTrace>;
            toolSubmissions: Record<string, any>[];
            resolutionFinished: boolean;
          },
        ) => {
          const resolutionNodes: any[] = [];
          const resolutionEdges: any[] = [];

          for (const candidate of candidates) {
            const candidateKey = getResolutionCandidateKey(candidate);
            if (!candidateKey || createdCandidateKeys.has(candidateKey)) {
              continue;
            }
            createdCandidateKeys.add(candidateKey);

            const index = createdEntities.length;
            const displayName =
              formatAgentValue(candidate.display_name) ||
              formatAgentValue(candidate.data?.title) ||
              formatAgentValue(candidate.data?.name) ||
              target;
            const position = {
              x: basePosition.x + (index % 3) * 260,
              y: basePosition.y + Math.floor(index / 3) * 180,
            };
            const candidateEntityType = formatAgentValue(candidate.entity_type);
            const blueprintLabels = Array.from(
              new Set(
                [
                  ...Object.keys(relevantBlueprints),
                  candidateEntityType,
                ].filter(Boolean),
              ),
            );
            const evidenceCitations = normalizeEvidenceCitations(
              candidate.evidence_citations?.length
                ? candidate.evidence_citations
                : candidate.evidence,
              {
                sourceGraphEntityId: entry.entityId,
                sourceGraphEntityLabel: getNodeEntityType(sourceNode),
                resolutionCaseId,
                resolvedAt,
                toolName: ADD_UNVERIFIED_ENTITY_TOOL,
                fallbackObservation:
                  candidate.graph_reason ||
                  options.result?.finalAnswer ||
                  displayName,
                confidence: candidate.confidence,
              },
            );
            const resolutionData = {
              label: "Unverified Agent Resolution",
              name: displayName,
              title: displayName,
              __nodeType: UNVERIFIED_NODE_TYPE,
              __resolutionStatus: "unverified",
              resolved_by: AGENT_RESOLVER_NAME,
              resolved_at: resolvedAt,
              resolution_case_id: resolutionCaseId,
              resolution_target: target,
              resolution_index: index,
              resolution_finished: options.resolutionFinished,
              source_graph_entity_id: entry.entityId,
              source_graph_entity_label: getNodeEntityType(sourceNode),
              extracted_proactive_entities: extractedHints,
              extracted_proactive_entities_by_message:
                extractedEntitiesByMessage,
              relevant_blueprint_labels: blueprintLabels,
              reactflow_blueprint_candidates: [candidate],
              evidence_citations: evidenceCitations,
              citation_status: getCitationStatus(evidenceCitations),
              agent_resolution_summary:
                options.result?.finalAnswer ||
                "Captured immediately from add_unverified_entity_to_graph.",
              agent_resolution_json: options.parsedResolution,
              agent_resolution_tool_submission:
                candidate.submitted_intent ??
                options.toolSubmissions[index] ??
                null,
              agent_resolution_tool_submissions: options.toolSubmissions,
              agent_resolution_conversation_trace: options.conversationTrace,
            };

            let createdEntity: Awaited<
              ReturnType<typeof window.api.graph.createEntity>
            >;
            try {
              createdEntity = await window.api.graph.createEntity({
                graphId: hid as string,
                entity: {
                  label: "Unverified Agent Resolution",
                  x: position.x,
                  y: position.y,
                  data: resolutionData,
                },
              });
            } catch (error) {
              createdCandidateKeys.delete(candidateKey);
              throw error;
            }

            createdEntities.push(createdEntity);
            resolutionNodes.push({
              ...createdEntity,
              type: UNVERIFIED_NODE_TYPE,
              data: resolutionData,
            });

            if (sourceNode) {
              try {
                const createdEdge = await window.api.graph.createEdge({
                  graphId: hid as string,
                  edge: {
                    source: sourceNode.id,
                    target: createdEntity.id,
                    data: {
                      type: "sfloat",
                      isUnverifiedResolution: true,
                      resolution_case_id: resolutionCaseId,
                      resolved_by: AGENT_RESOLVER_NAME,
                    },
                  },
                });
                resolutionEdges.push({
                  ...createdEdge,
                  type: "sfloat",
                  data: {
                    ...(createdEdge.data ?? {}),
                    isUnverifiedResolution: true,
                  },
                });
              } catch (error) {
                appendProactiveLog({
                  kind: "resolve",
                  label: "Unverified graph edge failed",
                  meta: createdEntity.id,
                  content: toErrorMessage(error),
                  tone: "danger",
                });
              }
            }
          }

          if (!resolutionNodes.length) return null;

          return {
            graph: await applyResolutionLayout(
              resolutionNodes,
              resolutionEdges,
            ),
            count: resolutionNodes.length,
          };
        };

        let immediateCreationQueue: Promise<void> = Promise.resolve();
        const unsubscribeImmediateToolListener =
          window.api.aosint.onWorkflowEvent((event) => {
            if (event.caseId !== resolutionCaseId) return;

            const submission =
              getUnverifiedEntityToolSubmissionFromEvent(event);
            if (!submission) return;
            const toolCallId =
              event.type === "tool_result" ? event.toolCallId : "";

            immediateCreationQueue = immediateCreationQueue
              .then(async () => {
                const candidates = getSchemaValidResolutionCandidates(
                  normalizeToolSubmittedCandidate(
                    submission,
                    workerBlueprints,
                    target,
                  ),
                  workerBlueprints,
                );

                if (!candidates.length) {
                  appendProactiveLog({
                    kind: "resolve",
                    label: "Captured entity needs schema repair",
                    meta: toolCallId,
                    content: buildResolutionValidationFeedback(
                      normalizeToolSubmittedCandidate(
                        submission,
                        workerBlueprints,
                        target,
                      ),
                      workerBlueprints,
                    ),
                    tone: "muted",
                  });
                  return;
                }

                const creationResult = await createUnverifiedGraphEntities(
                  candidates,
                  {
                    result: null,
                    parsedResolution: null,
                    conversationTrace: [],
                    toolSubmissions: [submission],
                    resolutionFinished: false,
                  },
                );
                const newestCreatedEntity = createdEntities.at(-1);

                if (!creationResult || !newestCreatedEntity) return;

                appendProactiveLog({
                  kind: "resolve",
                  label: "Added captured unverified entity",
                  meta: newestCreatedEntity.id,
                  content: `${ADD_UNVERIFIED_ENTITY_TOOL} succeeded and the entity was added to the graph.`,
                  tone: "success",
                });
              })
              .catch((error) => {
                appendProactiveLog({
                  kind: "resolve",
                  label: "Immediate graph insert failed",
                  meta: toolCallId,
                  content: toErrorMessage(error),
                  tone: "danger",
                });
              });
          });

        try {
          for (
            let attempt = 1;
            attempt <= MAX_RESOLUTION_ATTEMPTS;
            attempt += 1
          ) {
            const attemptPrompt = validationFeedback
              ? [
                  resolutionPrompt,
                  "",
                  `Previous resolution attempt ${attempt - 1} did not match the available entity schema.`,
                  "Fix these schema issues before calling add_unverified_entity_to_graph again:",
                  validationFeedback,
                ].join("\n")
              : resolutionPrompt;

            if (attempt > 1) {
              appendProactiveLog({
                kind: "resolve",
                label: `Resolution retry ${attempt}`,
                meta: resolutionCaseId,
                content: validationFeedback,
                tone: "muted",
              });
            }
            const workflowUserPrompt = mergeUserPrompt(
              attemptPrompt,
              settings.agentUserPrompt
                ? truncateAosintTraceText(
                    [
                      proactivePivotInstructions.trim(),
                      settings.agentUserPrompt,
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                    MAX_RESOLUTION_USER_PROMPT_CHARS,
                  )
                : proactivePivotInstructions.trim() || undefined,
            );
            const nearEndUserPrompt = buildNearEndResolutionPrompt(
              promptEntitiesByMessage,
            );

            appendProactiveLog({
              kind: "prompt",
              label:
                attempt > 1
                  ? `Sent resolution prompts retry ${attempt}`
                  : "Sent resolution prompts",
              meta: resolutionCaseId,
              content: truncateAosintTraceText(
                formatSentPromptLog({
                  systemPrompt: workflowSystemPrompt,
                  userPrompt: workflowUserPrompt,
                  nearEndUserPrompt,
                }),
                8_000,
              ),
              tone: "ink",
              textInk: true,
            });

            result = await window.api.aosint.runWorkflow({
              caseId: resolutionCaseId,
              target,
              workflow: "pivot",
              browserMode: "visible",
              prompt: workflowUserPrompt,
              provider,
              baseUrl:
                provider === "lmstudio"
                  ? settings.agentLmStudioBaseUrl?.trim() || undefined
                  : undefined,
              apiKey:
                provider === "openrouter"
                  ? settings.agentOpenRouterApiKey?.trim() || undefined
                  : undefined,
              model:
                provider === "openrouter"
                  ? settings.agentOpenRouterModel?.trim() || undefined
                  : settings.agentLmStudioModel?.trim() || undefined,
              temperature: settings.agentLmStudioTemperature,
              maxTurns: resolutionMaxTurns,
              contextLength:
                provider === "lmstudio"
                  ? settings.agentLmStudioContextLength
                  : undefined,
              maxTokens: settings.agentLmStudioMaxTokens,
              systemPrompt: workflowSystemPrompt,
              generateReport: false,
              enabledRuntimeTools: [
                SEARCH_ENTITY_TYPES_TOOL,
                ADD_UNVERIFIED_ENTITY_TOOL,
                ENTITY_RESOLUTION_FINISHED_TOOL,
              ],
              nearEndUserPrompt,
              runtimeToolContext,
            });

            await immediateCreationQueue;

            conversationTrace = getConversationTrace(result.messages);
            toolSubmissions = dedupeResolutionSubmissions(
              getUnverifiedEntityToolSubmissions(result.messages),
            );
            resolutionFinished = hasEntityResolutionFinished(
              result.messages,
              result.finalAnswer,
            );
            parsedResolution = parseAgentResolutionJson(result.finalAnswer);
            const rawCandidates = toolSubmissions.length
              ? toolSubmissions.flatMap((submission) =>
                  normalizeToolSubmittedCandidate(
                    submission,
                    workerBlueprints,
                    target,
                  ),
                )
              : getResolutionEntities(parsedResolution);
            const validCandidates = getSchemaValidResolutionCandidates(
              rawCandidates,
              workerBlueprints,
            );
            const finalAnswerCandidates = validCandidates.length
              ? normalizeResolvedReactFlowCandidates(
                  { reactflow_entities: validCandidates },
                  workerBlueprints,
                  target,
                )
              : [];
            const candidatesToCreate = toolSubmissions.length
              ? validCandidates
              : finalAnswerCandidates;
            const creationResult = await createUnverifiedGraphEntities(
              candidatesToCreate,
              {
                result,
                parsedResolution,
                conversationTrace,
                toolSubmissions,
                resolutionFinished,
              },
            );
            const newestCreatedEntity = createdEntities.at(-1);

            if (creationResult && newestCreatedEntity) {
              appendProactiveLog({
                kind: "resolve",
                label: `Added ${creationResult.count} captured unverified ${
                  creationResult.count === 1 ? "entity" : "entities"
                }`,
                meta: newestCreatedEntity.id,
                content: `${creationResult.count} schema-valid ${ADD_UNVERIFIED_ENTITY_TOOL} ${
                  creationResult.count === 1 ? "call was" : "calls were"
                } added to the graph immediately.`,
                tone: "success",
              });
            }

            if (createdEntities.length && resolutionFinished) {
              break;
            }

            validationFeedback = [
              buildResolutionValidationFeedback(
                rawCandidates,
                workerBlueprints,
              ),
              validCandidates.length && !resolutionFinished
                ? `Captured ${validCandidates.length} schema-valid entities, but ${ENTITY_RESOLUTION_FINISHED_TOOL} was not called. Continue from the captured entities, submit any remaining useful entities, then call ${ENTITY_RESOLUTION_FINISHED_TOOL}.`
                : undefined,
            ]
              .filter(Boolean)
              .join("\n");

            if (createdEntities.length && attempt === MAX_RESOLUTION_ATTEMPTS) {
              break;
            }
          }
        } finally {
          unsubscribeImmediateToolListener();
          await immediateCreationQueue;
        }

        if (!result || !createdEntities.length) {
          throw new Error(
            `Resolution did not return a schema-valid entity after ${MAX_RESOLUTION_ATTEMPTS} attempts. ${validationFeedback}`,
          );
        }

        const firstCreatedEntity = createdEntities[0];
        if (!firstCreatedEntity) {
          throw new Error("Resolution produced no graph nodes.");
        }

        if (sourceNode) {
          const resolvedEntityIds = createdEntities.map((entity) => entity.id);
          const sourceData = {
            ...((sourceNode.data ?? {}) as Record<string, unknown>),
            last_agent_resolution: {
              resolved_by: AGENT_RESOLVER_NAME,
              resolved_at: resolvedAt,
              resolved_entity_id: resolvedEntityIds[0],
              resolved_entity_ids: resolvedEntityIds,
              resolution_case_id: resolutionCaseId,
              target,
              status: "unverified",
              count: resolvedEntityIds.length,
              finished: resolutionFinished,
            },
          };

          await window.api.graph.updateEntity({
            graphId: hid as string,
            entityId: sourceNode.id,
            updates: {
              x: sourceNode.position.x,
              y: sourceNode.position.y,
              data: sourceData,
            },
          });
          updateFlowEntity(sourceNode.id, { data: sourceData });
        }

        updateProactiveLog(entry.id, {
          resolutionStatus: "resolved",
          resolvedEntityId: firstCreatedEntity.id,
        });
        appendProactiveLog({
          kind: "resolve",
          label: `Resolved ${createdEntities.length} unverified graph ${
            createdEntities.length === 1 ? "node" : "nodes"
          }`,
          meta: firstCreatedEntity.id,
          content: result.finalAnswer,
          tone: "success",
        });
        toast.success(
          `Queued expansion resolved to ${createdEntities.length} unverified graph ${
            createdEntities.length === 1 ? "node" : "nodes"
          }.`,
        );
      } catch (error) {
        const message = toErrorMessage(error);
        updateProactiveLog(entry.id, { resolutionStatus: "failed" });
        appendProactiveLog({
          kind: "resolve",
          label: "Resolution failed",
          meta: entry.entityId ?? "",
          content: message,
          tone: "danger",
        });
        toast.error(`Resolution failed: ${message}`);
      }
    },
    [
      appendProactiveLog,
      applyResolutionLayout,
      hid,
      proactiveLogs,
      proactivePivotInstructions,
      reactFlow,
      updateFlowEntity,
      updateProactiveLog,
    ],
  );

  useEffect(() => {
    resolveQueuedExpansionRef.current = resolveQueuedExpansion;
  }, [resolveQueuedExpansion]);

  const normalizedPlugins = useMemo(() => {
    return (plugins as PluginEntity[]).map((entity) => {
      const blueprint =
        blueprints && typeof blueprints === "object"
          ? blueprints[entity.label]
          : undefined;
      const icon =
        resolveIcon(entity.icon) || resolveIcon(blueprint?.icon) || "atom-2";
      const color =
        resolveColor(entity.color) ||
        resolveColor(blueprint?.color) ||
        "#64748B";
      const categories = Array.from(
        new Set([
          ...normalizeCategories(entity.category),
          ...normalizeCategories(entity.categories),
          ...normalizeCategories(blueprint?.category),
        ]),
      );
      if (categories.length === 0) {
        categories.push("Uncategorized");
      }
      const description =
        entity.description ||
        (typeof blueprint?.description === "string"
          ? blueprint.description
          : "") ||
        "";
      const author =
        entity.author ||
        (typeof blueprint?.author === "string" ||
        Array.isArray(blueprint?.author)
          ? blueprint.author
          : undefined);
      return {
        ...entity,
        icon,
        color,
        category: categories[0],
        categories,
        description,
        author,
      };
    });
  }, [plugins, blueprints]);

  const filteredPlugins = useMemo(() => {
    const normalizedFilter = searchFilter.trim().toLowerCase();
    if (!normalizedFilter) return normalizedPlugins;
    return normalizedPlugins.filter((entity) => {
      const description = entity.description?.toLowerCase() ?? "";
      return (
        entity.label.toLowerCase().includes(normalizedFilter) ||
        description.includes(normalizedFilter)
      );
    });
  }, [searchFilter, normalizedPlugins]);

  const groupedPlugins = useMemo(() => {
    const groups = new Map<string, PluginEntity[]>();
    const allEntities: PluginEntity[] = [];
    const seen = new Set<string>();
    for (const entity of filteredPlugins as PluginEntity[]) {
      if (!seen.has(entity.label)) {
        seen.add(entity.label);
        allEntities.push(entity);
      }
      const categories = entity.categories?.length
        ? entity.categories
        : normalizeCategories(entity.category);
      const safeCategories = categories.length ? categories : ["Uncategorized"];
      for (const category of safeCategories) {
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category)?.push(entity);
      }
    }
    for (const group of groups.values()) {
      group.sort((a, b) => a.label.localeCompare(b.label));
    }
    allEntities.sort((a, b) => a.label.localeCompare(b.label));
    const entries: Array<[string, PluginEntity[]]> = [
      ["All", allEntities],
      ...[...groups.entries()].sort(([a], [b]) => {
        if (a === "Uncategorized") return 1;
        if (b === "Uncategorized") return -1;
        return a.localeCompare(b);
      }),
    ];
    return entries;
  }, [filteredPlugins]);

  const onDragStart = useCallback((event: DragEvent, nodeType: string) => {
    if (event?.dataTransfer) {
      event.dataTransfer.setData("application/reactflow", nodeType);
      event.dataTransfer.effectAllowed = "move";
    }
    event.stopPropagation();
  }, []);

  // entities panel

  const [itemsCache, setItemsCache] = useState<
    Record<string, AttachmentItem[]>
  >({});
  const [_loading, setLoading] = useState(false);
  useEffect(() => {
    const load = async () => {
      if (!attachments.open || !attachments.active) return;
      const entityId = attachments.active;
      // Only fetch if not cached
      if (itemsCache[entityId]) return;
      try {
        setLoading(true);
        const data = await entitiesApi.listAttachments(String(hid), entityId);
        setItemsCache((prev) => ({ ...prev, [entityId]: data }));
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [attachments.open, attachments.active, hid]);

  const [showEntities, setShowEntities] = useState(true);
  const [showLayouts, setShowLayouts] = useState(false);
  const [showDuplicateMerges, setShowDuplicateMerges] = useState(false);
  const [showTimelineBar, setShowTimelineBar] = useState(false);
  const [proactiveQueueOrder, setProactiveQueueOrder] = useState<string[]>([]);
  const [draggedProactiveQueueId, setDraggedProactiveQueueId] = useState<
    string | null
  >(null);
  const [proactiveQueueDropIndex, setProactiveQueueDropIndex] = useState<
    number | null
  >(null);
  const [timelineCursorIndex, setTimelineCursorIndex] = useState(0);
  const [timelineAuditEvents, setTimelineAuditEvents] = useState<
    CaseAuditEvent[]
  >([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelinePan, setTimelinePan] = useState(0);
  const [duplicateQueueAction, setDuplicateQueueAction] = useState<{
    nodeId: string;
    mode: "mergeBest" | "forceCreate";
  } | null>(null);
  const [lockedPanels, setLockedPanels] = useState({
    layouts: false,
    entities: false,
    duplicates: false,
  });
  const [panelLayout, setPanelLayout] = useState([
    { i: "layouts", x: 0, y: 0, w: 3, h: 320, minW: 1, minH: 120 },
    { i: "entities", x: 57, y: 0, w: 2, h: 728, minW: 1, minH: 160 },
    { i: "duplicates", x: 40, y: 0, w: 3, h: 420, minW: 2, minH: 180 },
  ]);
  const fallbackAlgorithm =
    layoutAlgorithms[0]?.value || DEFAULT_LAYOUT_ALGORITHM;
  const [selectedLayoutAlgorithm, setSelectedLayoutAlgorithm] =
    useState<string>(fallbackAlgorithm);
  const [selectedDirection, setSelectedDirection] = useState<string>(
    DEFAULT_LAYOUT_DIRECTION,
  );
  const [nodeSpacing, setNodeSpacing] = useState<string>(
    String(DEFAULT_NODE_SPACING),
  );
  const [layerSpacing, setLayerSpacing] = useState<string>(
    String(DEFAULT_LAYER_SPACING),
  );
  const [graphexaScale, setGraphexaScale] = useState<string>(
    String(DEFAULT_GRAPHEXA_SCALE),
  );
  const [graphexaIterations, setGraphexaIterations] = useState<string>(
    String(DEFAULT_GRAPHEXA_ITERATIONS),
  );
  const [graphexaMaxIter, setGraphexaMaxIter] = useState<string>(
    String(DEFAULT_GRAPHEXA_MAX_ITER),
  );
  const [graphexaSeed, setGraphexaSeed] = useState<string>("1");
  const [graphexaStart, setGraphexaStart] = useState<string>("");
  const [graphexaAlign, setGraphexaAlign] = useState<string>("vertical");
  const [graphexaEdgeStyle, setGraphexaEdgeStyle] =
    useState<string>("straight");
  const [graphexaScalingRatio, setGraphexaScalingRatio] = useState<string>(
    String(DEFAULT_GRAPHEXA_SCALING_RATIO),
  );
  const [graphexaGravity, setGraphexaGravity] = useState<string>(
    String(DEFAULT_GRAPHEXA_GRAVITY),
  );
  const [graphexaJitterTolerance, setGraphexaJitterTolerance] =
    useState<string>(String(DEFAULT_GRAPHEXA_JITTER_TOLERANCE));
  const [graphexaK, setGraphexaK] = useState<string>("");
  const [graphexaThreshold, setGraphexaThreshold] = useState<string>(
    String(DEFAULT_GRAPHEXA_THRESHOLD),
  );
  const [graphexaMethod, setGraphexaMethod] = useState<string>("auto");
  const [graphexaRotate, setGraphexaRotate] = useState<string>("");
  const [graphexaSubsetKey, setGraphexaSubsetKey] = useState<string>("subset");
  const [graphexaResolution, setGraphexaResolution] = useState<string>(
    String(DEFAULT_GRAPHEXA_RESOLUTION),
  );
  const [graphexaDistributedAction, setGraphexaDistributedAction] =
    useState(false);
  const [graphexaStrongGravity, setGraphexaStrongGravity] = useState(false);
  const [graphexaLinlog, setGraphexaLinlog] = useState(false);
  const [graphexaEquidistant, setGraphexaEquidistant] = useState(false);
  const isGraphexaLayout = selectedLayoutAlgorithm.startsWith(
    GRAPHEXA_ALGORITHM_PREFIX,
  );
  const isGraphexaBfsLayout = selectedLayoutAlgorithm === "graphexa.bfs";
  const isGraphexaForceAtlas2Layout =
    selectedLayoutAlgorithm === "graphexa.forceatlas2";
  const isGraphexaSpringLayout = selectedLayoutAlgorithm === "graphexa.spring";
  const isGraphexaRandomLayout = selectedLayoutAlgorithm === "graphexa.random";
  const isGraphexaShellLayout = selectedLayoutAlgorithm === "graphexa.shell";
  const isGraphexaSpiralLayout = selectedLayoutAlgorithm === "graphexa.spiral";
  const isGraphexaMultipartiteLayout =
    selectedLayoutAlgorithm === "graphexa.multipartite";
  const usesGraphexaIterations =
    selectedLayoutAlgorithm === "graphexa.force" ||
    selectedLayoutAlgorithm === "graphexa.kamada_kawai" ||
    selectedLayoutAlgorithm === "graphexa.investigation_organic" ||
    isGraphexaSpringLayout;
  const usesGraphexaSeed =
    isGraphexaRandomLayout ||
    isGraphexaForceAtlas2Layout ||
    isGraphexaSpringLayout;
  const usesGraphexaScale = GRAPHEXA_SCALE_ALGORITHMS.has(
    selectedLayoutAlgorithm,
  );
  const graphNodeOptions = useMemo(
    () =>
      graphNodes.map((node) => ({
        label:
          typeof node.data?.label === "string"
            ? `${node.data.label} (${node.id})`
            : node.id,
        value: node.id,
      })),
    [graphNodes],
  );
  useEffect(() => {
    if (
      !layoutAlgorithms.some(
        (algorithm) => algorithm.value === selectedLayoutAlgorithm,
      )
    ) {
      setSelectedLayoutAlgorithm(fallbackAlgorithm);
    }
  }, [layoutAlgorithms, selectedLayoutAlgorithm, fallbackAlgorithm]);

  const buildLayout = useCallback(
    (overrides: LayoutConfig = {}): LayoutConfig => ({
      "layout.algorithm": selectedLayoutAlgorithm,
      "layout.direction": selectedDirection,
      "layout.nodeSpacing": toPositiveNumber(nodeSpacing, DEFAULT_NODE_SPACING),
      "layout.layerSpacing": toPositiveNumber(
        layerSpacing,
        DEFAULT_LAYER_SPACING,
      ),
      "graphexa.scale": toPositiveNumber(graphexaScale, DEFAULT_GRAPHEXA_SCALE),
      "graphexa.iterations": toPositiveNumber(
        graphexaIterations,
        DEFAULT_GRAPHEXA_ITERATIONS,
      ),
      "graphexa.maxIter": toPositiveNumber(
        graphexaMaxIter,
        DEFAULT_GRAPHEXA_MAX_ITER,
      ),
      "graphexa.seed": toPositiveNumber(graphexaSeed, 1),
      "graphexa.start": graphexaStart,
      "graphexa.align": graphexaAlign,
      "graphexa.edgeStyle": graphexaEdgeStyle,
      "graphexa.scalingRatio": toPositiveNumber(
        graphexaScalingRatio,
        DEFAULT_GRAPHEXA_SCALING_RATIO,
      ),
      "graphexa.gravity": toPositiveNumber(
        graphexaGravity,
        DEFAULT_GRAPHEXA_GRAVITY,
      ),
      "graphexa.k": graphexaK.trim() ? Number(graphexaK) : "",
      "graphexa.threshold": toPositiveNumber(
        graphexaThreshold,
        DEFAULT_GRAPHEXA_THRESHOLD,
      ),
      "graphexa.method": graphexaMethod,
      "graphexa.jitterTolerance": toPositiveNumber(
        graphexaJitterTolerance,
        DEFAULT_GRAPHEXA_JITTER_TOLERANCE,
      ),
      "graphexa.rotate": graphexaRotate.trim() ? Number(graphexaRotate) : "",
      "graphexa.subsetKey": graphexaSubsetKey,
      "graphexa.resolution": toPositiveNumber(
        graphexaResolution,
        DEFAULT_GRAPHEXA_RESOLUTION,
      ),
      "graphexa.distributedAction": graphexaDistributedAction,
      "graphexa.strongGravity": graphexaStrongGravity,
      "graphexa.linlog": graphexaLinlog,
      "graphexa.equidistant": graphexaEquidistant,
      ...overrides,
    }),
    [
      selectedLayoutAlgorithm,
      selectedDirection,
      nodeSpacing,
      layerSpacing,
      graphexaScale,
      graphexaIterations,
      graphexaMaxIter,
      graphexaSeed,
      graphexaStart,
      graphexaAlign,
      graphexaEdgeStyle,
      graphexaScalingRatio,
      graphexaGravity,
      graphexaK,
      graphexaThreshold,
      graphexaMethod,
      graphexaJitterTolerance,
      graphexaRotate,
      graphexaSubsetKey,
      graphexaResolution,
      graphexaDistributedAction,
      graphexaStrongGravity,
      graphexaLinlog,
      graphexaEquidistant,
    ],
  );

  const applyLayout = useCallback(
    (overrides: LayoutConfig = {}) => {
      setPositionMode("graphexa");
      setLayout(buildLayout(overrides));
    },
    [buildLayout, setPositionMode, setLayout],
  );

  const manualLayout = useCallback(() => {
    setPositionMode("manual");
  }, [setPositionMode]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayWidth, setOverlayWidth] = useState(0);

  useEffect(() => {
    if (!overlayRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setOverlayWidth(entry.contentRect.width);
    });
    ro.observe(overlayRef.current);
    return () => ro.disconnect();
  }, []);

  const visibleLayout = useMemo(() => {
    return panelLayout
      .filter(
        (item) =>
          (item.i === "layouts" && showLayouts) ||
          (item.i === "entities" && showEntities) ||
          (item.i === "duplicates" && showDuplicateMerges),
      )
      .map((item) => {
        const id = item.i as "layouts" | "entities" | "duplicates";
        return {
          ...item,
          isDraggable: !lockedPanels[id],
          isResizable: !lockedPanels[id],
        };
      });
  }, [
    panelLayout,
    showLayouts,
    showEntities,
    showDuplicateMerges,
    lockedPanels,
  ]);

  const duplicateMergeQueue = useMemo<DuplicateQueueEntry[]>(
    () =>
      graphNodes
        .map((node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const queue = Array.isArray(data.agent_duplicate_queue)
            ? data.agent_duplicate_queue.filter(
                (entry): entry is Record<string, unknown> =>
                  Boolean(entry) &&
                  typeof entry === "object" &&
                  !Array.isArray(entry),
              )
            : [];

          if (!queue.length) return null;

          return {
            nodeId: node.id,
            nodeLabel: getEntityPrimaryValue(node, blueprints),
            blueprintLabel: formatAgentValue(data.label),
            queue,
          } satisfies DuplicateQueueEntry;
        })
        .filter((entry): entry is DuplicateQueueEntry => entry !== null),
    [graphNodes, blueprints],
  );
  const duplicateMergeCount = useMemo(
    () =>
      duplicateMergeQueue.reduce(
        (total, entry) => total + entry.queue.length,
        0,
      ),
    [duplicateMergeQueue],
  );

  const focusDuplicateQueueNode = useCallback(
    (nodeId: string) => {
      const targetNode = graphNodes.find((node) => node.id === nodeId);
      if (!targetNode) return;
      const x = targetNode.position?.x ?? 0;
      const y = targetNode.position?.y ?? 0;
      reactFlow.setCenter(x + 30, y + 30, {
        zoom: 1.1,
        duration: 500,
      });
    },
    [graphNodes, reactFlow],
  );
  useEffect(() => {
    if (!showTimelineBar || !hid) {
      setTimelineAuditEvents([]);
      setTimelineCursorIndex(0);
      setTimelineZoom(1);
      setTimelinePan(0);
      setTimelineLoading(false);
      timelineLiveGraphRef.current = null;
      return;
    }
    let cancelled = false;
    timelineLiveGraphRef.current = {
      nodes: graphNodesRef.current.map(cloneAuditValue),
      edges: graphEdgesRef.current.map(cloneAuditValue),
    };
    setTimelineLoading(true);
    window.api.cases
      .activity({ graphId: hid, skip: 0, limit: 5000 })
      .then(({ events }) => {
        if (cancelled) return;
        setTimelineAuditEvents(
          (events as CaseAuditEvent[])
            .slice()
            .sort((a, b) => Number(a.seq) - Number(b.seq)),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load graph audit history:", error);
          toast.error("Failed to load graph audit history.");
        }
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hid, showTimelineBar]);
  const timelineAuditEntries = useMemo<AuditTimelineEntry[]>(() => {
    if (!showTimelineBar) {
      return [];
    }

    const nodes = new Map<string, Node>();
    const edges = new Map<string, Edge>();
    const entries: AuditTimelineEntry[] = [];

    const getProjectedNodeLabel = (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (!node) return nodeId;
      const data = (node.data ?? {}) as Record<string, unknown>;
      return (
        getEntityPrimaryValue(node, blueprints) ||
        formatAgentValue(data.label) ||
        formatAgentValue((node as any).label) ||
        nodeId
      );
    };

    timelineAuditEvents.forEach((event, index) => {
      const payload = event.payload ?? {};
      const id = formatAgentValue(payload.id);
      if (!id) return;
      const time = new Date(event.recorded_at).getTime();
      const eventTime = Number.isFinite(time) ? time : null;
      let entry: AuditTimelineEntry | null = null;

      if (event.category === "entity") {
        if (event.event_type === "delete") {
          const existing = nodes.get(id);
          entry = {
            id: `${event.seq}:entity:${id}`,
            kind: "entity",
            label: existing ? getProjectedNodeLabel(id) : id,
            meta: "entity / delete",
            time: eventTime,
            seq: event.seq,
            nodeId: id,
          };
          nodes.delete(id);
        } else if (event.event_type === "create") {
          const data = cloneAuditValue(payload.data ?? {});
          if (!data.label && payload.label) data.label = payload.label;
          const node = {
            id,
            label: payload.label || data.label || "unknown",
            position: payload.position ?? {
              x: payload.x ?? 0,
              y: payload.y ?? 0,
            },
            data,
            type:
              data.__nodeType === "unverifiedNodeType"
                ? "unverifiedNodeType"
                : "view",
            ctime: event.recorded_at,
            sys_from: event.recorded_at,
          } as Node;
          nodes.set(id, node);
          entry = {
            id: `${event.seq}:entity:${id}`,
            kind: "entity",
            label: getProjectedNodeLabel(id),
            meta: `entity / ${formatAgentValue(data.label) || "create"}`,
            time: eventTime,
            seq: event.seq,
            nodeId: id,
          };
        } else if (event.event_type === "update") {
          const current = nodes.get(id);
          if (current) {
            const nextData = {
              ...(current.data ?? {}),
              ...(payload.data ?? {}),
            };
            const nextPosition = {
              ...((current.position ?? { x: 0, y: 0 }) as Record<
                string,
                number
              >),
              ...(payload.position ?? {}),
            };
            nodes.set(id, {
              ...current,
              position: nextPosition,
              data: nextData,
              label:
                (nextData as Record<string, unknown>).label ??
                (current as any).label,
            } as Node);
          }
          entry = {
            id: `${event.seq}:entity:${id}`,
            kind: "entity",
            label: getProjectedNodeLabel(id),
            meta: "entity / update",
            time: eventTime,
            seq: event.seq,
            nodeId: id,
          };
        }
      } else if (event.category === "edge") {
        if (event.event_type === "delete") {
          const existing = edges.get(id);
          entry = {
            id: `${event.seq}:edge:${id}`,
            kind: "edge",
            label: existing
              ? `${getProjectedNodeLabel(existing.source)} -> ${getProjectedNodeLabel(existing.target)}`
              : id,
            meta: "edge / delete",
            time: eventTime,
            seq: event.seq,
            edgeId: id,
            nodeId: existing?.target ?? existing?.source,
          };
          edges.delete(id);
        } else if (event.event_type === "create") {
          const edge = {
            id,
            source: payload.source,
            target: payload.target,
            data: cloneAuditValue(payload.data ?? {}),
            type: "sfloat",
            markerEnd: {
              type: "arrowclosed",
              color: "#535045",
              width: 16,
              height: 16,
            },
          } as Edge;
          edges.set(id, edge);
          entry = {
            id: `${event.seq}:edge:${id}`,
            kind: "edge",
            label: `${getProjectedNodeLabel(edge.source)} -> ${getProjectedNodeLabel(edge.target)}`,
            meta: `edge / ${formatAgentValue(edge.data?.label) || "create"}`,
            time: eventTime,
            seq: event.seq,
            edgeId: id,
            nodeId: edge.target || edge.source,
          };
        } else if (event.event_type === "update") {
          const current = edges.get(id);
          if (current) {
            edges.set(id, {
              ...current,
              source: payload.source ?? current.source,
              target: payload.target ?? current.target,
              data: { ...(current.data ?? {}), ...(payload.data ?? {}) },
            });
          }
          const next = edges.get(id);
          entry = {
            id: `${event.seq}:edge:${id}`,
            kind: "edge",
            label: next
              ? `${getProjectedNodeLabel(next.source)} -> ${getProjectedNodeLabel(next.target)}`
              : id,
            meta: "edge / update",
            time: eventTime,
            seq: event.seq,
            edgeId: id,
            nodeId: next?.target ?? next?.source,
          };
        }
      }

      if (entry) {
        entries.push(entry);
      }
    });

    if (!entries.length) {
      const fallbackEntries = [
        ...graphNodes.map((node, index) => ({
          id: `entity:${node.id}`,
          kind: "entity" as const,
          label:
            getEntityPrimaryValue(node, blueprints) ||
            formatAgentValue((node.data ?? {}).label) ||
            `Entity ${index + 1}`,
          meta: "entity / current",
          time: getNodeCreatedTime(node),
          nodeId: node.id,
        })),
        ...graphEdges.map((edge) => ({
          id: `edge:${edge.id}`,
          kind: "edge" as const,
          label: `${edge.source} -> ${edge.target}`,
          meta: "edge / current",
          time: getEdgeCreatedTime(edge),
          edgeId: edge.id,
          nodeId: edge.target || edge.source,
        })),
      ];
      return fallbackEntries;
    }

    return entries;
  }, [
    blueprints,
    graphEdges,
    graphNodes,
    showTimelineBar,
    timelineAuditEvents,
  ]);
  const timelineTimeRange = useMemo(() => {
    const timed = timelineAuditEntries
      .map((entry) => entry.time)
      .filter((time): time is number => time !== null);
    if (!timed.length) return { min: 0, max: 0, span: 1 };
    const min = Math.min(...timed);
    const max = Math.max(...timed);
    return { min, max, span: Math.max(1, max - min) };
  }, [timelineAuditEntries]);
  const timelineActiveEntry = timelineAuditEntries[timelineCursorIndex] ?? null;
  const getTimelineEntryPosition = useCallback(
    (entry: AuditTimelineEntry, index: number) => {
      if (
        entry.time !== null &&
        timelineTimeRange.max > timelineTimeRange.min
      ) {
        return (
          ((entry.time - timelineTimeRange.min) / timelineTimeRange.span) * 100
        );
      }
      if (timelineAuditEntries.length <= 1) return 50;
      return (index / (timelineAuditEntries.length - 1)) * 100;
    },
    [timelineAuditEntries.length, timelineTimeRange],
  );
  const timelineVisibleWindow = useMemo(() => {
    const zoom = clamp(timelineZoom, 1, 12);
    const width = 100 / zoom;
    const maxPan = Math.max(0, 100 - width);
    return {
      zoom,
      width,
      maxPan,
      start: clamp(timelinePan, 0, maxPan),
      end: clamp(timelinePan, 0, maxPan) + width,
    };
  }, [timelinePan, timelineZoom]);
  const getTimelineEntryVisiblePosition = useCallback(
    (entry: AuditTimelineEntry, index: number) => {
      const globalPosition = getTimelineEntryPosition(entry, index);
      return (
        ((globalPosition - timelineVisibleWindow.start) /
          timelineVisibleWindow.width) *
        100
      );
    },
    [getTimelineEntryPosition, timelineVisibleWindow],
  );
  useEffect(() => {
    if (!showTimelineBar) return;
    setTimelineCursorIndex((current) =>
      Math.min(
        Math.max(0, current),
        Math.max(0, timelineAuditEntries.length - 1),
      ),
    );
  }, [showTimelineBar, timelineAuditEntries.length]);
  useEffect(() => {
    if (!showTimelineBar || !timelineAuditEntries.length) return;
    setTimelineCursorIndex(timelineAuditEntries.length - 1);
  }, [
    showTimelineBar,
    timelineAuditEvents.length,
    timelineAuditEntries.length,
  ]);
  useEffect(() => {
    const isRewound =
      showTimelineBar &&
      timelineAuditEntries.length > 0 &&
      timelineCursorIndex < timelineAuditEntries.length - 1;
    setTimelinePlaybackReadOnly(isRewound);
  }, [
    setTimelinePlaybackReadOnly,
    showTimelineBar,
    timelineAuditEntries.length,
    timelineCursorIndex,
  ]);
  useEffect(
    () => () => {
      if (timelineReplayFrameRef.current !== null) {
        window.cancelAnimationFrame(timelineReplayFrameRef.current);
        timelineReplayFrameRef.current = null;
      }
      pendingTimelineJumpRef.current = null;
      setTimelinePlaybackReadOnly(false);
    },
    [setTimelinePlaybackReadOnly],
  );
  useEffect(() => {
    setTimelinePan((current) =>
      clamp(current, 0, timelineVisibleWindow.maxPan),
    );
  }, [timelineVisibleWindow.maxPan]);
  const setTimelineZoomFromCenter = useCallback(
    (nextZoom: number, anchorPercent = 50) => {
      const currentWindow = timelineVisibleWindow;
      const next = clamp(nextZoom, 1, 12);
      const globalAnchor =
        currentWindow.start + (anchorPercent / 100) * currentWindow.width;
      const nextWidth = 100 / next;
      const nextMaxPan = Math.max(0, 100 - nextWidth);
      setTimelineZoom(next);
      setTimelinePan(
        clamp(globalAnchor - (anchorPercent / 100) * nextWidth, 0, nextMaxPan),
      );
    },
    [timelineVisibleWindow],
  );
  const handleTimelineWheel = useCallback(
    (event: WheelEvent) => {
      if (!timelineAuditEntries.length) return;
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const anchorPercent = rect.width
        ? clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
        : 50;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const zoomFactor = event.deltaY > 0 ? 0.86 : 1.16;
        setTimelineZoomFromCenter(
          timelineVisibleWindow.zoom * zoomFactor,
          anchorPercent,
        );
        return;
      }
      if (timelineVisibleWindow.maxPan <= 0) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      setTimelinePan((current) =>
        clamp(
          current +
            (delta / Math.max(160, rect.width)) * timelineVisibleWindow.width,
          0,
          timelineVisibleWindow.maxPan,
        ),
      );
    },
    [
      setTimelineZoomFromCenter,
      timelineAuditEntries.length,
      timelineVisibleWindow,
    ],
  );
  const buildTimelineSnapshotAtIndex = useCallback(
    (entryIndex: number) => {
      const liveGraph = timelineLiveGraphRef.current;
      if (!timelineAuditEvents.length || !timelineAuditEntries.length) {
        return liveGraph
          ? {
              nodes: liveGraph.nodes.map(cloneAuditValue),
              edges: liveGraph.edges.map(cloneAuditValue),
            }
          : {
              nodes: graphNodesRef.current.map(cloneAuditValue),
              edges: graphEdgesRef.current.map(cloneAuditValue),
            };
      }

      const clamped = Math.min(
        Math.max(0, entryIndex),
        timelineAuditEntries.length - 1,
      );

      if (clamped === timelineAuditEntries.length - 1 && liveGraph) {
        return {
          nodes: liveGraph.nodes.map(cloneAuditValue),
          edges: liveGraph.edges.map(cloneAuditValue),
        };
      }

      const cutoffSeq = timelineAuditEntries[clamped]?.seq;
      if (!Number.isFinite(Number(cutoffSeq))) {
        return liveGraph
          ? {
              nodes: liveGraph.nodes.map(cloneAuditValue),
              edges: liveGraph.edges.map(cloneAuditValue),
            }
          : {
              nodes: graphNodesRef.current.map(cloneAuditValue),
              edges: graphEdgesRef.current.map(cloneAuditValue),
            };
      }

      const nodes = new Map<string, Node>();
      const edges = new Map<string, Edge>();

      for (const event of timelineAuditEvents) {
        if (Number(event.seq) > Number(cutoffSeq)) break;
        const payload = event.payload ?? {};
        const id = formatAgentValue(payload.id);
        if (!id) continue;

        if (event.category === "entity") {
          if (event.event_type === "delete") {
            nodes.delete(id);
            for (const [edgeId, edge] of edges) {
              if (edge.source === id || edge.target === id) {
                edges.delete(edgeId);
              }
            }
            continue;
          }

          if (event.event_type === "create") {
            const data = cloneAuditValue(payload.data ?? {});
            if (!data.label && payload.label) data.label = payload.label;
            nodes.set(id, {
              id,
              label: payload.label || data.label || "unknown",
              position: payload.position ?? {
                x: payload.x ?? 0,
                y: payload.y ?? 0,
              },
              data,
              type:
                data.__nodeType === "unverifiedNodeType"
                  ? "unverifiedNodeType"
                  : "view",
              ctime: event.recorded_at,
              sys_from: event.recorded_at,
            } as Node);
            continue;
          }

          if (event.event_type === "update") {
            const current = nodes.get(id);
            if (!current) continue;
            const nextData = {
              ...(current.data ?? {}),
              ...(payload.data ?? {}),
            };
            nodes.set(id, {
              ...current,
              position: {
                ...((current.position ?? { x: 0, y: 0 }) as Record<
                  string,
                  number
                >),
                ...(payload.position ?? {}),
              },
              data: nextData,
              label:
                (nextData as Record<string, unknown>).label ??
                (current as any).label,
            } as Node);
          }
        } else if (event.category === "edge") {
          if (event.event_type === "delete") {
            edges.delete(id);
            continue;
          }

          if (event.event_type === "create") {
            if (!payload.source || !payload.target) continue;
            edges.set(id, {
              id,
              source: payload.source,
              target: payload.target,
              data: cloneAuditValue(payload.data ?? {}),
              type: "sfloat",
              markerEnd: {
                type: "arrowclosed",
                color: "#535045",
                width: 16,
                height: 16,
              },
            } as Edge);
            continue;
          }

          if (event.event_type === "update") {
            const current = edges.get(id);
            if (!current) continue;
            edges.set(id, {
              ...current,
              source: payload.source ?? current.source,
              target: payload.target ?? current.target,
              data: { ...(current.data ?? {}), ...(payload.data ?? {}) },
            });
          }
        }
      }

      return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
      };
    },
    [timelineAuditEntries, timelineAuditEvents],
  );
  const jumpToTimelineEntry = useCallback(
    (nextIndex: number, options: { focus?: boolean } = {}) => {
      if (!timelineAuditEntries.length) return;
      const shouldFocus = options.focus ?? true;
      const clamped = Math.min(
        Math.max(0, nextIndex),
        timelineAuditEntries.length - 1,
      );
      setTimelineCursorIndex(clamped);
      const entry = timelineAuditEntries[clamped];
      const entryPosition = getTimelineEntryPosition(entry, clamped);
      if (
        entryPosition < timelineVisibleWindow.start ||
        entryPosition > timelineVisibleWindow.end
      ) {
        setTimelinePan(
          clamp(
            entryPosition - timelineVisibleWindow.width / 2,
            0,
            timelineVisibleWindow.maxPan,
          ),
        );
      }
      pendingTimelineJumpRef.current = {
        index: clamped,
        focus: shouldFocus,
      };
      if (timelineReplayFrameRef.current === null) {
        timelineReplayFrameRef.current = window.requestAnimationFrame(() => {
          timelineReplayFrameRef.current = null;
          const pending = pendingTimelineJumpRef.current;
          pendingTimelineJumpRef.current = null;
          if (!pending) return;
          const pendingEntry = timelineAuditEntries[pending.index];
          const snapshot = buildTimelineSnapshotAtIndex(pending.index);
          setGraphSnapshot({
            nodes: snapshot.nodes,
            edges: snapshot.edges,
          });
          if (pending.focus && pendingEntry?.nodeId) {
            requestAnimationFrame(() =>
              focusDuplicateQueueNode(pendingEntry.nodeId!),
            );
          }
        });
      }
    },
    [
      buildTimelineSnapshotAtIndex,
      focusDuplicateQueueNode,
      getTimelineEntryPosition,
      setGraphSnapshot,
      timelineAuditEntries,
      timelineVisibleWindow,
    ],
  );
  const scrubTimelineAtVisiblePercent = useCallback(
    (visiblePercent: number) => {
      if (!timelineAuditEntries.length) return;
      const globalPosition =
        timelineVisibleWindow.start +
        (clamp(visiblePercent, 0, 100) / 100) * timelineVisibleWindow.width;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      timelineAuditEntries.forEach((entry, index) => {
        const distance = Math.abs(
          getTimelineEntryPosition(entry, index) - globalPosition,
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      jumpToTimelineEntry(closestIndex, { focus: false });
    },
    [
      getTimelineEntryPosition,
      jumpToTimelineEntry,
      timelineAuditEntries,
      timelineVisibleWindow,
    ],
  );
  const closeTimelineBar = useCallback(() => {
    if (timelineReplayFrameRef.current !== null) {
      window.cancelAnimationFrame(timelineReplayFrameRef.current);
      timelineReplayFrameRef.current = null;
    }
    pendingTimelineJumpRef.current = null;
    const liveGraph = timelineLiveGraphRef.current;
    if (liveGraph) {
      setGraphSnapshot({
        nodes: liveGraph.nodes.map(cloneAuditValue),
        edges: liveGraph.edges.map(cloneAuditValue),
      });
    }
    setShowTimelineBar(false);
    setTimelineAuditEvents([]);
    setTimelineCursorIndex(0);
    setTimelineZoom(1);
    setTimelinePan(0);
    setTimelineLoading(false);
    setTimelinePlaybackReadOnly(false);
    timelineLiveGraphRef.current = null;
  }, [setGraphSnapshot, setTimelinePlaybackReadOnly]);
  const setTimelineBarVisible = useCallback(
    (visible: boolean) => {
      if (visible) {
        setShowTimelineBar(true);
        return;
      }
      closeTimelineBar();
    },
    [closeTimelineBar],
  );
  const runDuplicateQueueAction = useCallback(
    async (nodeId: string, mode: "mergeBest" | "forceCreate") => {
      if (!onResolveDuplicateQueueAction) return;
      const targetNode = graphNodes.find((node) => node.id === nodeId);
      if (!targetNode) return;

      setDuplicateQueueAction({ nodeId, mode });
      try {
        await onResolveDuplicateQueueAction(targetNode, mode);
      } catch (error) {
        toast.error(toErrorMessage(error));
      } finally {
        setDuplicateQueueAction((current) =>
          current?.nodeId === nodeId && current.mode === mode ? null : current,
        );
      }
    },
    [graphNodes, onResolveDuplicateQueueAction],
  );

  const agentEntityCount = useMemo(
    () =>
      getAgentGraphEntities(graphNodes, graphEdges, blueprints, graph).length,
    [graphNodes, graphEdges, blueprints, graph],
  );
  const proactiveQueueEntities = useMemo(
    () =>
      orderAgentGraphEntities(
        getAgentGraphEntities(graphNodes, graphEdges, blueprints, graph),
        proactiveQueueOrder,
      ),
    [graphNodes, graphEdges, blueprints, graph, proactiveQueueOrder],
  );
  useEffect(() => {
    const entityIds = new Set(
      proactiveQueueEntities.map((entity) => entity.id),
    );
    setProactiveQueueOrder((order) => {
      const filtered = order.filter((id) => entityIds.has(id));
      if (
        filtered.length === order.length &&
        filtered.every((id, index) => id === order[index])
      ) {
        return order;
      }
      return filtered;
    });
  }, [proactiveQueueEntities]);
  useEffect(() => {
    proactiveQueueOrderRef.current = proactiveQueueOrder;
  }, [proactiveQueueOrder]);
  const moveProactiveQueueEntity = useCallback(
    (entityId: string, direction: -1 | 1) => {
      proactiveAgentCursorRef.current = 0;
      setProactiveQueueOrder((order) => {
        const current = proactiveQueueEntities.map((entity) => entity.id);
        const next = orderAgentGraphEntities(
          proactiveQueueEntities,
          order.length ? order : current,
        ).map((entity) => entity.id);
        const index = next.indexOf(entityId);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= next.length) {
          return next;
        }
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
    },
    [proactiveQueueEntities],
  );
  const dropProactiveQueueEntityAtIndex = useCallback(
    (dropIndex: number) => {
      if (!draggedProactiveQueueId) {
        setDraggedProactiveQueueId(null);
        setProactiveQueueDropIndex(null);
        return;
      }
      proactiveAgentCursorRef.current = 0;
      setProactiveQueueOrder((order) => {
        const current = proactiveQueueEntities.map((entity) => entity.id);
        const next = orderAgentGraphEntities(
          proactiveQueueEntities,
          order.length ? order : current,
        ).map((entity) => entity.id);
        const fromIndex = next.indexOf(draggedProactiveQueueId);
        if (fromIndex < 0) return next;
        const normalizedDropIndex = Math.max(
          0,
          Math.min(dropIndex, next.length),
        );
        const toIndex =
          fromIndex < normalizedDropIndex
            ? normalizedDropIndex - 1
            : normalizedDropIndex;
        if (fromIndex === toIndex) return next;
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      setDraggedProactiveQueueId(null);
      setProactiveQueueDropIndex(null);
    },
    [draggedProactiveQueueId, proactiveQueueEntities],
  );

  const agentSwitchTitle = proactiveAgentEnabled
    ? proactiveAgentStatus.runningTarget
      ? `Proactive agents running: ${proactiveAgentStatus.runningTarget}`
      : `Proactive agents running up to ${proactiveAgentConcurrencyRef.current} at a time for ${agentEntityCount} entities`
    : "No agents mode";
  const proactivePanelVisible =
    PROACTIVE_INTELLIGENCE_RELEASED &&
    (proactiveAgentEnabled ||
      proactivePanelRequested ||
      proactiveLogs.length > 0);
  const proactivePanelHeight = `${
    Math.round(proactivePanelHeightRatio * 1000) / 10
  }%`;

  const proactiveStatusLabel = proactiveAgentStatus.runningTarget
    ? "Running"
    : proactiveAgentStatus.lastError
      ? "Attention"
      : "Watching";
  const proactiveStatusTone = proactiveAgentStatus.lastError
    ? "text-red-300"
    : proactiveAgentStatus.runningTarget
      ? "text-sea"
      : "text-ink-soft";
  const queuedTarget =
    proactiveAgentStatus.lastQueuedTarget || "Nothing queued";
  const runningTarget =
    proactiveAgentStatus.runningTarget ||
    (proactiveAgentEnabled ? "Awaiting next entity" : "Idle");
  const lastError = proactiveAgentStatus.lastError || "No errors";
  const proactiveModelLoadingPercent = proactiveModelLoading
    ? Math.round(proactiveModelLoading.progress * 100)
    : 0;
  const proactiveHeaderStatus = proactiveModelLoading
    ? `${proactiveModelLoading.phase === "loaded" ? "MODEL READY" : proactiveModelLoading.phase === "failed" ? "MODEL LOAD FAILED" : "LOADING MODEL"} ${proactiveModelLoadingPercent}% — ${proactiveModelLoading.model}`
    : proactiveAgentStatus.runningTarget ||
      (proactiveAgentStatus.lastError
        ? `ERR — ${proactiveAgentStatus.lastError}`
        : proactiveAgentEnabled
          ? "AWAITING QUEUE —"
          : "PROACTIVE INTELLIGENCE DISABLED —");
  const activeProactiveNode = proactiveAgentStatus.runningEntityId
    ? graphNodes.find(
        (node) => node.id === proactiveAgentStatus.runningEntityId,
      )
    : null;
  const activeProactiveLabel =
    proactiveAgentStatus.runningTarget ||
    (activeProactiveNode
      ? getEntityPrimaryValue(activeProactiveNode, blueprints)
      : "");
  const activeProactivePosition = activeProactiveNode?.position
    ? {
        x:
          activeProactiveNode.position.x +
          ((activeProactiveNode as any).measured?.width ??
            (activeProactiveNode as any).width ??
            60) /
            2,
        y:
          activeProactiveNode.position.y +
          ((activeProactiveNode as any).measured?.height ??
            (activeProactiveNode as any).height ??
            60) /
            2,
      }
    : null;
  const logAccent = (tone: ProactiveLogTone) => {
    switch (tone) {
      case "sea":
        return { bar: "bg-sea/70", icon: "text-sea", row: "bg-sea/[0.04]" };
      case "success":
        return {
          bar: "bg-emerald-400/70",
          icon: "text-emerald-400",
          row: "bg-emerald-400/[0.04]",
        };
      case "danger":
        return {
          bar: "bg-red-400/70",
          icon: "text-red-400",
          row: "bg-red-400/[0.04]",
        };
      case "ink":
        return { bar: "bg-ink-hard/45", icon: "text-ink-soft/80", row: "" };
      case "muted":
      default:
        return { bar: "bg-ink-hard/30", icon: "text-ink-hard/60", row: "" };
    }
  };
  const kindIcon = (kind: string) => {
    switch (kind) {
      case "agent":
        return "cpu";
      case "round":
        return "refresh";
      case "message":
        return "message";
      case "context":
        return "braces";
      case "tool":
        return "terminal-2";
      case "queue":
        return "list";
      case "run":
        return "circle-check";
      case "error":
        return "alert-triangle";
      case "resolve":
        return "git-merge";
      default:
        return "activity";
    }
  };
  const proactiveLogWindow = useMemo(() => {
    if (!proactiveLogs.length) {
      return {
        beforeHeight: 0,
        afterHeight: 0,
        entries: [] as ProactiveLogEntry[],
      };
    }

    const viewportHeight =
      proactiveLogViewport.height ||
      proactiveLogsRef.current?.clientHeight ||
      360;
    const firstVisible = Math.max(
      0,
      Math.floor(proactiveLogViewport.scrollTop / PROACTIVE_LOG_ROW_HEIGHT) -
        PROACTIVE_LOG_OVERSCAN,
    );
    const visibleCount =
      Math.ceil(viewportHeight / PROACTIVE_LOG_ROW_HEIGHT) +
      PROACTIVE_LOG_OVERSCAN * 2;
    const start = Math.min(firstVisible, Math.max(0, proactiveLogs.length - 1));
    const end = Math.min(proactiveLogs.length, start + visibleCount);

    return {
      beforeHeight: start * PROACTIVE_LOG_ROW_HEIGHT,
      afterHeight:
        Math.max(0, proactiveLogs.length - end) * PROACTIVE_LOG_ROW_HEIGHT,
      entries: proactiveLogs.slice(start, end),
    };
  }, [
    proactiveLogViewport.height,
    proactiveLogViewport.scrollTop,
    proactiveLogs,
  ]);

  // overflow-hidden is intentionally absent — it would clip the react-grid-layout resize handles
  // backdrop-blur is intentionally absent — it forces expensive GPU repaints on every resize pixel
  const panelClass =
    "flex flex-col rounded-sm border border-ink/10  pointer-events-auto backdrop-blur-xs";

  const panelHeaderClass = (locked: boolean) =>
    `panel-drag-handle select-none flex shrink-0 items-center justify-between border-b border-ink/10 px-3 py-2 ${
      locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
    }`;

  const layoutsLabel = showLayouts
    ? "Hide layouts panel"
    : "Show layouts panel";
  const entitiesLabel = showEntities ? "Hide entities" : "Show entities";
  const timelineLabel = showTimelineBar
    ? "Hide graph audit history"
    : "Show graph audit history";
  const timelineBarHeight = 240;

  return (
    <div className="pointer-events-none relative h-full w-full">
      <OverlaySidebar
        graph={graph}
        entitiesLabel={entitiesLabel}
        layoutsLabel={layoutsLabel}
        showEntities={showEntities}
        showLayouts={showLayouts}
        showTimelineBar={showTimelineBar}
        timelineLabel={timelineLabel}
        clearGraph={clearGraph}
        navigate={navigate}
        setShowDuplicateMerges={setShowDuplicateMerges}
        setShowEntities={setShowEntities}
        setShowLayouts={setShowLayouts}
        setShowTimelineBar={setTimelineBarVisible}
        toggleSettings={toggleSettings}
      />
      {/* Floating panels overlay — no overflow-hidden so resize handles aren't clipped */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute bottom-0 left-10 right-0 top-0 z-40"
      >
        {overlayWidth > 0 &&
          (showLayouts || showEntities || showDuplicateMerges) && (
            <GridLayout
              width={overlayWidth}
              cols={12}
              rowHeight={1}
              layout={visibleLayout}
              onDragStop={(next) => {
                setPanelLayout((prev) =>
                  prev.map((item) => {
                    const updated = next.find((n) => n.i === item.i);
                    return updated ? { ...item, ...updated } : item;
                  }),
                );
              }}
              onResizeStart={() => {
                overlayRef.current?.classList.add("panels-resizing");
              }}
              onResizeStop={(next) => {
                overlayRef.current?.classList.remove("panels-resizing");
                setPanelLayout((prev) =>
                  prev.map((item) => {
                    const updated = next.find((n) => n.i === item.i);
                    return updated ? { ...item, ...updated } : item;
                  }),
                );
              }}
              draggableHandle=".panel-drag-handle"
              compactType={null}
              preventCollision={true}
              margin={[8, 0]}
              containerPadding={[8, 8]}
              useCSSTransforms
            >
              {showLayouts && (
                <div key="layouts" className={panelClass}>
                  <div className={panelHeaderClass(lockedPanels.layouts)}>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-xs uppercase tracking-[0.34em] text-ink-soft">
                        Layouts
                      </p>
                      <span className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-hard/40">
                        {positionMode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setLockedPanels((p) => ({ ...p, layouts: !p.layouts }))
                      }
                      title={
                        lockedPanels.layouts ? "Unlock panel" : "Lock panel"
                      }
                      className="flex items-center justify-center text-ink-hard/40 transition-colors hover:text-ink-soft focus:outline-hidden"
                    >
                      <Icon
                        icon={lockedPanels.layouts ? "lock" : "lock-open"}
                        className="h-3.5 w-3.5"
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 overflow-auto p-2">
                    <div className="flex flex-col gap-1 rounded-sm border border-ink/10 bg-ink/3 p-2">
                      <Input.Dropdown
                        data={[]}
                        id="transform-layout-algorithm"
                        label="Transform Layout"
                        options={TRANSFORM_LAYOUT_OPTIONS}
                        value={transformLayoutAlgorithm}
                        onChange={(option) =>
                          setTransformLayoutAlgorithm(
                            option.value as TransformLayoutAlgorithm,
                          )
                        }
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={manualLayout}
                        className={`rounded-sm border px-2 py-1 font-display text-[10px] uppercase tracking-[0.22em] transition-colors ${
                          positionMode === "manual"
                            ? "border-sea/40 bg-sea/5 text-sea"
                            : "border-ink/10 bg-ink/3 text-ink-hard/55 hover:border-ink/20 hover:text-ink-soft"
                        }`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => applyLayout()}
                        className={`rounded-sm border px-2 py-1 font-display text-[10px] uppercase tracking-[0.22em] transition-colors ${
                          positionMode === "graphexa"
                            ? "border-sea/40 bg-sea/5 text-sea"
                            : "border-ink/10 bg-ink/3 text-ink-hard/55 hover:border-ink/20 hover:text-ink-soft"
                        }`}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          fitView({ duration: 250, padding: 0.25 })
                        }
                        className="rounded-sm border border-ink/10 bg-ink/3 px-2 py-1 font-display text-[10px] uppercase tracking-[0.22em] text-ink-hard/55 transition-colors hover:border-ink/20 hover:text-ink-soft"
                      >
                        Fit View
                      </button>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Input.Dropdown
                        data={[]}
                        id="layout-algorithm"
                        label="Layout"
                        options={layoutAlgorithms}
                        value={selectedLayoutAlgorithm}
                        onChange={(option) =>
                          setSelectedLayoutAlgorithm(option.value)
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Input.Dropdown
                        data={[]}
                        id="layout-direction"
                        label="Direction"
                        options={[
                          { label: "Right", value: "RIGHT" },
                          { label: "Left", value: "LEFT" },
                          { label: "Down", value: "DOWN" },
                          { label: "Up", value: "UP" },
                        ]}
                        value={selectedDirection}
                        onChange={(option) =>
                          setSelectedDirection(option.value)
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Input.Field
                        label="Node Spacing"
                        type="number"
                        min={1}
                        step={10}
                        value={nodeSpacing}
                        onInput={(event) =>
                          setNodeSpacing(
                            (event.currentTarget as HTMLInputElement).value,
                          )
                        }
                        className="w-auto! text-ink!"
                      />
                      <Input.Field
                        label="Layer Spacing"
                        type="number"
                        min={1}
                        step={10}
                        value={layerSpacing}
                        onInput={(event) =>
                          setLayerSpacing(
                            (event.currentTarget as HTMLInputElement).value,
                          )
                        }
                        className="w-auto! text-ink!"
                      />
                    </div>

                    {isGraphexaLayout && (
                      <div className="flex flex-col gap-2 rounded-sm border border-ink/10 bg-ink/3 p-2">
                        <div className="flex items-center justify-between">
                          <p className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-soft">
                            Options
                          </p>
                          <span className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-hard/40">
                            {selectedLayoutAlgorithm.replace(
                              GRAPHEXA_ALGORITHM_PREFIX,
                              "",
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Input.Dropdown
                            data={[]}
                            id="graphexa-edge-style"
                            label="Edges"
                            options={[
                              { label: "Straight", value: "straight" },
                              { label: "Bezier", value: "bezier" },
                            ]}
                            value={graphexaEdgeStyle}
                            onChange={(option) =>
                              setGraphexaEdgeStyle(option.value)
                            }
                          />
                        </div>

                        {(isGraphexaBfsLayout ||
                          isGraphexaMultipartiteLayout) && (
                          <div className="grid grid-cols-2 gap-2">
                            {isGraphexaBfsLayout ? (
                              <Input.Dropdown
                                data={[]}
                                id="graphexa-start"
                                label="Start"
                                options={graphNodeOptions}
                                value={graphexaStart}
                                onChange={(option) =>
                                  setGraphexaStart(option.value)
                                }
                              />
                            ) : (
                              <Input.Field
                                label="Subset Key"
                                type="text"
                                value={graphexaSubsetKey}
                                onInput={(event) =>
                                  setGraphexaSubsetKey(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                            )}
                            <Input.Dropdown
                              data={[]}
                              id="graphexa-align"
                              label="Align"
                              options={[
                                { label: "Vertical", value: "vertical" },
                                { label: "Horizontal", value: "horizontal" },
                              ]}
                              value={graphexaAlign}
                              onChange={(option) =>
                                setGraphexaAlign(option.value)
                              }
                            />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          {usesGraphexaScale && (
                            <Input.Field
                              label="Scale"
                              type="number"
                              min={1}
                              step={20}
                              value={graphexaScale}
                              onInput={(event) =>
                                setGraphexaScale(
                                  (event.currentTarget as HTMLInputElement)
                                    .value,
                                )
                              }
                              className="w-auto! text-ink!"
                            />
                          )}
                          {(selectedLayoutAlgorithm === "graphexa.force" ||
                            selectedLayoutAlgorithm ===
                              "graphexa.kamada_kawai" ||
                            selectedLayoutAlgorithm ===
                              "graphexa.investigation_organic" ||
                            isGraphexaSpringLayout) && (
                            <Input.Field
                              label="Iterations"
                              type="number"
                              min={1}
                              step={10}
                              value={graphexaIterations}
                              onInput={(event) =>
                                setGraphexaIterations(
                                  (event.currentTarget as HTMLInputElement)
                                    .value,
                                )
                              }
                              className="w-auto! text-ink!"
                            />
                          )}
                          {usesGraphexaSeed && (
                            <Input.Field
                              label="Seed"
                              type="number"
                              min={1}
                              step={1}
                              value={graphexaSeed}
                              onInput={(event) =>
                                setGraphexaSeed(
                                  (event.currentTarget as HTMLInputElement)
                                    .value,
                                )
                              }
                              className="w-auto! text-ink!"
                            />
                          )}
                          {isGraphexaSpringLayout && (
                            <>
                              <Input.Field
                                label="K"
                                type="number"
                                min={0}
                                step={0.01}
                                value={graphexaK}
                                onInput={(event) =>
                                  setGraphexaK(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                              <Input.Field
                                label="Threshold"
                                type="number"
                                min={0}
                                step={0.0001}
                                value={graphexaThreshold}
                                onInput={(event) =>
                                  setGraphexaThreshold(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                              <Input.Dropdown
                                data={[]}
                                id="graphexa-method"
                                label="Method"
                                options={[
                                  { label: "Auto", value: "auto" },
                                  { label: "Force", value: "force" },
                                  { label: "Energy", value: "energy" },
                                ]}
                                value={graphexaMethod}
                                onChange={(option) =>
                                  setGraphexaMethod(option.value)
                                }
                              />
                            </>
                          )}
                          {isGraphexaShellLayout && (
                            <Input.Field
                              label="Rotate"
                              type="number"
                              step={0.1}
                              value={graphexaRotate}
                              onInput={(event) =>
                                setGraphexaRotate(
                                  (event.currentTarget as HTMLInputElement)
                                    .value,
                                )
                              }
                              className="w-auto! text-ink!"
                            />
                          )}
                          {isGraphexaSpiralLayout && (
                            <Input.Field
                              label="Resolution"
                              type="number"
                              min={0.01}
                              step={0.05}
                              value={graphexaResolution}
                              onInput={(event) =>
                                setGraphexaResolution(
                                  (event.currentTarget as HTMLInputElement)
                                    .value,
                                )
                              }
                              className="w-auto! text-ink!"
                            />
                          )}
                          {isGraphexaForceAtlas2Layout && (
                            <>
                              <Input.Field
                                label="Max Iter"
                                type="number"
                                min={1}
                                step={10}
                                value={graphexaMaxIter}
                                onInput={(event) =>
                                  setGraphexaMaxIter(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                              <Input.Field
                                label="Scaling Ratio"
                                type="number"
                                min={1}
                                step={50}
                                value={graphexaScalingRatio}
                                onInput={(event) =>
                                  setGraphexaScalingRatio(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                              <Input.Field
                                label="Gravity"
                                type="number"
                                min={0}
                                step={0.1}
                                value={graphexaGravity}
                                onInput={(event) =>
                                  setGraphexaGravity(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                              <Input.Field
                                label="Jitter"
                                type="number"
                                min={0}
                                step={0.1}
                                value={graphexaJitterTolerance}
                                onInput={(event) =>
                                  setGraphexaJitterTolerance(
                                    (event.currentTarget as HTMLInputElement)
                                      .value,
                                  )
                                }
                                className="w-auto! text-ink!"
                              />
                            </>
                          )}
                        </div>

                        {(isGraphexaForceAtlas2Layout ||
                          isGraphexaSpiralLayout) && (
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              ...(isGraphexaForceAtlas2Layout
                                ? [
                                    [
                                      "Distributed",
                                      graphexaDistributedAction,
                                      setGraphexaDistributedAction,
                                    ],
                                    [
                                      "Strong Gravity",
                                      graphexaStrongGravity,
                                      setGraphexaStrongGravity,
                                    ],
                                    [
                                      "LinLog",
                                      graphexaLinlog,
                                      setGraphexaLinlog,
                                    ],
                                  ]
                                : []),
                              ...(isGraphexaSpiralLayout
                                ? [
                                    [
                                      "Equidistant",
                                      graphexaEquidistant,
                                      setGraphexaEquidistant,
                                    ],
                                  ]
                                : []),
                            ].map(([label, checked, setter]) => (
                              <label
                                key={label as string}
                                className="flex items-center gap-2 rounded-sm border border-ink/10 bg-ink/5 px-2 py-1 font-display text-[10px] uppercase tracking-[0.18em] text-ink-soft"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked as boolean}
                                  onChange={(event) =>
                                    (setter as (value: boolean) => void)(
                                      event.currentTarget.checked,
                                    )
                                  }
                                  className="h-3 w-3 accent-sea"
                                />
                                <span className="min-w-0 truncate">
                                  {label as string}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showEntities && (
                <div key="entities" className={panelClass}>
                  <div className={panelHeaderClass(lockedPanels.entities)}>
                    <p className="font-display text-xs uppercase tracking-[0.34em] text-ink-soft">
                      Entities
                    </p>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setLockedPanels((p) => ({
                          ...p,
                          entities: !p.entities,
                        }))
                      }
                      title={
                        lockedPanels.entities ? "Unlock panel" : "Lock panel"
                      }
                      className="flex items-center justify-center text-ink-hard/40 transition-colors hover:text-ink-soft focus:outline-hidden"
                    >
                      <Icon
                        icon={lockedPanels.entities ? "lock" : "lock-open"}
                        className="h-3.5 w-3.5"
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-0 overflow-auto ">
                    <Input.Field
                      onChange={(e) => setSearchFilter(e.currentTarget.value)}
                      name="label"
                      placeholder="Search entities..."
                      className="-mt-7 w-full! border rounded-none border-subtle outline-none"
                    />
                    <div class="border-b border-subtle" />
                    <ul className="flex flex-col p-1 py-2">
                      {filteredPlugins?.length === 0 && (
                        <li className="flex w-full items-center justify-center py-8">
                          <div className="text-sm text-ink-soft">
                            {isEntityCatalogLoading
                              ? "Loading entities..."
                              : "No entities found!"}
                          </div>
                        </li>
                      )}
                      {groupedPlugins.map(([category, entities], i) => (
                        <Collapsible
                          startOpen={i === 0}
                          key={category}
                          count={entities.length}
                          title={category}
                        >
                          <ul className="h-full px-4 select-none">
                            {entities.map((entity) => (
                              <EntityOption
                                onDragStart={onDragStart}
                                key={`${category}-${entity.label}`}
                                entity={entity}
                              />
                            ))}
                          </ul>
                        </Collapsible>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {false && (
                <div key="duplicates" className={panelClass}>
                  <div className={panelHeaderClass(lockedPanels.duplicates)}>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-xs uppercase tracking-[0.34em] text-ink-soft">
                        Merge Queue
                      </p>
                      <span className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-hard/40">
                        {duplicateMergeCount}
                      </span>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setLockedPanels((p) => ({
                          ...p,
                          duplicates: !p.duplicates,
                        }))
                      }
                      title={
                        lockedPanels.duplicates ? "Unlock panel" : "Lock panel"
                      }
                      className="flex items-center justify-center text-ink-hard/40 transition-colors hover:text-ink-soft focus:outline-hidden"
                    >
                      <Icon
                        icon={lockedPanels.duplicates ? "lock" : "lock-open"}
                        className="h-3.5 w-3.5"
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 overflow-auto p-2">
                    {duplicateMergeQueue.length === 0 ? (
                      <div className="rounded-sm border border-ink/10 bg-ink/3 px-3 py-4 text-sm text-ink-hard/55">
                        No queued duplicate merges.
                      </div>
                    ) : (
                      duplicateMergeQueue.map((entry) => (
                        <div
                          key={entry.nodeId}
                          className="rounded-sm border border-amber-400/18 bg-amber-400/6 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-display text-[10px] uppercase tracking-[0.22em] text-amber-300/80">
                                {entry.blueprintLabel || "Unverified entity"}
                              </p>
                              <p className="mt-1 wrap-break-word text-sm text-ink-soft">
                                {entry.nodeLabel}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                focusDuplicateQueueNode(entry.nodeId)
                              }
                              className="shrink-0 rounded-sm border border-ink/10 bg-ink/3 px-2 py-1 font-display text-[10px] uppercase tracking-[0.22em] text-ink-hard/55 transition-colors hover:border-ink/20 hover:text-ink-soft"
                            >
                              Focus
                            </button>
                          </div>

                          <div className="mt-3 grid gap-2">
                            {entry.queue.map((item, index) => (
                              <div
                                key={`${entry.nodeId}-duplicate-${index}`}
                                className="rounded-sm border border-ink/8 bg-black/15 px-2 py-2"
                              >
                                <p className="font-display text-[10px] uppercase tracking-[0.12em] text-ink-soft wrap-break-word">
                                  {formatAgentValue(item.title) ||
                                    "Possible duplicate"}
                                </p>
                                <p className="mt-1 text-[10px] text-ink-hard/70 wrap-break-word">
                                  Candidate{" "}
                                  {formatAgentValue(item.candidate_label) ||
                                    formatAgentValue(item.candidate_entity_id)}
                                  {Number.isFinite(Number(item.score))
                                    ? ` · ${Math.round(Number(item.score) * 100)}%`
                                    : ""}
                                </p>
                                {formatAgentValue(item.reason) && (
                                  <p className="mt-1 text-[10px] text-ink-hard/55 wrap-break-word">
                                    {formatAgentValue(item.reason)}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={
                                !onResolveDuplicateQueueAction ||
                                duplicateQueueAction?.nodeId === entry.nodeId
                              }
                              onClick={() =>
                                void runDuplicateQueueAction(
                                  entry.nodeId,
                                  "mergeBest",
                                )
                              }
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 font-display text-[9px] uppercase tracking-[0.18em] text-amber-300 transition-colors enabled:hover:border-amber-300/60 enabled:hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:border-ink/10 disabled:bg-ink/5 disabled:text-ink-hard/40"
                              title="Confirm merge into the highest scoring duplicate"
                            >
                              <Icon icon="git-merge" className="h-3 w-3" />
                              <span>
                                {duplicateQueueAction?.nodeId ===
                                  entry.nodeId &&
                                duplicateQueueAction.mode === "mergeBest"
                                  ? "Merging"
                                  : "Confirm merge"}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={
                                !onResolveDuplicateQueueAction ||
                                duplicateQueueAction?.nodeId === entry.nodeId
                              }
                              onClick={() =>
                                void runDuplicateQueueAction(
                                  entry.nodeId,
                                  "forceCreate",
                                )
                              }
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-ink/14 bg-ink/5 px-2 font-display text-[9px] uppercase tracking-[0.18em] text-ink-soft transition-colors enabled:hover:border-sea/40 enabled:hover:text-sea disabled:cursor-not-allowed disabled:text-ink-hard/40"
                              title="Deny merge and create a separate entity"
                            >
                              <Icon icon="plus" className="h-3 w-3" />
                              <span>
                                {duplicateQueueAction?.nodeId ===
                                  entry.nodeId &&
                                duplicateQueueAction.mode === "forceCreate"
                                  ? "Creating"
                                  : "Deny merge"}
                              </span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </GridLayout>
          )}
      </div>
      {showTimelineBar && (
        <AuditTimelineBar
          timelineActiveEntry={timelineActiveEntry}
          timelineAuditEntries={timelineAuditEntries}
          timelineCursorIndex={timelineCursorIndex}
          timelineVisibleWindow={timelineVisibleWindow}
          timelineZoom={timelineZoom}
          getTimelineEntryVisiblePosition={getTimelineEntryVisiblePosition}
          handleTimelineWheel={handleTimelineWheel}
          jumpToTimelineEntry={jumpToTimelineEntry}
          scrubTimelineAtVisiblePercent={scrubTimelineAtVisiblePercent}
          closeTimelineBar={closeTimelineBar}
          setTimelinePan={setTimelinePan}
          setTimelineZoomFromCenter={setTimelineZoomFromCenter}
        />
      )}
    </div>
  );
}
