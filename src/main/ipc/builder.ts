import fs from "node:fs";
import { dialog } from "electron";
import { generateEntityArtifacts } from "../app/builder";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";

export function registerBuilderIpc({ getAllWindows }: IpcContext) {
  bindHandle(
    "builder:save-entity",
    async (
      _,
      payload: {
        content: string;
        defaultPath?: string;
      }
    ) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: payload.defaultPath || "entity.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }
      await fs.promises.writeFile(filePath, payload.content, "utf-8");
      return { success: true, filePath };
    }
  );
  bindHandle(
    "builder:generate-entity",
    async (
      _,
      payload: {
        entity: any;
        outputDir?: string;
      }
    ) => {
      const outputDir = payload.outputDir;
      let targetDir = outputDir;

      if (!targetDir) {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
        });
        if (canceled || filePaths.length === 0) {
          return { success: false, canceled: true };
        }
        targetDir = filePaths[0];
      }

      const result = await generateEntityArtifacts(payload.entity, targetDir);
      const windows = getAllWindows();
      windows.forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send("builder:generated", result);
        }
      });
      return { success: true, ...result };
    }
  );
}
