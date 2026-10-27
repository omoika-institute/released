import {
  handleCreateEdge,
  handleCreateEntity,
  handleDeleteEdge,
  handleDeleteEntity,
  handleLoadGraph,
  handleApplyRemoteGraphOperation,
  handleTransform,
  handleUpdateEdge,
  handleUpdateEntity,
} from "../app/graph";
import { bindHandle } from "./handle";
import { IpcContext } from "./types";
import { buildPluginSettingsConfig, execObTransform } from "../app/cli";
import { GraphEntity } from "@/types/database";
import { resolveEffectivePluginsPath } from "../app/plugins";
import { getPluginDirForEntity } from "./plugins";

// Graph Operation Payloads
export interface CreateEntityPayload {
  graphId: string;
  entity: {
    label: string;
    x: number;
    y: number;
    data?: Record<string, any>;
  };
}

export interface UpdateEntityPayload {
  graphId: string;
  entityId: string;
  updates: {
    x?: number;
    y?: number;
    data?: Record<string, any>;
  };
}

export interface DeleteEntityPayload {
  graphId: string;
  entityId: string;
}

export interface CreateEdgePayload {
  graphId: string;
  edge: {
    source: string;
    target: string;
    data?: Record<string, any>;
    temp_id?: string;
  };
}

export interface UpdateEdgePayload {
  graphId: string;
  edgeId: string;
  updates: {
    source?: string;
    target?: string;
    data?: Record<string, any>;
  };
}

export interface DeleteEdgePayload {
  graphId: string;
  edgeId: string;
}

export type RemoteGraphOperation =
  | {
      kind: "entity:create";
      graphId: string;
      entity: {
        id: string;
        label: string;
        position: { x: number; y: number };
        data?: Record<string, any>;
      };
    }
  | {
      kind: "entity:update";
      graphId: string;
      entityId: string;
      updates: {
        x?: number;
        y?: number;
        data?: Record<string, any>;
      };
    }
  | { kind: "entity:delete"; graphId: string; entityId: string }
  | {
      kind: "edge:create";
      graphId: string;
      edge: {
        id: string;
        source: string;
        target: string;
        data?: Record<string, any>;
      };
    }
  | {
      kind: "edge:update";
      graphId: string;
      edgeId: string;
      updates: {
        source?: string;
        target?: string;
        data?: Record<string, any>;
      };
    }
  | { kind: "edge:delete"; graphId: string; edgeId: string };

export interface TransformPayload {
  graphId: string;
  entity: GraphEntity & { transform?: string };
  transformLabel: string;
  extraPluginDirs?: string[];
}

function resolveEntityLabel(entity: GraphEntity & { transform?: string }): string {
  const directLabel =
    typeof entity.label === "string" ? entity.label.trim() : "";
  if (directLabel) return directLabel;

  const dataLabel =
    entity.data && typeof entity.data.label === "string"
      ? entity.data.label.trim()
      : "";
  if (dataLabel) return dataLabel;

  const typeLabel =
    typeof entity.type === "string" ? entity.type.trim() : "";
  return typeLabel;
}

export function registerGraphIpc({ app, database, getMainWindow }: IpcContext) {
  bindHandle("graph:load", async (_, graphId: string) =>
    handleLoadGraph(database.getDb(), graphId)
  );

  bindHandle("graph:create-entity", async (_, payload: CreateEntityPayload) =>
    handleCreateEntity(database.getDb(), payload)
  );

  bindHandle("graph:update-entity", async (_, payload: UpdateEntityPayload) =>
    handleUpdateEntity(database.getDb(), payload)
  );

  bindHandle("graph:delete-entity", async (_, payload: DeleteEntityPayload) =>
    handleDeleteEntity(database.getDb(), payload)
  );

  bindHandle("graph:create-edge", async (_, payload: CreateEdgePayload) =>
    handleCreateEdge(database.getDb(), payload, "local-user")
  );

  bindHandle("graph:update-edge", async (_, payload: UpdateEdgePayload) =>
    handleUpdateEdge(database.getDb(), payload)
  );

  bindHandle("graph:delete-edge", async (_, payload: DeleteEdgePayload) =>
    handleDeleteEdge(database.getDb(), payload)
  );

  bindHandle(
    "graph:apply-remote-operation",
    async (_, payload: RemoteGraphOperation) =>
      handleApplyRemoteGraphOperation(database.getDb(), payload, "remote-peer")
  );

  bindHandle("graph:transform", async (_, payload: TransformPayload) => {
    const { pluginsPath, venvPath, pythonPath, pluginSettings } =
      database.getSettings();
    const defaultPluginsPath = resolveEffectivePluginsPath(pluginsPath);
    const entityLabel = resolveEntityLabel(payload.entity);
    const pluginRoots = Array.from(
      new Set(
        [
          getPluginDirForEntity(entityLabel, defaultPluginsPath),
          defaultPluginsPath,
          ...(payload.extraPluginDirs ?? []),
        ].filter(Boolean)
      )
    );
    return handleTransform(
      database.getDb(),
      {
        ...payload,
        entity: {
          ...payload.entity,
          label: entityLabel,
        },
      },
      "local-user",
      getMainWindow(),
      {
        venvPath,
        pluginsPath: pluginRoots,
        pythonPath,
        pluginSettings,
      }
    );
  });

  bindHandle(
    "transforms:run",
    async (_event, payload: { transformLabel: string; input: any }) => {
      const { transformLabel, input } = payload;
      const isObjectInput =
        input && typeof input === "object" && !Array.isArray(input);
      const base = isObjectInput ? input : { data: input };

      const { label, id, data, ...rest } = isObjectInput ? base : {};
      const resolvedData =
        data ?? (Object.keys(rest).length ? rest : (input ?? {}));
      const { pluginsPath, venvPath, pythonPath, pluginSettings } =
        database.getSettings();

      const entityLabel = typeof label === "string" ? label : "input";
      const defaultPluginsPath = resolveEffectivePluginsPath(pluginsPath);
      return execObTransform(
        JSON.stringify({
          action: "transform:entity",
          graph_id: "workspace",
          entity: {
            ...base,
            id: typeof id === "string" ? id : "workspace-input",
            label: entityLabel,
            data: resolvedData,
            transform: transformLabel,
          },
          actor_id: "local-user",
        }),
        {
          pluginsPath: getPluginDirForEntity(entityLabel, defaultPluginsPath),
          venvPath,
          pythonPath,
          cfg: buildPluginSettingsConfig(pluginSettings, transformLabel),
        }
      );
    }
  );
}
