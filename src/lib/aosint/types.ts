export type VulnerabilitySeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingConfidence = "high" | "medium" | "low";

export type PipelineStageName =
  | "collection"
  | "reconnaissance"
  | "triage"
  | "reporting";

export interface DiscoveryScope {
  primaryTarget: string;
  inScope: string[];
  outOfScope?: string[];
  objective?: string;
  constraints?: string[];
}

export interface EvidenceDocument {
  id: string;
  sourceId: string;
  uri?: string;
  title: string;
  collectedAt?: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DiscoveryAsset {
  id: string;
  name: string;
  kind: string;
  summary: string;
  internetExposed?: boolean;
  technologies?: string[];
  evidenceIds: string[];
}

export interface DiscoveryLead {
  id: string;
  title: string;
  hypothesis: string;
  priority: number;
  rationale: string;
  affectedAssets: string[];
  evidenceIds: string[];
  recommendedChecks?: string[];
}

export interface DiscoveryFinding {
  id: string;
  title: string;
  severity: VulnerabilitySeverity;
  confidence: FindingConfidence;
  summary: string;
  impact: string;
  reproduction: string[];
  affectedAssets: string[];
  evidenceIds: string[];
  references?: string[];
  remediation?: string[];
  cwe?: string;
  cve?: string;
}

export interface VulnerabilityDiscoveryReport {
  scope: DiscoveryScope;
  executiveSummary: string;
  methodology: string[];
  assets: DiscoveryAsset[];
  leads: DiscoveryLead[];
  findings: DiscoveryFinding[];
  evidence: EvidenceDocument[];
  nextSteps: string[];
}

export interface StageEvent {
  stage: PipelineStageName;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface VulnerabilityDiscoveryHooks {
  onStageStart?: (stage: PipelineStageName) => void;
  onStageEvent?: (event: StageEvent) => void;
  onStageComplete?: (stage: PipelineStageName) => void;
}

export interface EvidenceSource {
  id: string;
  describe(): string;
  collect(
    scope: DiscoveryScope,
    options?: { signal?: AbortSignal }
  ): Promise<EvidenceDocument[]>;
}

export interface LMStudioRuntimeConfig {
  baseUrl?: string;
  model?: string;
  clientIdentifier?: string;
  clientPasskey?: string;
  verboseErrorMessages?: boolean;
}

export interface VulnerabilityDiscoveryPipelineConfig extends LMStudioRuntimeConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxPredictionRounds?: number;
  allowParallelToolExecution?: boolean;
  signal?: AbortSignal;
}

export interface VulnerabilityDiscoveryInput {
  scope: DiscoveryScope;
  seedEvidence?: EvidenceDocument[];
  sources?: EvidenceSource[];
}

export interface VulnerabilityDiscoveryResult {
  report: VulnerabilityDiscoveryReport;
  raw: {
    collectionCount: number;
    reconciliationNotes: string[];
  };
}
