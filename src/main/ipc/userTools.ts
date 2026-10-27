import { bindHandle } from "./handle";
import type { IpcContext } from "./types";
import type { UserToolSavePayload } from "../../lib/userTools";

export function registerUserToolsIpc(deps: IpcContext) {
  bindHandle("tools:list-builtin", async (_event) => {
    await deps.userTools.ready(deps.app);
    return deps.userTools.listBuiltin();
  });

  bindHandle(
    "tools:set-builtin-enabled",
    async (_event, payload: { name: string; enabled: boolean }) => {
      await deps.userTools.ready(deps.app);
      await deps.userTools.setBuiltinEnabled(payload.name, payload.enabled);
    }
  );

  bindHandle("tools:list", async (_event) => {
    await deps.userTools.ready(deps.app);
    return deps.userTools.list();
  });

  bindHandle("tools:save", async (_event, payload: UserToolSavePayload) => {
    await deps.userTools.ready(deps.app);
    return deps.userTools.save(payload);
  });

  bindHandle("tools:delete", async (_event, id: string) => {
    await deps.userTools.ready(deps.app);
    await deps.userTools.delete(id);
  });
}