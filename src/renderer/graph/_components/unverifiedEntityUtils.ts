import { toSnakeCase } from "../utils";

export function formatUnverifiedNodeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatUnverifiedNodeValue).filter(Boolean).join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export type DuplicateEntityCandidate = {
  node: any;
  score: number;
  reason: string;
  matchedValues: string[];
  mode: "exact" | "similar";
};

export type AgentEvidenceCitation = {
  id: string;
  kind: "source_url" | "browser_observation" | "tool_result" | "graph_context" | "agent_claim";
  status: "cited" | "needs_validation";
  source: string;
  url?: string;
  observation: string;
  quote?: string;
  tool_name?: string;
  captured_at: string;
  source_graph_entity_id?: string;
  confidence?: string;
};

export type EvidenceCitationContext = {
  sourceGraphEntityId?: unknown;
  sourceGraphEntityLabel?: unknown;
  resolutionCaseId?: unknown;
  resolvedAt?: string;
  toolName?: string;
  fallbackObservation?: unknown;
  confidence?: unknown;
};

const EXACT_DUPLICATE_SCORE = 0.95;
const SIMILAR_DUPLICATE_SCORE = 0.72;
const IDENTITY_KEYS = [
  "url",
  "domain",
  "email",
  "username",
  "handle",
  "ip",
  "address",
  "name",
  "title",
];
const METADATA_KEY_PREFIXES = ["__", "agent_", "resolution_", "resolved_"];
const METADATA_KEYS = new Set([
  "label",
  "provenance",
  "evidence_citations",
  "citation_status",
  "last_agent_resolution",
  "extracted_proactive_entities",
  "extracted_proactive_entities_by_message",
  "relevant_blueprint_labels",
  "reactflow_blueprint_candidates",
]);

function normalizeComparableValue(value: unknown): string {
  const formatted = formatUnverifiedNodeValue(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, " ")
    .trim();

  return formatted.replace(/\s+/g, " ");
}

function tokenizeComparableValue(value: string) {
  return value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function similarityScore(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 5 && right.length >= 5) {
    if (left.includes(right) || right.includes(left)) return 0.9;
  }

  const leftTokens = new Set(tokenizeComparableValue(left));
  const rightTokens = new Set(tokenizeComparableValue(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeCitationUrl(value: unknown) {
  const formatted = formatUnverifiedNodeValue(value);
  if (!formatted) return "";
  try {
    const url = new URL(formatted);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function citationId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return `cite-${hash.toString(36)}`;
}

function citationFromEvidenceValue(
  value: unknown,
  context: EvidenceCitationContext,
  index: number,
): AgentEvidenceCitation | null {
  const capturedAt = context.resolvedAt ?? new Date().toISOString();
  const sourceGraphEntityId = formatUnverifiedNodeValue(context.sourceGraphEntityId);
  const confidence = formatUnverifiedNodeValue(context.confidence);

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const url = normalizeCitationUrl(
      record.url ?? record.source_url ?? record.href ?? record.link,
    );
    const observation =
      formatUnverifiedNodeValue(
        record.observation ??
          record.text ??
          record.summary ??
          record.evidence ??
          record.claim ??
          record.value,
      ) || (url ? `Observed source URL ${url}` : "");
    const quote = formatUnverifiedNodeValue(
      record.quote ?? record.excerpt ?? record.snippet,
    );
    const toolName =
      formatUnverifiedNodeValue(record.tool_name ?? record.toolName) ||
      formatUnverifiedNodeValue(context.toolName);
    const source =
      formatUnverifiedNodeValue(record.source ?? record.title ?? record.label) ||
      url ||
      formatUnverifiedNodeValue(context.sourceGraphEntityLabel) ||
      "AI evidence item";

    if (!observation && !quote && !url) return null;

    const kind: AgentEvidenceCitation["kind"] = url
      ? "source_url"
      : toolName
        ? "tool_result"
        : "agent_claim";
    const status: AgentEvidenceCitation["status"] =
      kind === "agent_claim" ? "needs_validation" : "cited";
    const idSeed = [source, url, observation, quote, index].join("|");

    return {
      id: citationId(idSeed),
      kind,
      status,
      source,
      url: url || undefined,
      observation: observation || quote || source,
      quote: quote || undefined,
      tool_name: toolName || undefined,
      captured_at: capturedAt,
      source_graph_entity_id: sourceGraphEntityId || undefined,
      confidence: confidence || undefined,
    };
  }

  const text = formatUnverifiedNodeValue(value);
  if (!text) return null;
  const url = normalizeCitationUrl(text);
  const status: AgentEvidenceCitation["status"] = url ? "cited" : "needs_validation";

  return {
    id: citationId([text, index, sourceGraphEntityId].join("|")),
    kind: url ? "source_url" : "agent_claim",
    status,
    source:
      url ||
      formatUnverifiedNodeValue(context.sourceGraphEntityLabel) ||
      "AI evidence item",
    url: url || undefined,
    observation: text,
    captured_at: capturedAt,
    source_graph_entity_id: sourceGraphEntityId || undefined,
    confidence: confidence || undefined,
  };
}

export function normalizeEvidenceCitations(
  evidence: unknown,
  context: EvidenceCitationContext = {},
): AgentEvidenceCitation[] {
  const raw = Array.isArray(evidence)
    ? evidence
    : evidence == null
      ? []
      : [evidence];
  const citations = raw
    .map((value, index) => citationFromEvidenceValue(value, context, index))
    .filter((item): item is AgentEvidenceCitation => Boolean(item));
  const fallbackObservation = formatUnverifiedNodeValue(context.fallbackObservation);

  if (!citations.length && fallbackObservation) {
    citations.push({
      id: citationId([
        fallbackObservation,
        formatUnverifiedNodeValue(context.resolutionCaseId),
      ].join("|")),
      kind: "agent_claim",
      status: "needs_validation",
      source:
        formatUnverifiedNodeValue(context.sourceGraphEntityLabel) ||
        "AI-generated claim",
      observation: fallbackObservation,
      captured_at: context.resolvedAt ?? new Date().toISOString(),
      source_graph_entity_id:
        formatUnverifiedNodeValue(context.sourceGraphEntityId) || undefined,
      confidence: formatUnverifiedNodeValue(context.confidence) || undefined,
    });
  }

  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = [
      citation.kind,
      citation.status,
      citation.url,
      citation.observation,
      citation.quote,
      citation.source_graph_entity_id,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getCitationStatus(citations: AgentEvidenceCitation[]) {
  if (!citations.length) return "missing";
  return citations.every((citation) => citation.status === "cited")
    ? "cited"
    : "needs_validation";
}

export function getComparableEntityValues(data: Record<string, unknown> = {}) {
  const values: Array<{ key: string; value: string }> = [];

  for (const key of IDENTITY_KEYS) {
    const normalized = normalizeComparableValue(data[key]);
    if (normalized) values.push({ key, value: normalized });
  }

  for (const [key, rawValue] of Object.entries(data)) {
    if (
      METADATA_KEYS.has(key) ||
      METADATA_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      continue;
    }
    if (IDENTITY_KEYS.includes(key)) continue;
    const normalized = normalizeComparableValue(rawValue);
    if (normalized) values.push({ key, value: normalized });
  }

  const seen = new Set<string>();
  return values.filter((entry) => {
    const dedupeKey = `${entry.key}:${entry.value}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

export function findDuplicateEntityCandidates({
  nodes,
  data,
  blueprintLabel,
  excludeNodeIds = [],
}: {
  nodes: any[];
  data: Record<string, unknown>;
  blueprintLabel: string;
  excludeNodeIds?: string[];
}): DuplicateEntityCandidate[] {
  const excluded = new Set(excludeNodeIds);
  const sourceValues = getComparableEntityValues(data);
  if (!sourceValues.length) return [];

  return nodes
    .filter((node) => {
      if (!node?.id || excluded.has(node.id)) return false;
      const nodeData = (node.data ?? {}) as Record<string, unknown>;
      if (nodeData.__nodeType === "markdown") return false;
      if (nodeData.__nodeType === "unverifiedNodeType") return false;
      return formatUnverifiedNodeValue(nodeData.label) === blueprintLabel;
    })
    .map((node) => {
      const nodeValues = getComparableEntityValues(node.data ?? {});
      let bestScore = 0;
      let reason = "";
      const matchedValues: string[] = [];

      for (const sourceValue of sourceValues) {
        for (const nodeValue of nodeValues) {
          const score = similarityScore(sourceValue.value, nodeValue.value);
          if (score > bestScore) {
            bestScore = score;
            reason = `${sourceValue.key} matches ${nodeValue.key}`;
          }
          if (score >= SIMILAR_DUPLICATE_SCORE) {
            matchedValues.push(`${sourceValue.value} ~ ${nodeValue.value}`);
          }
        }
      }

      return {
        node,
        score: bestScore,
        reason,
        matchedValues: Array.from(new Set(matchedValues)).slice(0, 5),
        mode:
          bestScore >= EXACT_DUPLICATE_SCORE
            ? ("exact" as const)
            : ("similar" as const),
      };
    })
    .filter((candidate) => candidate.score >= SIMILAR_DUPLICATE_SCORE)
    .sort((a, b) => b.score - a.score);
}

export function mergeEntityResolutionData(
  existingData: Record<string, unknown>,
  incomingData: Record<string, unknown>,
  duplicateMeta: Record<string, unknown>
) {
  const provenance = [
    ...(Array.isArray(existingData.provenance) ? existingData.provenance : []),
    ...(Array.isArray(incomingData.provenance) ? incomingData.provenance : []),
  ].filter(Boolean);
  const merges = Array.isArray(existingData.agent_duplicate_merges)
    ? existingData.agent_duplicate_merges
    : [];

  return {
    ...incomingData,
    ...existingData,
    provenance: Array.from(new Set(provenance.map(formatUnverifiedNodeValue))),
    agent_duplicate_merges: [
      ...merges,
      {
        merged_at: new Date().toISOString(),
        ...duplicateMeta,
        incoming: incomingData.agent_resolution_provenance ?? incomingData,
      },
    ],
  };
}

export function parseUnverifiedResolution(data: Record<string, unknown>) {
  const direct = data.agent_resolution_json;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const summary = formatUnverifiedNodeValue(data.agent_resolution_summary);
  const candidates = [
    summary,
    summary.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(),
    summary.match(/\{[\s\S]*\}/)?.[0]?.trim(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return {};
}

export function normalizeResolutionCandidates(data: Record<string, unknown>) {
  if (Array.isArray(data.reactflow_blueprint_candidates)) {
    const directCandidates = data.reactflow_blueprint_candidates.filter(
      (candidate): candidate is Record<string, unknown> =>
        Boolean(candidate) &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
    );
    if (directCandidates.length) return directCandidates;
  }

  const resolution = parseUnverifiedResolution(data);
  const candidates = Array.isArray(resolution.entities)
    ? resolution.entities
    : Array.isArray(resolution.reactflow_entities)
      ? resolution.reactflow_entities
    : Array.isArray(resolution.resolved_entities)
      ? resolution.resolved_entities
      : Array.isArray(resolution.results)
        ? resolution.results
        : [resolution];

  const normalized = candidates.filter(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
  );

  return normalized.length ? normalized : [{}];
}

export function flattenBlueprintElements(elements: unknown): any[] {
  if (!Array.isArray(elements)) return [];
  return elements.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

export function buildBlueprintEntityData({
  blueprintLabel,
  blueprint,
  entity,
  resolution,
  resolutionIndex,
}: {
  blueprintLabel: string;
  blueprint: any;
  entity: any;
  resolution?: Record<string, unknown>;
  resolutionIndex?: number;
}) {
  const data = (entity?.data ?? {}) as Record<string, unknown>;
  const resolved = resolution ?? normalizeResolutionCandidates(data)[0] ?? {};
  const fields = (
    resolved.fields &&
    typeof resolved.fields === "object" &&
    !Array.isArray(resolved.fields)
      ? resolved.fields
      : {}
  ) as Record<string, unknown>;
  const displayName =
    formatUnverifiedNodeValue(resolved.display_name) ||
    formatUnverifiedNodeValue(resolved.name) ||
    formatUnverifiedNodeValue(resolved.title) ||
    formatUnverifiedNodeValue(data.name) ||
    formatUnverifiedNodeValue(data.title) ||
    formatUnverifiedNodeValue(data.resolution_target);

  const nextData: Record<string, unknown> = {
    label: blueprintLabel,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value !== "") nextData[toSnakeCase(key)] = value;
  }

  const elements = flattenBlueprintElements(blueprint?.elements);
  elements.forEach((element, index) => {
    const label = formatUnverifiedNodeValue(element?.label);
    if (!label) return;

    const key = toSnakeCase(label);
    if (nextData[key] != null && nextData[key] !== "") return;

    const directValue = fields[key] ?? fields[label];
    if (directValue != null && directValue !== "") {
      nextData[key] = directValue;
      return;
    }

    if (index === 0 && displayName) nextData[key] = displayName;
  });

  const evidence = Array.isArray(resolved.evidence)
    ? resolved.evidence.map(formatUnverifiedNodeValue).filter(Boolean)
    : [];
  const resolvedAt = new Date().toISOString();
  const evidenceCitations = normalizeEvidenceCitations(
    (Array.isArray(resolved.evidence_citations) && resolved.evidence_citations.length
      ? resolved.evidence_citations
      : resolved.evidence) ?? [],
    {
      sourceGraphEntityId: data.source_graph_entity_id,
      sourceGraphEntityLabel: data.source_graph_entity_label,
      resolutionCaseId: data.resolution_case_id,
      resolvedAt,
      fallbackObservation:
        resolved.graph_reason ??
        resolved.reasoning ??
        data.agent_resolution_summary,
      confidence: resolved.confidence,
    },
  );
  const unknowns = Array.isArray(resolved.unknowns)
    ? resolved.unknowns.map(formatUnverifiedNodeValue).filter(Boolean)
    : [];
  const graphReason =
    formatUnverifiedNodeValue(resolved.graph_reason) ||
    formatUnverifiedNodeValue(resolved.reasoning) ||
    formatUnverifiedNodeValue(data.agent_resolution_summary);
  const provenance = [
    `Resolved from unverified agent node ${entity.id}.`,
    data.resolution_case_id
      ? `Resolution case: ${formatUnverifiedNodeValue(data.resolution_case_id)}.`
      : "",
    graphReason ? `Reasoning: ${graphReason}` : "",
    ...evidence.map((item) => `Evidence: ${item}`),
    ...evidenceCitations.map((item) =>
      item.url
        ? `Citation: ${item.url} (${item.status}).`
        : `Citation: ${item.observation} (${item.status}).`,
    ),
  ].filter(Boolean);

  nextData.provenance = provenance;
  nextData.evidence_citations = evidenceCitations;
  nextData.citation_status = getCitationStatus(evidenceCitations);
  nextData.agent_resolution_provenance = {
    resolved_from_unverified_entity_id: entity.id,
    resolved_by: data.resolved_by,
    resolved_at: resolvedAt,
    original_resolved_at: data.resolved_at,
    resolution_case_id: data.resolution_case_id,
    resolution_target: data.resolution_target,
    source_graph_entity_id: data.source_graph_entity_id,
    source_graph_entity_label: data.source_graph_entity_label,
    selected_blueprint_label: blueprintLabel,
    resolution_index: resolutionIndex,
    confidence: resolved.confidence,
    evidence,
    evidence_citations: evidenceCitations,
    citation_status: getCitationStatus(evidenceCitations),
    unknowns,
    graph_reason: graphReason,
    resolved_entity: resolved,
    raw_resolution_summary: data.agent_resolution_summary,
  };

  return nextData;
}

export function getBestResolutionBlueprintLabel(
  data: Record<string, unknown>,
  blueprints: Record<string, any>,
  resolution?: Record<string, unknown>
) {
  const resolved = resolution ?? normalizeResolutionCandidates(data)[0] ?? {};
  const requested =
    formatUnverifiedNodeValue(resolved.entity_type) ||
    formatUnverifiedNodeValue(resolved.type) ||
    formatUnverifiedNodeValue(resolved.label);
  if (requested && blueprints[requested]) return requested;

  const caseInsensitive = requested
    ? Object.keys(blueprints).find(
        (label) => label.toLowerCase() === requested.toLowerCase()
      )
    : undefined;
  if (caseInsensitive) return caseInsensitive;

  const relevant = Array.isArray(data.relevant_blueprint_labels)
    ? data.relevant_blueprint_labels.map(formatUnverifiedNodeValue)
    : [];
  return relevant.find((label) => blueprints[label]) ?? "";
}
