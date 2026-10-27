import { startProjector, stopProjector } from "../app/projector";
import { startJobProcessor, stopJobProcessor } from "../app/jobs";
import { resolveEffectivePluginsPath } from "../app/plugins";
import { bindHandle } from "./handle";
import type { IpcContext } from "./types";
import { dialog } from "electron";

// ============================================================================
// Database Metadata and Configuration
// ============================================================================
export interface DatabaseMetadata {
  id: string;
  name: string;
  path: string;
  // TODO: Wait for @tursodatabase/database to support encryption w/ the JS bindings
  createdAt: number;
  updatedAt: number;
  importedAt?: number;
  importedFrom?: string;
}

export interface DatabaseCreateRequest {
  name: string;
  password?: string;
}

export interface DatabaseCreateResult {
  success: boolean;
  database?: DatabaseMetadata;
  error?: string;
}

export interface DatabaseImportResult {
  success: boolean;
  database?: DatabaseMetadata;
  canceled?: boolean;
  error?: string;
}

export interface DatabaseExportResult {
  success: boolean;
  path?: string;
  canceled?: boolean;
  error?: string;
}

export interface DatabaseDeleteRequest {
  id: string;
  path: string;
}

export interface DatabaseDeleteResult {
  success: boolean;
  error?: any;
}

export interface DatabaseVerifyPasswordRequest {
  id: string;
  password: string;
}

export interface DatabaseVerifyPasswordResult {
  success: boolean;
  error?: string;
}

export function registerDatabaseIpc({ database, getMainWindow }: IpcContext) {
  bindHandle("database:delete", async (_, payload: DatabaseDeleteRequest) =>
    database.delete(payload)
  );

  bindHandle("database:list", async () => database.list());

  bindHandle(
    "database:create",
    async (_, payload: DatabaseCreateRequest): Promise<DatabaseCreateResult> =>
      database.create(payload)
  );

  bindHandle("database:import", async (): Promise<DatabaseImportResult> => {
    const result = await dialog.showOpenDialog({
      title: "Import database",
      properties: ["openFile"],
      filters: [
        {
          name: "Database files",
          extensions: ["zip", "db", "sqlite", "sqlite3"],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return database.importDatabase(result.filePaths[0]);
  });

  bindHandle(
    "database:export",
    async (_, databaseId: string): Promise<DatabaseExportResult> => {
      const selectedDatabase = database
        .list()
        .find((item) => item.id === databaseId);
      if (!selectedDatabase) {
        return { success: false, error: "Database not found" };
      }

      const safeName = selectedDatabase.name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
      const result = await dialog.showSaveDialog({
        title: "Export database",
        defaultPath: `${safeName || "omoika-database"}.zip`,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      return database.exportDatabase(databaseId, result.filePath);
    }
  );

  bindHandle("database:open", async (_, databaseId: string) => {
    if (database.getActiveDatabaseId() !== databaseId) {
      await stopProjector();
      stopJobProcessor();
    }

    const result = await database.open(databaseId);
    // Start projector and job processor
    if (result.success) {
      const db = database.getDb();
      await startProjector(db);
      const mainWindow = getMainWindow();
      const { pluginsPath, venvPath, pythonPath, pluginSettings } =
        database.getSettings();
      stopJobProcessor();
      startJobProcessor(
        db,
        mainWindow,
        venvPath,
        resolveEffectivePluginsPath(pluginsPath),
        pythonPath,
        pluginSettings
      );
    }
    return result;
  });
}
