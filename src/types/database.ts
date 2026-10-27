export type {
  DatabaseCreateRequest,
  DatabaseCreateResult,
  DatabaseDeleteRequest,
  DatabaseDeleteResult,
  DatabaseExportResult,
  DatabaseImportResult,
  DatabaseMetadata,
  DatabaseVerifyPasswordRequest,
  DatabaseVerifyPasswordResult,
} from "@/main/ipc/database";

export interface EventStream {
  stream_id: string;
  category: string;
  key: string;
}

export interface AppendEvent {
  category: string;
  key: string;
  event_type: string;
  payload: Record<string, any>;
  valid_from: string;
  valid_to?: string | null;
  correlation_id?: string | null;
  causation_id?: string | null;
  actor_id: string;
  expected_version?: number | null;
}

export interface EventRecord {
  seq: number;
  stream_id: string;
  version: number;
  event_type: string;
  payload: Record<string, any>;
  valid_from: string;
  valid_to: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  actor_id: string;
  created_at: string;
}

export interface EventCheckpoint {
  projection_name: string;
  last_seq: number;
  updated_at: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface GraphEntity {
  id: string;
  label: string;
  position?: Position;
  data: Record<string, any>;
  type?: string;
  temp_id?: string;
  sys_from?: string;
  ctime?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, any>;
  type?: string;
  label?: string;
  markerEnd?: {
    type: string;
    color: string;
    width: number;
    height: number;
  };
  temp_id?: string;
}

export interface GraphState {
  nodes: GraphEntity[];
  edges: GraphEdge[];
}

export type JobStatus =
  | "enqueued"
  | "leased"
  | "running"
  | "failed"
  | "completed"
  | "canceled"
  | "dead";

export interface Job {
  job_id: string;
  payload: Record<string, any>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewJob {
  payload: Record<string, any>;
  priority?: number;
  max_attempts?: number;
  scheduled_at?: string;
}
