import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

export function registerEntitiesIpc({ database }: IpcContext) {
  bindHandle(
    "entities:list",
    async (_, payload: { skip: number; limit: number }) =>
      database.listEntities(payload.skip, payload.limit)
  );

  bindHandle(
    "entities:create",
    async (
      _,
      payload: {
        label: string;
        description: string;
        author: string;
        source: string;
      }
    ) =>
      database.createEntity(
        payload.label,
        payload.description,
        payload.author,
        payload.source
      )
  );

  bindHandle("entities:getById", async (_, uuid: string) =>
    database.getEntityById(uuid)
  );

  bindHandle(
    "entities:update",
    async (
      _,
      payload: {
        id: string;
        label: string;
        description: string;
        author: string;
        source: string;
      }
    ) => {
      return database.updateEntity(
        payload.id,
        payload.label,
        payload.description,
        payload.author,
        payload.source
      );
    }
  );

  bindHandle("entities:delete", async (_, payload: { id: string }) =>
    database.deleteEntity(payload.id)
  );

  bindHandle(
    "entities:favorite",
    async (_, payload: { entity_id: string; is_favorite: boolean }) =>
      database.favoriteEntity(payload.entity_id, payload.is_favorite)
  );

  bindHandle(
    "entities:listAttachments",
    async (_, payload: { graph_id: string; entity_id: string }) =>
      database.listAttachments(payload.graph_id, payload.entity_id)
  );
}
