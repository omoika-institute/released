import type {
  DiscoveryAsset,
  DiscoveryLead,
  DiscoveryScope,
  EvidenceDocument,
  DiscoveryFinding,
} from "./types";

const EVIDENCE_CHAR_LIMIT = 1600;
const MAX_EVIDENCE_ITEMS = 12;

function trimEvidence(content: string): string {
  if (content.length <= EVIDENCE_CHAR_LIMIT) {
    return content;
  }

  return `${content.slice(0, EVIDENCE_CHAR_LIMIT)}...`;
}

function renderEvidence(evidence: EvidenceDocument[]): string {
  return evidence
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item, index) => {
      const uri = item.uri ? `\nURI: ${item.uri}` : "";
      const tags = item.tags?.length ? `\nTags: ${item.tags.join(", ")}` : "";

      return [
        `Evidence ${index + 1}`,
        `ID: ${item.id}`,
        `Source: ${item.sourceId}`,
        `Title: ${item.title}${uri}${tags}`,
        "Content:",
        trimEvidence(item.content),
      ].join("\n");
    })
    .join("\n\n");
}

function renderScope(scope: DiscoveryScope): string {
  const lines = [
    `Primary target: ${scope.primaryTarget}`,
    `In scope: ${scope.inScope.join(", ")}`,
  ];

  if (scope.outOfScope?.length) {
    lines.push(`Out of scope: ${scope.outOfScope.join(", ")}`);
  }

  if (scope.objective) {
    lines.push(`Objective: ${scope.objective}`);
  }

  if (scope.constraints?.length) {
    lines.push(`Constraints: ${scope.constraints.join(", ")}`);
  }

  return lines.join("\n");
}

export function buildSystemPrompt(customPrompt?: string): string {
  return [
    "You are an OSINT-driven application security analyst.",
    "Only produce claims that are grounded in the supplied evidence.",
    "Treat absent evidence as uncertainty, not confirmation.",
    "Prioritize externally reachable attack surface, exposed secrets, weak auth, vulnerable dependencies, insecure cloud storage, and unsafe developer tooling.",
    "Use tools to register assets, leads, and findings while you reason.",
    customPrompt?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReconPrompt(
  scope: DiscoveryScope,
  evidence: EvidenceDocument[]
): string {
  return [
    "Task: analyze the evidence and map the target's likely attack surface.",
    "Objectives:",
    "1. Identify distinct assets or services in scope.",
    "2. Register concrete investigation leads that could indicate vulnerabilities.",
    "3. Avoid final severity claims unless the evidence is already strong enough.",
    "",
    "Scope:",
    renderScope(scope),
    "",
    "Evidence:",
    renderEvidence(evidence),
  ].join("\n");
}

export function buildTriagePrompt(
  scope: DiscoveryScope,
  evidence: EvidenceDocument[],
  assets: DiscoveryAsset[],
  leads: DiscoveryLead[]
): string {
  return [
    "Task: triage registered leads and convert only well-supported leads into findings.",
    "Rules:",
    "1. A finding must cite evidence IDs.",
    "2. If a lead is too weak, leave it as a lead instead of inflating confidence.",
    "3. Reproduction steps can be inferred only when they are realistic and aligned with the evidence.",
    "",
    "Scope:",
    renderScope(scope),
    "",
    "Known assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Current leads:",
    JSON.stringify(leads, null, 2),
    "",
    "Evidence:",
    renderEvidence(evidence),
  ].join("\n");
}

export function buildReportingPrompt(params: {
  scope: DiscoveryScope;
  evidence: EvidenceDocument[];
  assets: DiscoveryAsset[];
  leads: DiscoveryLead[];
  findings: DiscoveryFinding[];
}): string {
  const { scope, evidence, assets, leads, findings } = params;

  return [
    "Generate a structured vulnerability discovery report.",
    "Balance concise executive-level summary with technically specific findings.",
    "Do not invent evidence IDs or assets.",
    "",
    "Scope:",
    renderScope(scope),
    "",
    "Assets:",
    JSON.stringify(assets, null, 2),
    "",
    "Open leads:",
    JSON.stringify(leads, null, 2),
    "",
    "Findings:",
    JSON.stringify(findings, null, 2),
    "",
    "Evidence:",
    renderEvidence(evidence),
  ].join("\n");
}
