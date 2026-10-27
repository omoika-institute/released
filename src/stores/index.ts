import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  graphsApi,
  Graph,
  UpdateGraphPayload,
  DeleteGraphPayload,
  FavoriteGraphPayload,
  entitiesApi,
  Entity,
  CreateEntityPayload,
  UpdateEntityPayload,
  DeleteEntityPayload,
  FavoriteEntityPayload,
  Paginate,
  CreateGraphPayload,
} from "@/api";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType,
  Viewport,
} from "@xyflow/react";

// Auth store
type UserRoles = "admin" | "superadmin" | "analyst" | "client";
export interface User {
  email: string;
  ctime: string;
  exp: number;
  iat: number;
  name: string;
  roles: UserRoles;
  sub: number;
}

interface AuthState {
  password: null | string;
  currentDatabaseId: null | string;
  hashPassword: (value: string) => void;
  setCurrentDatabase: (databaseId: string, password?: string) => void;
  clearSession: () => void;
}

interface GraphState {
  graph: Graph | null;
  vertices_count: number | null;
  edges_count: number | null;
  degree2_count: number | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  getGraph: (id: string) => void;
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  graph: null,
  vertices_count: null,
  edges_count: null,
  degree2_count: null,
  isLoading: true,
  isError: false,
  error: null,
  getGraph: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await graphsApi.getById(id);
      set({ ...data, isLoading: false, isError: false, error: null });
    } catch (error) {
      set({ error: error.message, isLoading: false, graph: null });
    }
  },
}));

// Graphs store
interface GraphsState {
  graphs: Graph[];
  favorites: string[];
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  fetchCases: (payload: Paginate) => Promise<void>;
  createCase: (payload: CreateGraphPayload) => Promise<Graph>;
  updateCase: (payload: UpdateGraphPayload) => Promise<Graph>;
  deleteCase: (payload: DeleteGraphPayload) => Promise<void>;
  favoriteCase: (payload: FavoriteGraphPayload) => Promise<void>;
  unfavoriteCase: (payload: FavoriteGraphPayload) => Promise<void>;
}

export const useCasesStore = create<GraphsState>()((set, get) => ({
  graphs: [],
  favorites: [],
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
  error: null,
  fetchCases: async (payload: Paginate) => {
    set({ isLoading: true, error: null });
    try {
      const { graphs, favorites } = await graphsApi.list(payload);
      set({ graphs, favorites, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  createCase: async (payload: CreateGraphPayload) => {
    set({ isCreating: true, error: null });
    try {
      const newGraph = await graphsApi.create(payload);
      // Add the new graph to the graphs list
      const currentGraphs = get().graphs;
      set({ graphs: [...currentGraphs, newGraph], isCreating: false });
      return newGraph;
    } catch (error) {
      set({ error: error.message, isCreating: false });
      throw error;
    }
  },
  updateCase: async (payload: UpdateGraphPayload) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedGraph = await graphsApi.update(payload);

      // Update the graphs list if the updated graph is in it
      const currentGraphs = get().graphs;
      const updatedGraphs = currentGraphs.map((graph) =>
        graph.id === updatedGraph.id.toString()
          ? {
              ...graph,
              label: updatedGraph.label,
              description: updatedGraph.description,
            }
          : graph,
      );

      set({ graphs: updatedGraphs, isUpdating: false });

      return updatedGraph;
    } catch (error) {
      set({ error: error.message, isUpdating: false });
      throw error;
    }
  },
  deleteCase: async (payload: DeleteGraphPayload) => {
    set({ isDeleting: true, error: null });
    try {
      await graphsApi.delete(payload);

      // Remove the deleted graph from the graphs list
      const currentGraphs = get().graphs;
      const filteredGraphs = currentGraphs.filter(
        (graph) => graph.id !== payload.id.toString(),
      );

      set({ graphs: filteredGraphs, isDeleting: false });
    } catch (error) {
      set({ error: error.message, isDeleting: false });
      throw error;
    }
  },
  favoriteCase: async (payload: FavoriteGraphPayload) => {
    try {
      await graphsApi.favorite({ ...payload, is_favorite: true });
      const currentFavorites = get().favorites;
      if (!currentFavorites.includes(payload.graph_id)) {
        set({ favorites: [...currentFavorites, payload.graph_id] });
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
  unfavoriteCase: async (payload: FavoriteGraphPayload) => {
    try {
      await graphsApi.favorite({ ...payload, is_favorite: false });
      const currentFavorites = get().favorites;
      set({
        favorites: currentFavorites.filter((id) => id !== payload.graph_id),
      });
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
}));

interface EntityState {
  entity: Entity | null;
  isLoading: boolean;
  error: string | null;
  getEntity: (id: string) => void;
}

export const useEntityStore = create<EntityState>()((set, get) => ({
  entity: null,
  isLoading: true,
  error: null,
  getEntity: async (id: string) => {
    set({ isLoading: true });
    try {
      const entity = await entitiesApi.getById(id);
      set({ entity, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false, entity: null });
    }
  },
}));
interface Transform {
  label: string;
  icon: string;
}

interface Transforms {
  [any: string]: Transform[];
}

// TODO: type frfr ong
interface Blueprint {}

// Entities store
interface EntitiesState {
  entities: Entity[];
  favorites: string[];
  plugins: Entity[];
  blueprints: any;
  currentEntity: Entity | null;
  transforms: Transforms;
  isLoading: boolean;
  isLoadingEntity: boolean;
  isLoadingPlugins: boolean;
  isLoadingTransforms: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: string | null;
  entityError: string | null;
  fetchEntities: (payload: Paginate) => Promise<void>;
  fetchPluginEntities: () => Promise<void>;
  createEntity: (payload: CreateEntityPayload) => Promise<Entity>;
  updateEntity: (payload: UpdateEntityPayload) => Promise<Entity>;
  deleteEntity: (payload: DeleteEntityPayload) => Promise<void>;
  favoriteEntity: (payload: FavoriteEntityPayload) => Promise<void>;
  unfavoriteEntity: (payload: FavoriteEntityPayload) => Promise<void>;
  setPlugins: (payload: any) => Promise<void>;
  setBlueprints: (payload: any) => Promise<void>;
  getBlueprint: (label: string) => any;
  fetchTransforms: (label: string, extraPluginDirs?: string[]) => Promise<void>;
  clearTransforms: () => Promise<void>;
}
export const useEntitiesStore = create<EntitiesState>()((set, get) => ({
  entities: [],
  favorites: [],
  blueprints: [],
  plugins: [],
  currentEntity: null,
  transforms: {},
  isLoading: false,
  isLoadingEntity: false,
  isLoadingPlugins: false,
  isLoadingTransforms: false,
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
  error: null,
  entityError: null,
  fetchEntities: async (payload: Paginate) => {
    set({ isLoading: true, error: null });
    try {
      const response = await entitiesApi.list(payload);
      set({
        entities: response.entities,
        favorites: response.favorites,
        isLoading: false,
      });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },
  fetchPluginEntities: async () => {
    set({ isLoadingPlugins: true, error: null });
    try {
      const [plugins, blueprints] = await Promise.all([
        window.api.plugins.list(),
        window.api.plugins.blueprints(),
      ]);
      set({
        plugins,
        blueprints,
        isLoadingPlugins: false,
      });
    } catch (error) {
      set({ error: error.message, isLoadingPlugins: false });
    }
  },
  setPlugins: async (plugins) => set({ plugins }),
  setBlueprints: async (blueprints) => set({ blueprints }),
  getBlueprint: (label) => ({ ...get().blueprints[label] }),
  fetchTransforms: async (label: string, extraPluginDirs?: string[]) => {
    const existingTransforms = get().transforms;
    const cachedTransforms = existingTransforms[label];
    const shouldFetch =
      !cachedTransforms ||
      (cachedTransforms.length === 0 &&
        Array.isArray(extraPluginDirs) &&
        extraPluginDirs.length > 0);
    if (shouldFetch) {
      set({ isLoadingTransforms: true, error: null });
      try {
        const response = await entitiesApi.getEntityTransforms(
          label,
          extraPluginDirs,
        );
        set({
          transforms: {
            ...existingTransforms,
            [label]: response,
          },
          isLoadingTransforms: false,
        });
      } catch (error) {
        set({
          error: error.message,
          isLoadingTransforms: false,
        });
      }
    }
  },
  clearTransforms: async () => {
    set({ transforms: {} });
  },
  createEntity: async (payload: CreateEntityPayload) => {
    set({ isCreating: true, error: null });
    try {
      const newEntity = await entitiesApi.create(payload);
      // Add the new entity to the entities list
      const currentEntities = get().entities;
      set({ entities: [...currentEntities, newEntity], isCreating: false });
      return newEntity;
    } catch (error) {
      set({ error: error.message, isCreating: false });
      throw error;
    }
  },
  updateEntity: async (payload: UpdateEntityPayload) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedEntity = await entitiesApi.update(payload);
      const currentEntities = get().entities;
      const updatedEntities = currentEntities.map((entity) =>
        entity.id === updatedEntity.id ? updatedEntity : entity,
      );
      set({
        entities: updatedEntities,
        currentEntity: updatedEntity,
        isUpdating: false,
      });
      return updatedEntity;
    } catch (error) {
      set({ error: error.message, isUpdating: false });
      throw error;
    }
  },
  deleteEntity: async ({ id }: DeleteEntityPayload) => {
    set({ isDeleting: true, error: null });
    try {
      await entitiesApi.delete({ id });
      const currentEntities = get().entities;
      const filteredEntities = currentEntities.filter(
        (entity) => entity.id !== id,
      );
      const currentEntity = get().currentEntity;
      const updatedCurrentEntity =
        currentEntity?.id === id ? null : currentEntity;
      set({
        entities: filteredEntities,
        currentEntity: updatedCurrentEntity,
        isDeleting: false,
      });
    } catch (error) {
      set({ error: error.message, isDeleting: false });
      throw error;
    }
  },
  favoriteEntity: async (payload: FavoriteEntityPayload) => {
    try {
      await entitiesApi.favorite({ ...payload, is_favorite: true });
      const currentFavorites = get().favorites;
      if (!currentFavorites.includes(payload.entity_id)) {
        set({ favorites: [...currentFavorites, payload.entity_id] });
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
  unfavoriteEntity: async (payload: FavoriteEntityPayload) => {
    try {
      await entitiesApi.favorite({ ...payload, is_favorite: false });
      const currentFavorites = get().favorites;
      set({
        favorites: currentFavorites.filter((id) => id !== payload.entity_id),
      });
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },
}));

type LoaderType = "screen" | "bar";

// Global loader store
interface LoaderState {
  isLoading: boolean;
  type: LoaderType;
  setIsLoading: (isLoading: boolean) => void;
}

export const useLoaderStore = create<LoaderState>()((set) => ({
  isLoading: false,
  type: "screen",
  setIsLoading: (isLoading: boolean, type: LoaderType = "bar") =>
    set({ isLoading, type }),
}));

// App settings store
type SettingsPage = "account" | "plugins";
export interface SettingsState {
  settingsPage: SettingsPage;
}

export const useAppStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settingsPage: "account",
    }),
    {
      name: "settings",
    },
  ),
);

export type PositionMode =
  | "manual"
  | "force"
  | "graphexa"
  | "tree"
  | "right tree";
export type TransformLayoutAlgorithm =
  | "transform_incremental"
  | "transform_locked";

export interface FlowState {
  nodes: Node[];
  edges: Edge[];
  activeGraphId: string | null;
  graphSnapshots: Record<string, { nodes: Node[]; edges: Edge[] }>;
  timelinePlaybackReadOnly: boolean;
  positionMode: PositionMode;
  transformLayoutAlgorithm: TransformLayoutAlgorithm;
  viewports: Record<string, Viewport>;
  setActiveGraph: (graphId: string) => void;
  dropGraphSnapshot: (graphId: string) => void;
  setTimelinePlaybackReadOnly: (readOnly: boolean) => void;
  setGraph: (payload: { nodes: Node[]; edges: Edge[] }) => void;
  handleEntityChange: (changes: NodeChange[]) => void;
  handleRelationshipsChange: (changes: EdgeChange[]) => void;
  onRelationshipConnect: (connection: Connection) => void;
  setEntities: (nodes: Node[]) => void;
  setRelationships: (edges: Edge[]) => void;
  addEntity: (node: Node) => void;
  addEntities: (node: Node[]) => void;
  addRelationship: (edge: Edge) => void;
  addRelationships: (edge: Edge[]) => void;
  removeRelationship: (id: Edge["id"]) => void;
  removeEntity: (nodeId: string) => void;
  updateEntity: (nodeId: string, updates: Partial<Node>) => void;
  clearGraph: () => void;
  setPositionMode: (mode: PositionMode) => void;
  setTransformLayoutAlgorithm: (algorithm: TransformLayoutAlgorithm) => void;
  setViewport: (graphId: string, viewport: Viewport) => void;
  setEntityEdit: (nodeId: string) => void;
  setEntityType: (nodeId: string, type: string) => void;
  setEntityView: (nodeId: string) => void;
  updateRelationship: (id: string, edgeUpdate: Partial<Edge>) => void;
  removeTempRelationshipId: (fromId: string, toId: string) => void;
}

// Initial empty state for graph store
const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];
const markerEnd = {
  type: MarkerType.ArrowClosed,
  color: "#535045",
  width: 16,
  height: 16,
};

const withActiveGraphSnapshot = (
  state: FlowState,
  graph: { nodes: Node[]; edges: Edge[] },
) => ({
  nodes: graph.nodes,
  edges: graph.edges,
  graphSnapshots: state.activeGraphId
    ? {
        ...state.graphSnapshots,
        [state.activeGraphId]: graph,
      }
    : state.graphSnapshots,
});

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      activeGraphId: null,
      graphSnapshots: {},
      timelinePlaybackReadOnly: false,
      positionMode: "manual",
      transformLayoutAlgorithm: "transform_incremental",
      viewports: {},
      setActiveGraph: (graphId) =>
        set((state) => {
          const currentSnapshots = state.activeGraphId
            ? {
                ...state.graphSnapshots,
                [state.activeGraphId]: {
                  nodes: state.nodes,
                  edges: state.edges,
                },
              }
            : state.graphSnapshots;
          const snapshot = currentSnapshots[graphId] ?? {
            nodes: [],
            edges: [],
          };

          return {
            activeGraphId: graphId,
            graphSnapshots: currentSnapshots,
            nodes: snapshot.nodes,
            edges: snapshot.edges,
          };
        }),
      dropGraphSnapshot: (graphId) =>
        set((state) => {
          const { [graphId]: _dropped, ...graphSnapshots } =
            state.graphSnapshots;
          if (state.activeGraphId !== graphId) return { graphSnapshots };

          return {
            activeGraphId: null,
            graphSnapshots,
            nodes: [],
            edges: [],
          };
        }),
      setPositionMode: (mode: PositionMode) => set({ positionMode: mode }),
      setTransformLayoutAlgorithm: (algorithm: TransformLayoutAlgorithm) =>
        set({ transformLayoutAlgorithm: algorithm }),
      setViewport: (graphId, viewport) =>
        set({
          viewports: {
            ...get().viewports,
            [graphId]: viewport,
          },
        }),
      setTimelinePlaybackReadOnly: (timelinePlaybackReadOnly) =>
        set({ timelinePlaybackReadOnly }),
      clearGraph: () =>
        set((state) =>
          withActiveGraphSnapshot(state, { nodes: [], edges: [] }),
        ),
      setGraph: ({ nodes, edges }) =>
        set((state) => withActiveGraphSnapshot(state, { nodes, edges })),
      // start (relationship/reactflow edge) logic
      setRelationships: (edges) =>
        set((state) =>
          withActiveGraphSnapshot(state, { nodes: state.nodes, edges }),
        ),
      addRelationship: (edge) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: [...state.edges, edge],
          }),
        ),
      addRelationships: (edges) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: [...state.edges, ...edges],
          }),
        ),
      removeTempRelationshipId: (fromId: string, toId: string) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            // remap reactflow generated edge id -> authoritative UUID from server
            edges: state.edges.map((e) =>
              e.id === fromId
                ? { ...e, id: toId, type: "sfloat", markerEnd }
                : e,
            ),
          }),
        ),
      updateRelationship: (id, update) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: state.edges.map((edge) => {
              if (edge.id === id) {
                return {
                  ...edge,
                  ...update,
                  id: edge.id,
                };
              }
              return edge;
            }),
          }),
        ),
      removeRelationship: (id) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: state.edges.filter((e) => e.id !== id),
          }),
        ),
      handleRelationshipsChange: (changes) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: applyEdgeChanges(changes, state.edges),
          }),
        ),
      onRelationshipConnect: (connection) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes,
            edges: addEdge(
              {
                ...connection,
                type: "sfloat",
                markerEnd,
              },
              state.edges,
            ),
          }),
        ),
      // start (entity/reactflow node) logic
      setEntities: (nodes) =>
        set((state) =>
          withActiveGraphSnapshot(state, { nodes, edges: state.edges }),
        ),
      addEntity: (node) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: [...state.nodes, node],
            edges: state.edges,
          }),
        ),
      addEntities: (nodes) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: [...state.nodes, ...nodes],
            edges: state.edges,
          }),
        ),
      updateEntity: (nodeId, updates) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, ...updates } : node,
            ),
            edges: state.edges,
          }),
        ),
      removeEntity: (nodeId) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes.filter((node) => node.id !== nodeId),
            edges: state.edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId,
            ),
          }),
        ),
      handleEntityChange: (changes) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: applyNodeChanges(changes, state.nodes),
            edges: state.edges,
          }),
        ),
      // node display type logic (https://reactflow.dev/examples/nodes/custom-node)
      setEntityType: (nodeId, type = "view") =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, type } : node,
            ),
            edges: state.edges,
          }),
        ),
      setEntityEdit: (nodeId) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, type: "edit" } : node,
            ),
            edges: state.edges,
          }),
        ),
      setEntityView: (nodeId) =>
        set((state) =>
          withActiveGraphSnapshot(state, {
            nodes: state.nodes.map((node) =>
              node.id === nodeId ? { ...node, type: "view" } : node,
            ),
            edges: state.edges,
          }),
        ),
    }),
    {
      name: "flow-settings",
      partialize: (state) => ({
        transformLayoutAlgorithm: state.transformLayoutAlgorithm,
      }),
    },
  ),
);

// Attachments panel store
interface AttachmentTab {
  entityId: string;
  title: string;
}

interface AttachmentsState {
  open: boolean;
  tabs: AttachmentTab[];
  active?: string;
  openPanel: () => void;
  closePanel: () => void;
  addTab: (entityId: string, title: string) => void;
  removeTab: (entityId: string) => void;
  setActive: (entityId: string) => void;
}

export const useAttachmentsStore = create<AttachmentsState>((set, get) => ({
  open: false,
  tabs: [],
  active: undefined,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  addTab: (entityId, title) => {
    const tabs = get().tabs;
    if (!tabs.find((t) => t.entityId === entityId)) {
      set({ tabs: [...tabs, { entityId, title }] });
    }
    set({ active: entityId, open: true });
  },
  removeTab: (entityId) => {
    const tabs = get().tabs.filter((t) => t.entityId !== entityId);
    const wasActive = get().active === entityId;
    set({ tabs });
    if (wasActive) {
      set({ active: tabs.length ? tabs[tabs.length - 1].entityId : undefined });
    }
    if (tabs.length === 0) set({ open: false });
  },
  setActive: (entityId) => set({ active: entityId, open: true }),
}));

// PDF viewer panel store
interface PdfViewerState {
  open: boolean;
  attachmentId?: string;
  filename?: string;
  page: number;
  numPages?: number;
  openViewer: (attachmentId: string, filename?: string) => void;
  closeViewer: () => void;
  setPage: (page: number) => void;
  setNumPages: (n: number) => void;
}

interface PdfTab {
  attachmentId: string;
  filename?: string;
  page: number;
  numPages?: number;
  // Top-left coordinates (in page space) for current page view
  pageCoords?: { x: number; y: number };
}

interface PdfViewerTabsState {
  open: boolean;
  tabs: PdfTab[];
  active?: string;
  openViewer: (attachmentId: string, filename?: string) => void;
  closeTab: (attachmentId: string) => void;
  closeViewer: () => void;
  setActive: (attachmentId: string) => void;
  setPage: (attachmentId: string, page: number) => void;
  setNumPages: (attachmentId: string, n: number) => void;
  setPageCoords: (
    attachmentId: string,
    coords: { x: number; y: number },
  ) => void;
}

export const usePdfViewerStore = create<PdfViewerTabsState>((set, get) => ({
  open: false,
  tabs: [],
  active: undefined,
  openViewer: (attachmentId, filename) => {
    const tabs = get().tabs;
    if (!tabs.find((t) => t.attachmentId === attachmentId)) {
      set({ tabs: [...tabs, { attachmentId, filename, page: 1 }] });
    }
    set({ open: true, active: attachmentId });
  },
  closeTab: (attachmentId) => {
    const next = get().tabs.filter((t) => t.attachmentId !== attachmentId);
    const wasActive = get().active === attachmentId;
    set({ tabs: next });
    if (wasActive) {
      set({
        active: next.length ? next[next.length - 1].attachmentId : undefined,
      });
    }
    if (next.length === 0) set({ open: false });
  },
  closeViewer: () => set({ open: false, tabs: [], active: undefined }),
  setActive: (attachmentId) => set({ active: attachmentId }),
  setPage: (attachmentId, page) =>
    set({
      tabs: get().tabs.map((t) =>
        t.attachmentId === attachmentId ? { ...t, page } : t,
      ),
    }),
  setNumPages: (attachmentId, n) =>
    set({
      tabs: get().tabs.map((t) =>
        t.attachmentId === attachmentId ? { ...t, numPages: n } : t,
      ),
    }),
  setPageCoords: (attachmentId, coords) =>
    set({
      tabs: get().tabs.map((t) =>
        t.attachmentId === attachmentId ? { ...t, pageCoords: coords } : t,
      ),
    }),
}));

// Audio viewer panel store
interface AudioTab {
  attachmentId: string;
  filename?: string;
}
interface AudioViewerTabsState {
  open: boolean;
  tabs: AudioTab[];
  active?: string;
  openViewer: (attachmentId: string, filename?: string) => void;
  closeTab: (attachmentId: string) => void;
  closeViewer: () => void;
  setActive: (attachmentId: string) => void;
}

export const useAudioViewerStore = create<AudioViewerTabsState>((set, get) => ({
  open: false,
  tabs: [],
  active: undefined,
  openViewer: (attachmentId, filename) => {
    const tabs = get().tabs;
    if (!tabs.find((t) => t.attachmentId === attachmentId)) {
      set({ tabs: [...tabs, { attachmentId, filename }] });
    }
    set({ open: true, active: attachmentId });
  },
  closeTab: (attachmentId) => {
    const next = get().tabs.filter((t) => t.attachmentId !== attachmentId);
    const wasActive = get().active === attachmentId;
    set({ tabs: next });
    if (wasActive) {
      set({
        active: next.length ? next[next.length - 1].attachmentId : undefined,
      });
    }
    if (next.length === 0) set({ open: false });
  },
  closeViewer: () => set({ open: false, tabs: [], active: undefined }),
  setActive: (attachmentId) => set({ active: attachmentId }),
}));

// Properties panel store (blank overlay panel)
interface PropertiesTab {
  entityId: string;
  title: string;
  data?: any;
}
interface PropertiesState {
  open: boolean;
  tabs: PropertiesTab[];
  active?: string;
  openWith: (entityId: string, title: string, data?: any) => void;
  closeTab: (entityId: string) => void;
  closePanel: () => void;
  setActive: (entityId: string) => void;
  setData: (entityId: string, data: any) => void;
}

export const usePropertiesStore = create<PropertiesState>((set, get) => ({
  open: false,
  tabs: [],
  active: undefined,
  openWith: (entityId, title, data) => {
    const tabs = get().tabs;
    if (!tabs.find((t) => t.entityId === entityId)) {
      set({ tabs: [...tabs, { entityId, title, data }] });
    }
    set({ open: true, active: entityId });
  },
  closeTab: (entityId) => {
    const next = get().tabs.filter((t) => t.entityId !== entityId);
    const wasActive = get().active === entityId;
    set({ tabs: next });
    if (wasActive) {
      set({ active: next.length ? next[next.length - 1].entityId : undefined });
    }
    if (next.length === 0) set({ open: false });
  },
  closePanel: () => set({ open: false }),
  setActive: (entityId) => set({ active: entityId, open: true }),
  setData: (entityId, data) =>
    set({
      tabs: get().tabs.map((t) =>
        t.entityId === entityId ? { ...t, data } : t,
      ),
    }),
}));
