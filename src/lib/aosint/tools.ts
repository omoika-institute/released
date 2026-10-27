import { randomUUID } from "node:crypto";
import { tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import type {
  DiscoveryAsset,
  DiscoveryLead,
  DiscoveryFinding,
  EvidenceDocument,
} from "./types";

export interface DiscoveryWorkspace {
  evidence: EvidenceDocument[];
  assets: DiscoveryAsset[];
  leads: DiscoveryLead[];
  findings: DiscoveryFinding[];
  notes: string[];
}

function upsertById<T extends { id: string }>(items: T[], next: T): void {
  const index = items.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    items[index] = next;
    return;
  }

  items.push(next);
}

export function createDiscoveryWorkspace(
  evidence: EvidenceDocument[]
): DiscoveryWorkspace {
  return {
    evidence,
    assets: [],
    leads: [],
    findings: [],
    notes: [],
  };
}

export function createReconTools(workspace: DiscoveryWorkspace): Tool[] {
  return [
    tool({
      name: "register_asset",
      description: "Register a discovered asset, service, or exposed application.",
      parameters: {
        name: z.string().min(1),
        kind: z.string().min(1),
        summary: z.string().min(1),
        internetExposed: z.boolean().optional(),
        technologies: z.array(z.string().min(1)).optional(),
        evidenceIds: z.array(z.string().min(1)).default([]),
      },
      implementation: (params, ctx) => {
        const asset: DiscoveryAsset = {
          id: randomUUID(),
          name: params.name,
          kind: params.kind,
          summary: params.summary,
          internetExposed: params.internetExposed,
          technologies: params.technologies,
          evidenceIds: params.evidenceIds,
        };

        workspace.assets.push(asset);
        ctx.status(`Registered asset: ${asset.name}`);
        return asset;
      },
    }),
    tool({
      name: "queue_lead",
      description:
        "Create an investigation lead for a plausible vulnerability hypothesis.",
      parameters: {
        title: z.string().min(1),
        hypothesis: z.string().min(1),
        priority: z.number().int().min(1).max(5),
        rationale: z.string().min(1),
        affectedAssets: z.array(z.string().min(1)).default([]),
        evidenceIds: z.array(z.string().min(1)).default([]),
        recommendedChecks: z.array(z.string().min(1)).optional(),
      },
      implementation: (params, ctx) => {
        const lead: DiscoveryLead = {
          id: randomUUID(),
          ...params,
        };

        workspace.leads.push(lead);
        ctx.status(`Queued lead: ${lead.title}`);
        return lead;
      },
    }),
    tool({
      name: "capture_note",
      description: "Store a concise analyst note tied to the current run.",
      parameters: {
        note: z.string().min(1),
      },
      implementation: ({ note }, ctx) => {
        workspace.notes.push(note);
        ctx.status("Captured analyst note");
        return { saved: true };
      },
    }),
  ];
}

export function createTriageTools(workspace: DiscoveryWorkspace): Tool[] {
  return [
    tool({
      name: "record_finding",
      description:
        "Promote a validated lead into a structured finding with severity and impact.",
      parameters: {
        title: z.string().min(1),
        severity: z.enum(["critical", "high", "medium", "low", "info"]),
        confidence: z.enum(["high", "medium", "low"]),
        summary: z.string().min(1),
        impact: z.string().min(1),
        reproduction: z.array(z.string().min(1)).min(1),
        affectedAssets: z.array(z.string().min(1)).default([]),
        evidenceIds: z.array(z.string().min(1)).default([]),
        references: z.array(z.string().min(1)).optional(),
        remediation: z.array(z.string().min(1)).optional(),
        cwe: z.string().min(1).optional(),
        cve: z.string().min(1).optional(),
      },
      implementation: (params, ctx) => {
        const finding: DiscoveryFinding = {
          id: randomUUID(),
          ...params,
        };

        workspace.findings.push(finding);
        ctx.status(`Recorded finding: ${finding.title}`);
        return finding;
      },
    }),
    tool({
      name: "refine_lead",
      description:
        "Update a lead when the evidence suggests a narrower or more accurate hypothesis.",
      parameters: {
        leadId: z.string().min(1),
        title: z.string().min(1),
        hypothesis: z.string().min(1),
        priority: z.number().int().min(1).max(5),
        rationale: z.string().min(1),
        affectedAssets: z.array(z.string().min(1)).default([]),
        evidenceIds: z.array(z.string().min(1)).default([]),
        recommendedChecks: z.array(z.string().min(1)).optional(),
      },
      implementation: (params, ctx) => {
        const existing = workspace.leads.find((lead) => lead.id === params.leadId);
        if (!existing) {
          ctx.warn(`Lead not found: ${params.leadId}`);
          return { updated: false, reason: "lead_not_found" };
        }

        upsertById(workspace.leads, {
          ...existing,
          title: params.title,
          hypothesis: params.hypothesis,
          priority: params.priority,
          rationale: params.rationale,
          affectedAssets: params.affectedAssets,
          evidenceIds: params.evidenceIds,
          recommendedChecks: params.recommendedChecks,
        });

        ctx.status(`Refined lead: ${params.title}`);
        return { updated: true };
      },
    }),
    tool({
      name: "dismiss_lead",
      description:
        "Dismiss a weak or disproven lead while preserving an audit note for the analyst.",
      parameters: {
        leadId: z.string().min(1),
        reason: z.string().min(1),
      },
      implementation: ({ leadId, reason }, ctx) => {
        const before = workspace.leads.length;
        workspace.leads = workspace.leads.filter((lead) => lead.id !== leadId);
        workspace.notes.push(`Dismissed lead ${leadId}: ${reason}`);
        ctx.status(`Dismissed lead: ${leadId}`);
        return { removed: before !== workspace.leads.length };
      },
    }),
  ];
}
