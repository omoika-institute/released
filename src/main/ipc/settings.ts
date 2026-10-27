import { bindHandle } from "./handle";
import { IpcContext } from "./types";

export function registerSettingsIpc({ app, database }: IpcContext) {
  bindHandle("settings:update", async (_event, partial) => {
    return database.updateSettings(partial);
  });

  // Settings management (persisted in electron-store alongside `databases: []`)
  bindHandle("settings:get", async () => {
    return database.getSettings();
  });

  bindHandle("settings:diagnostics", async () => {
    const settings = database.getSettings();
    // TODO: Deprecate
    // return diagnoseSettings(settings);
    return {};
  });

  // Backwards-compatible alias (older UI used a dedicated venv setter)
  bindHandle("settings:set-venv-path", async (_, path: string | undefined) => {
    return database.updateSettings({ venvPath: path });
  });
}
