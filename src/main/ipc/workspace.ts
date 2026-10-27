import { bindHandle } from "./handle";
import { IpcContext } from "./types";
import workspace from "../app/workspace";

export function registerWorkspaceIpc({ app }: IpcContext) {
  bindHandle("workspace:listJson", async () => {
    await workspace.ready(app);
    return workspace.listJsonEntities();
  });

  bindHandle("workspace:listPython", async () => {
    await workspace.ready(app);
    return workspace.listPythonTransforms();
  });

  bindHandle(
    "workspace:saveJson",
    async (_, payload: { label: string; content: string }) => {
      await workspace.ready(app);
      return workspace.saveJsonEntity(payload.label, payload.content);
    }
  );

  bindHandle(
    "workspace:savePython",
    async (_, payload: { label: string; content: string }) => {
      await workspace.ready(app);
      return workspace.savePythonTransform(payload.label, payload.content);
    }
  );

  bindHandle("workspace:loadJson", async (_, label: string) => {
    await workspace.ready(app);
    return workspace.loadJsonEntity(label);
  });

  bindHandle("workspace:loadPython", async (_, label: string) => {
    await workspace.ready(app);
    return workspace.loadPythonTransform(label);
  });

  bindHandle(
    "workspace:delete",
    async (_, payload: { label: string; type: "json" | "python" }) => {
      await workspace.ready(app);
      return workspace.deleteEntity(payload.label, payload.type);
    }
  );

  bindHandle("workspace:getEntitiesDir", async () => {
    await workspace.ready(app);
    return workspace.getEntitiesDir();
  });
}
