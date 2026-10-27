import { z } from "zod";

export const evidenceDocumentSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  uri: z.string().min(1).optional(),
  title: z.string().min(1),
  collectedAt: z.string().min(1).optional(),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const discoveryAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  summary: z.string().min(1),
  internetExposed: z.boolean().optional(),
  technologies: z.array(z.string().min(1)).optional(),
  evidenceIds: z.array(z.string().min(1)).default([]),
});

export const discoveryLeadSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hypothesis: z.string().min(1),
  priority: z.number().int().min(1).max(5),
  rationale: z.string().min(1),
  affectedAssets: z.array(z.string().min(1)).default([]),
  evidenceIds: z.array(z.string().min(1)).default([]),
  recommendedChecks: z.array(z.string().min(1)).optional(),
});

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const discoveryFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: severitySchema,
  confidence: confidenceSchema,
  summary: z.string().min(1),
  impact: z.string().min(1),
  reproduction: z.array(z.string().min(1)).min(1),
  affectedAssets: z.array(z.string().min(1)).default([]),
  evidenceIds: z.array(z.string().min(1)).default([]),
  references: z.array(z.string().min(1)).optional(),
  remediation: z.array(z.string().min(1)).optional(),
  cwe: z.string().min(1).optional(),
  cve: z.string().min(1).optional(),
});

export const discoveryScopeSchema = z.object({
  primaryTarget: z.string().min(1),
  inScope: z.array(z.string().min(1)).min(1),
  outOfScope: z.array(z.string().min(1)).optional(),
  objective: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).optional(),
});

export const vulnerabilityDiscoveryReportSchema = z.object({
  scope: discoveryScopeSchema,
  executiveSummary: z.string().min(1),
  methodology: z.array(z.string().min(1)).min(1),
  assets: z.array(discoveryAssetSchema),
  leads: z.array(discoveryLeadSchema),
  findings: z.array(discoveryFindingSchema),
  evidence: z.array(evidenceDocumentSchema),
  nextSteps: z.array(z.string().min(1)).min(1),
});

export type VulnerabilityDiscoveryReportSchema = z.infer<
  typeof vulnerabilityDiscoveryReportSchema
>;
