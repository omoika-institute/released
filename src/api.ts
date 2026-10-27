import { toast } from "react-toastify";
import i18n from "@/i18n";

// Types
export interface ApiError {
  kind: string;
  message: string;
}

export interface Paginate {
  skip: number;
  limit: number;
}

export interface CreateEntityPayload {
  label: string;
  description: string;
  author: string;
  source: string;
}

export interface UpdateEntityPayload {
  id: string;
  label: string;
  description: string;
  author: string;
  source: string;
}

export interface DeleteEntityPayload {
  id: number | string;
}

export interface FavoriteEntityPayload {
  entity_id: string;
  is_favorite?: boolean;
}

export interface Entity {
  id: string;
  label: string;
  description: string;
  author: string;
  source: string;
  ctime: string;
  mtime: string;
}

export interface ListEntitiesResponse {
  entities: Entity[];
  favorites: string[];
}

export interface AttachmentItem {
  attachment_id: string;
  filename: string;
  media_type: string;
  size: number;
  created_at: string;
}

export interface PluginEntity {
  label: string;
  description: string;
  author?: string;
  [key: string]: any;
}

export interface EntityWithTransforms {
  label: string;
  description: string;
  author?: string;
  blueprint?: any;
  transforms?: any[];
  [key: string]: any;
}

export interface Plugins {
  entities: Entity[];
  favorites: string[];
}

export interface PluginsFull {
  entities: any[];
  favorites: string[];
}

export const entitiesApi = {
  create: async (payload: CreateEntityPayload): Promise<Entity> => {
    try {
      return await window.api.entities.create(payload);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.createFailed"));
      throw error;
    }
  },
  list: async (payload: Paginate): Promise<ListEntitiesResponse> => {
    try {
      return await window.api.entities.list(payload);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.listFailed"));
      throw error;
    }
  },
  getById: async (id: string): Promise<Entity> => {
    try {
      return await window.api.entities.getById(id);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.getFailed"));
      throw error;
    }
  },
  update: async (payload: UpdateEntityPayload): Promise<Entity> => {
    try {
      return await window.api.entities.update(payload);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.updateFailed"));
      throw error;
    }
  },
  delete: async (payload: DeleteEntityPayload): Promise<void> => {
    try {
      await window.api.entities.delete({ id: String(payload.id) });
      return;
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.deleteFailed"));
      throw error;
    }
  },
  favorite: async (payload: FavoriteEntityPayload): Promise<void> => {
    try {
      await window.api.entities.favorite({
        entity_id: payload.entity_id,
        is_favorite: payload.is_favorite ?? true,
      });
      return;
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.favoriteFailed"));
      throw error;
    }
  },
  listAttachments: async (
    graph_id: string,
    entity_id: string,
  ): Promise<AttachmentItem[]> => {
    try {
      return await window.api.entities.listAttachments(graph_id, entity_id);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.entities.attachmentsFailed"));
      throw error;
    }
  },
  // Plugin-related endpoints - these may need to be implemented locally later
  getPluginEntities: async (): Promise<Plugins> => {
    // Return empty for now - plugins will be handled differently
    return { entities: [], favorites: [] };
  },
  getPluginEntitiesFull: async (): Promise<PluginsFull> => {
    return { entities: [], favorites: [] };
  },
  getEntityDetails: async (hid: string): Promise<EntityWithTransforms> => {
    return await window.api.entities.getById(hid);
  },
  getEntityTransforms: async (
    label: string,
    extraPluginDirs?: string[],
  ): Promise<any[]> => {
    return await window.api.plugins.transforms({
      entityLabel: label,
      extraPluginDirs,
    });
  },
};

export interface CreateGraphPayload {
  label: string;
  description: string;
}

export interface UpdateGraphPayload {
  id: string;
  label: string;
  description: string;
}

export interface DeleteGraphPayload {
  id: string;
}

export interface FavoriteGraphPayload {
  graph_id: string;
  is_favorite?: boolean;
}

export interface Graph {
  id: string;
  label: string;
  description: string;
  ctime: string;
  mtime: string;
}

export interface ListGraphsResponse {
  graphs: Graph[];
  favorites: string[];
}

export interface GraphDetails {
  graph: Graph;
  vertices_count: number;
  edges_count: number;
  degree2_count: number;
}

// Case Activity
export interface CaseActivityItem {
  seq: number;
  category: string;
  event_type: string;
  payload: any;
  version: number;
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
  actor_id?: number | null;
  actor_name?: string | null;
}

export interface CaseActivityPage {
  events: CaseActivityItem[];
}

export const graphsApi = {
  create: async (payload: CreateGraphPayload): Promise<Graph> => {
    try {
      return await window.api.cases.create(payload);
    } catch (error) {
      toast.error(error.message || i18n.t("api.cases.createFailed"));
      throw error;
    }
  },
  list: async (payload: Paginate): Promise<ListGraphsResponse> => {
    try {
      const result = await window.api.cases.list(payload);
      return { graphs: result.cases, favorites: result.favorites };
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.cases.listFailed"));
      throw error;
    }
  },
  getById: async (id: string): Promise<GraphDetails> => {
    try {
      return await window.api.cases.getById(id);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.cases.getFailed"));
      throw error;
    }
  },
  update: async (payload: UpdateGraphPayload): Promise<Graph> => {
    try {
      return await window.api.cases.update(payload);
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.cases.updateFailed"));
      throw error;
    }
  },
  delete: async (payload: DeleteGraphPayload): Promise<void> => {
    try {
      await window.api.cases.delete(payload);
      return;
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.cases.deleteFailed"));
      throw error;
    }
  },
  favorite: async (payload: FavoriteGraphPayload): Promise<void> => {
    try {
      return await window.api.cases.favorite({
        graph_id: payload.graph_id,
        is_favorite: payload.is_favorite ?? true,
      });
    } catch (error: any) {
      toast.error(error.message || i18n.t("api.cases.favoriteFailed"));
      throw error;
    }
  },
  exportShare: async (payload: {
    kind: "graph" | "database";
    graphId?: string;
    signalingUrl?: string;
    accessCode?: string;
  }): Promise<{
    url: string;
    shareId: string;
    server: string;
    kind: "graph" | "database";
    caseCount: number;
    eventCount: number;
  }> => {
    return await window.api.cases.exportShare(payload);
  },
  importShare: async (
    url: string,
    options: { preserveCaseIds?: boolean } = {},
  ): Promise<{
    kind: "graph" | "database";
    imported: { sourceId: string; localId: string; label: string }[];
    caseCount: number;
    eventCount: number;
  }> => {
    return await window.api.cases.importShare({ url, ...options });
  },
};

export interface CaseStats {
  entities_count: number;
  edges_count: number;
}

// Activity summary for heatmap
export interface CaseActivityBucket {
  date: string;
  count: number;
}

export interface CaseActivitySummary {
  start: string;
  end: string;
  buckets: CaseActivityBucket[];
}

// Chord diagram response
export interface ChordNode {
  id: string;
  label: string;
  color: string;
}

export interface ChordLink {
  source: string;
  target: string;
  value: number;
}

export interface ChordResponse {
  nodes: ChordNode[];
  links: ChordLink[];
}

export const casesApi = {
  chord: async (id: string): Promise<ChordResponse> => {
    return await window.api.cases.chord({ graphId: id });
  },
  activity: async (
    id: string,
    payload: Paginate,
  ): Promise<CaseActivityPage> => {
    return await window.api.cases.activity({
      graphId: id,
      skip: payload.skip,
      limit: payload.limit,
    });
  },
  activitySummary: async (
    id: string,
    days: number,
  ): Promise<CaseActivitySummary> => {
    return await window.api.cases.activitySummary({ graphId: id, days });
  },
  stats: async (id: string): Promise<CaseStats> => {
    try {
      const details = await window.api.cases.getById(id);
      return {
        entities_count: details.vertices_count,
        edges_count: details.edges_count,
      };
    } catch (error: any) {
      return { entities_count: 0, edges_count: 0 };
    }
  },
};
