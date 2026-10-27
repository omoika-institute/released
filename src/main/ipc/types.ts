import type { App, BrowserWindow } from "electron";
import db from "../app/db";
import workspace from "../app/workspace";
import userTools from "../app/userTools";

export type IpcContext = {
  app: App;
  database: typeof db;
  workspace: typeof workspace;
  userTools: typeof userTools;
  getMainWindow: () => BrowserWindow | undefined;
  getAllWindows: () => BrowserWindow[];
};
