import type { OsintReport } from "./agentTypes";

const DEFAULT_OSINT_SYSTEM_PROMPT_LINES = [
  `You are a Agent Smith, an expert nation state (*NSA*) open source intelligence (*OSINT*) investigator.
Use tools for any real-world observation.
Never fabricate webpage content, search results, DNS data, or social media lookup tool output, etc.
Prefer direct evidence over inference.
Clearly separate facts, inferences, and unknowns.
When the request is about a person, username, handle, alias, or display name, url, or other datapoint use free third-party websites and services to investigate that data.
For identity lookups, actively pivot to search engines, username-checking services, people-search/profile directories, and major social platforms in the browser.
Once you have completed this task provide a dossier of your findings.
When opening pages from a web search open one at a time, read that page,then proceed with opening the next page from the web search.`,
];

// You are a Agent Smith, an expert nation state (NSA) OSINT investigator sleuthing the internet.
// Use tools for any real-world observation.
// Never fabricate webpage content, search results, DNS data, or social media lookup tool output, etc.
// Prefer direct evidence over inference.
// Clearly separate facts, inferences, and unknowns.
// When the request is about a person, username, handle, alias, or display name, url, or other datapoint use free third-party websites and services to investigate that data.
// For identity lookups, actively pivot to search engines, username-checking services, people-search/profile directories, and major social platforms in the browser.
// When opening pages from a web search open one at a time, read that page,then proceed with opening the next page from the web search.
// Do not revisit pages that you've already gathered data from.
// Explore thoroughly and provide a dossier of your findings.

// You are an OSINT investigation agent.
// Use tools for any real-world observation.
// Never fabricate webpage content, search results, DNS data, or social media lookup tool output, etc.
// Prefer direct evidence over inference.
// Clearly separate facts, inferences, and unknowns.
// When the request is about a person, username, handle, alias, or display name, url, or other datapoint use free third-party websites and services to investigate that data.
// For identity lookups, actively pivot to search engines, username-checking services, people-search/profile directories, and major social platforms in the browser.
// When opening pages from a web search open only one at a time, read that page, only then proceed with opening the next page from the web search. Do an in depth search by visiting a page reading that page and continue this 2 step process for every web search result, third-party service results, or other relevant datapoint that appears.

export const DEFAULT_OSINT_SYSTEM_PROMPT =
  DEFAULT_OSINT_SYSTEM_PROMPT_LINES.join("\n");

export function buildOsintSystemPrompt(customPrompt?: string) {
  return customPrompt?.trim() || DEFAULT_OSINT_SYSTEM_PROMPT;
}

export function buildReconTaskPrompt(target: string, prompt?: string) {
  return [
    `Investigate the target: ${target}`,
    "",
    "Steps:",
    "1. Open the site or primary target if applicable.",
    "2. Read the visible page content and enumerate useful links.",
    "3. Identify entities, contacts, domains, and notable infrastructure.",
    "4. Use DNS and web search lookups only when they add evidence.",
    "5. If the target is a username, handle, or person name, open external lookup services and social/profile sites to search for matching public accounts.",
    "6. Cross-check identity findings across multiple sources before making claims.",
    "7. Summarize findings with evidence-backed statements.",
    prompt?.trim() ? "" : undefined,
    prompt?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPivotTaskPrompt(target: string, prompt?: string) {
  return [
    `Pivot from the target: ${target}`,
    "",
    "Focus on relationships that can be supported with tools:",
    "1. Related domains, subdomains, and infrastructure.",
    "2. Contact points, organizations, and aliases.",
    "3. For people or usernames, pivot through external account lookup services and public social/profile platforms.",
    "4. New leads worth validating next.",
    prompt?.trim() ? "" : undefined,
    prompt?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReportTaskPrompt(target: string, prompt?: string) {
  return [
    `Produce an evidence-backed OSINT report for: ${target}`,
    "",
    "Requirements:",
    "1. Keep claims tied to observed tool outputs.",
    "2. Separate confirmed facts from inference.",
    "3. Call out important unknowns and follow-up leads.",
    prompt?.trim() ? "" : undefined,
    prompt?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStructuredReportPrompt(target: string) {
  return [
    `Convert the investigation into a structured OSINT report for ${target}.`,
    "Only include items supported by the conversation and tool outputs.",
    "If an item is uncertain, leave it out of the fact lists and mention it in unknowns.",
  ].join("\n");
}

export const osintReportJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    entities: { type: "array", items: { type: "string" } },
    contacts: { type: "array", items: { type: "string" } },
    domains: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "entities",
    "contacts",
    "domains",
    "evidence",
    "unknowns",
  ],
};

export function normalizeOsintReport(input: Partial<OsintReport>): OsintReport {
  return {
    summary: input.summary?.trim() ?? "",
    entities: input.entities ?? [],
    contacts: input.contacts ?? [],
    domains: input.domains ?? [],
    evidence: input.evidence ?? [],
    unknowns: input.unknowns ?? [],
  };
}
