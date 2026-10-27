import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Store from "electron-store";
import { connect, type Database } from "@tursodatabase/database";
import {
  DatabaseCreateRequest,
  DatabaseCreateResult,
  DatabaseDeleteRequest,
  DatabaseDeleteResult,
  DatabaseExportResult,
  DatabaseImportResult,
  DatabaseMetadata,
} from "../ipc//database";
import { createCompressedZip, readZip } from "./databaseBundle";
import { migrateDatabase } from "./migrations";
import SQLITE_SCHEMA from "./schema";

type DbRegistryShape = {
  databases: DatabaseMetadata[];
  settings: {
    language?: string;
    pythonPath?: string;
    pip3Path?: string;
    venvPath?: string;
    pluginsPath?: string;
    pluginSettings?: Record<string, Record<string, string>>;
    agentProvider?: "lmstudio" | "openrouter";
    agentSystemPrompt?: string;
    agentUserPrompt?: string;
    agentLmStudioBaseUrl?: string;
    agentLmStudioModel?: string;
    agentLmStudioTemperature?: number;
    agentLmStudioMaxTurns?: number;
    agentLmStudioContextLength?: number;
    agentLmStudioMaxTokens?: number;
    agentOpenRouterApiKey?: string;
    agentOpenRouterModel?: string;
  };
};

// TODO: capitalize all -> OMOIKA
const DATA_DIR_NAME = "omoika";
// TODO: databases -> dbs
const REGISTRY_NAME = "databases";

/**
 * Build a Turso connection URI with optional encryption
 */
function buildConnectionUri(dbPath: string): string {
  // if (encryptionKey) {
  // return `file:${dbPath}`; // TODO: Wait for encryption support in JS bindings from turso :) `file:${dbPath}?cipher=${DEFAULT_CIPHER}&hexkey=${encryptionKey}`
  // }
  return dbPath;
}

// Default values for local-only database
// TODO: deprecate
const DEFAULT_OWNER_ID = "local-user";
const DEFAULT_ORG = "local-user";

function normalizeImportedName(filePath: string): string {
  return path
    .basename(filePath)
    .replace(/\.turso\.db$/i, "")
    .replace(/\.(sqlite3?|db)$/i, "")
    .replace(/\.zip$/i, "")
    .trim();
}

type DatabaseExportManifest = {
  format: "omoika.database.export";
  version: 1;
  exportedAt: string;
  database: {
    name: string;
    createdAt: number;
    updatedAt: number;
  };
};

function isDatabaseExportManifest(value: any): value is DatabaseExportManifest {
  return (
    value?.format === "omoika.database.export" &&
    value?.version === 1 &&
    typeof value?.database?.name === "string"
  );
}

function uniqueDatabaseName(
  name: string,
  existingDatabases: DatabaseMetadata[]
): string {
  const existingNames = new Set(
    existingDatabases.map((db) => db.name.toLowerCase())
  );
  if (!existingNames.has(name.toLowerCase())) return name;

  let index = 2;
  let candidate = `${name} (${index})`;
  while (existingNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${name} (${index})`;
  }
  return candidate;
}

export class DatabaseManager {
  private registry: Store<DbRegistryShape> | null = null;
  private dataDir: string | null = null;
  private readyPromise: Promise<void> | null = null;
  private activeDb: Database | null = null;
  private activeDbId: string | null = null;

  async ready(app: Electron.App): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize(app);
    }
    return this.readyPromise;
  }

  private async initialize(app: Electron.App): Promise<void> {
    const userData = app.getPath("userData");
    this.dataDir = path.join(userData, DATA_DIR_NAME);
    await fs.mkdir(this.dataDir, { recursive: true });
    this.registry = new Store<DbRegistryShape>({
      name: REGISTRY_NAME,
      cwd: this.dataDir,
      defaults: { databases: [], settings: {} },
    });
    // Touch the store to ensure the file is created on first launch.
    const existing = this.registry.get("databases");
    if (!existing) {
      this.registry.set("databases", []);
    }
    const settings = this.registry.get("settings");
    if (!settings) {
      this.registry.set("settings", {});
    }
  }

  list(): DatabaseMetadata[] {
    if (!this.registry) return [];
    return this.registry.get("databases", []);
  }

  getSettings(): DbRegistryShape["settings"] {
    if (!this.registry) return {};
    return this.registry.get("settings", {});
  }

  updateSettings(
    partial: Partial<DbRegistryShape["settings"]>
  ): DbRegistryShape["settings"] {
    if (!this.registry) return {};
    const current = this.registry.get("settings", {});
    const next = { ...current, ...partial };
    this.registry.set("settings", next);
    return next;
  }

  async delete(request: DatabaseDeleteRequest): Promise<DatabaseDeleteResult> {
    if (!this.registry)
      return { success: false, error: "Database registry not initialized" };
    if (!request?.path)
      return { success: false, error: "Database path missing" };
    try {
      await fs.rm(request.path, { force: true });
      // Also remove WAL and SHM files if they exist
      await fs.rm(`${request.path}-wal`, { force: true });
      await fs.rm(`${request.path}-shm`, { force: true });
      const updated = this.list().filter((db) => db.id !== request.id);
      this.registry.set("databases", updated);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  async create(request: DatabaseCreateRequest): Promise<DatabaseCreateResult> {
    if (!this.registry || !this.dataDir) {
      return { success: false, error: "Database registry not initialized" };
    }

    const name = request.name?.trim();
    if (!name) {
      return { success: false, error: "Database name is required" };
    }

    const existing = this.list().find(
      (db) => db.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return {
        success: false,
        error: "A database with that name already exists",
      };
    }

    const id = randomUUID();
    const dbFileName = `${id}.turso.db`;
    const dbPath = path.join(this.dataDir, dbFileName);

    let db: Database | null = null;
    try {
      // Create the SQLite database file with Turso
      const connectionUri = buildConnectionUri(dbPath);
      db = await connect(connectionUri, {
        timeout: 5000, // 5 second busy timeout
      });

      // Enable foreign keys
      await db.exec("PRAGMA foreign_keys = ON");

      // Enable WAL mode for better concurrency (allows reads while writing)
      await db.exec("PRAGMA journal_mode = WAL");

      // Apply the schema
      await db.exec(SQLITE_SCHEMA);

      // Store metadata in the database using UPSERT syntax (Turso doesn't support INSERT OR REPLACE)
      const createdAt = Date.now();
      const insertMeta = db.prepare(
        "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      await insertMeta.run(["createdAt", String(createdAt)]);
      await insertMeta.run(["name", name]);
      // await insertMeta.run(["encrypted", password ? "true" : "false"]);

      // if (password) {
      // await insertMeta.run(["passwordProtected", "true"]);
      // }

      db.close();
      db = null;

      const database: DatabaseMetadata = {
        id,
        name,
        path: dbPath,
        // encrypted: Boolean(password),
        // encryptionKey, // Store the key so we can reopen the database
        // passwordHash: password ? hashPassword(password) : undefined,
        createdAt,
        updatedAt: createdAt,
      };

      const updated = [...this.list(), database];
      this.registry.set("databases", updated);

      return { success: true, database };
    } catch (err) {
      // Clean up on failure
      if (db) {
        try {
          db.close();
        } catch {
          // Ignore close errors
        }
      }
      // Try to remove the partially created database file
      try {
        await fs.unlink(dbPath);
      } catch {
        // Ignore unlink errors
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to create database",
      };
    }
  }

  async importDatabase(sourcePath: string): Promise<DatabaseImportResult> {
    if (!this.registry || !this.dataDir) {
      return { success: false, error: "Database registry not initialized" };
    }

    const resolvedSourcePath = path.resolve(sourcePath);
    let sourceStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      sourceStat = await fs.stat(resolvedSourcePath);
      if (!sourceStat.isFile()) {
        return { success: false, error: "Selected path is not a database file" };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Selected database file could not be read",
      };
    }

    const id = randomUUID();
    const dbPath = path.join(this.dataDir, `${id}.turso.db`);
    let db: Database | null = null;
    let manifest: DatabaseExportManifest | null = null;
    let sourceName = path.basename(resolvedSourcePath);

    try {
      const sourceBytes = await fs.readFile(resolvedSourcePath);
      if (sourceBytes.subarray(0, 4).toString("binary") === "PK\u0003\u0004") {
        const entries = readZip(sourceBytes);
        const manifestBytes = entries.get("manifest.json");
        const databaseBytes = entries.get("database.turso.db");
        if (!databaseBytes) {
          throw new Error("The selected archive does not contain a database");
        }
        if (manifestBytes) {
          const parsedManifest = JSON.parse(manifestBytes.toString("utf8"));
          if (isDatabaseExportManifest(parsedManifest)) {
            manifest = parsedManifest;
          }
        }
        await fs.writeFile(dbPath, databaseBytes);
        sourceName = manifest?.database.name || sourceName;
      } else {
        await fs.copyFile(resolvedSourcePath, dbPath);
        await this.copySidecarIfPresent(resolvedSourcePath, dbPath, "-wal");
        await this.copySidecarIfPresent(resolvedSourcePath, dbPath, "-shm");
      }

      db = await connect(buildConnectionUri(dbPath), { timeout: 5000 });
      await db.exec("PRAGMA foreign_keys = ON");

      const integrityRows = await db.prepare("PRAGMA integrity_check").all();
      const integrity = integrityRows?.[0] as
        | { integrity_check?: string }
        | undefined;
      if (integrity?.integrity_check && integrity.integrity_check !== "ok") {
        throw new Error("The selected database failed SQLite integrity checks");
      }

      const tableRows = await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('_meta', 'cases', 'event_streams', 'events')"
        )
        .all();
      const tableNames = new Set(tableRows.map((row: any) => row.name));
      if (
        !tableNames.has("_meta") &&
        !tableNames.has("cases") &&
        !tableNames.has("event_streams") &&
        !tableNames.has("events")
      ) {
        throw new Error("The selected file is not an OMOIKA database");
      }

      await migrateDatabase(db);
      await db.exec("PRAGMA journal_mode = WAL");

      const metaRows = await db
        .prepare(
          "SELECT key, value FROM _meta WHERE key IN ('name', 'createdAt')"
        )
        .all();
      const meta = new Map(
        metaRows.map((row: any) => [String(row.key), String(row.value)])
      );
      const fallbackName = normalizeImportedName(sourceName) || "Imported space";
      const name = uniqueDatabaseName(
        manifest?.database.name?.trim() || meta.get("name")?.trim() || fallbackName,
        this.list()
      );
      const createdAt =
        manifest?.database.createdAt ||
        Number(meta.get("createdAt")) ||
        Math.round(sourceStat.mtimeMs);
      const updatedAt = Date.now();
      const importedAt = updatedAt;

      const upsertMeta = db.prepare(
        "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      await upsertMeta.run(["name", name]);
      await upsertMeta.run(["createdAt", String(createdAt)]);
      await upsertMeta.run(["importedAt", String(importedAt)]);
      await upsertMeta.run(["importedFrom", path.basename(resolvedSourcePath)]);
      if (manifest?.exportedAt) {
        await upsertMeta.run(["exportedAt", manifest.exportedAt]);
      }

      db.close();
      db = null;

      const importedDatabase: DatabaseMetadata = {
        id,
        name,
        path: dbPath,
        createdAt,
        updatedAt,
        importedAt,
        importedFrom: path.basename(resolvedSourcePath),
      };
      this.registry.set("databases", [...this.list(), importedDatabase]);

      return { success: true, database: importedDatabase };
    } catch (error) {
      if (db) {
        try {
          db.close();
        } catch {
          // Ignore close errors.
        }
      }
      await this.removeDatabaseFiles(dbPath);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to import database",
      };
    }
  }

  async exportDatabase(
    databaseId: string,
    destinationPath: string
  ): Promise<DatabaseExportResult> {
    const database = this.list().find((db) => db.id === databaseId);
    if (!database) return { success: false, error: "Database not found" };

    try {
      await this.checkpointDatabase(database);
      const databaseBytes = await fs.readFile(database.path);
      const exportedAt = new Date().toISOString();
      const manifest: DatabaseExportManifest = {
        format: "omoika.database.export",
        version: 1,
        exportedAt,
        database: {
          name: database.name,
          createdAt: database.createdAt,
          updatedAt: database.updatedAt,
        },
      };
      const bundle = createCompressedZip([
        {
          name: "manifest.json",
          data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
        },
        { name: "database.turso.db", data: databaseBytes },
      ]);
      await fs.writeFile(destinationPath, bundle);
      return { success: true, path: destinationPath };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to export database",
      };
    }
  }

  private async checkpointDatabase(database: DatabaseMetadata): Promise<void> {
    if (this.activeDb && this.activeDbId === database.id) {
      await this.activeDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return;
    }

    let db: Database | null = null;
    try {
      db = await connect(buildConnectionUri(database.path), { timeout: 5000 });
      await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      if (db) db.close();
    }
  }

  private async copySidecarIfPresent(
    sourcePath: string,
    destinationPath: string,
    suffix: string
  ): Promise<void> {
    try {
      await fs.copyFile(`${sourcePath}${suffix}`, `${destinationPath}${suffix}`);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  private async removeDatabaseFiles(databasePath: string): Promise<void> {
    await fs.rm(databasePath, { force: true });
    await fs.rm(`${databasePath}-wal`, { force: true });
    await fs.rm(`${databasePath}-shm`, { force: true });
  }

  /**
   * Open a database for querying
   */
  async open(
    databaseId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.registry) {
      console.error("[DB:open] Registry not initialized!");
      return { success: false, error: "Database registry not initialized" };
    }

    // Close existing connection if different database
    if (this.activeDb && this.activeDbId !== databaseId) {
      try {
        this.activeDb.close();
      } catch (error) {
        console.error("[DB:open] Error closing previous database:", error);
        // Ignore close errors
      }
      this.activeDb = null;
      this.activeDbId = null;
    }

    // Already open
    if (this.activeDb && this.activeDbId === databaseId) {
      return { success: true };
    }

    const database = this.list().find((db) => db.id === databaseId);
    if (!database) {
      console.error(
        "[DB:open] Database not found in registry! Requested ID: ",
        databaseId
      );
      console.error(
        "[DB:open] Available databases:",
        this.list().map((d) => d.id)
      );
      return { success: false, error: "Database not found" };
    }

    try {
      const connectionUri = buildConnectionUri(
        database.path
        // database.encryptionKey
      );
      this.activeDb = await connect(connectionUri, { timeout: 5000 });

      await this.activeDb.exec("PRAGMA foreign_keys = ON");
      await this.activeDb.exec("PRAGMA journal_mode = WAL");
      await migrateDatabase(this.activeDb);

      this.activeDbId = databaseId;
      return { success: true };
    } catch (err) {
      console.error("[DB:open] Error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to open database",
      };
    }
  }

  /**
   * Get the active database connection (public for graph operations)
   */
  public getDb(): Database {
    if (!this.activeDb) {
      throw new Error("No database is currently open");
    }
    return this.activeDb;
  }

  public getActiveDatabaseId(): string | null {
    return this.activeDbId;
  }

  // ============ CASES (GRAPHS) ============

  async listCases(
    skip: number,
    limit: number
  ): Promise<{ cases: any[]; favorites: string[] }> {
    const db = this.getDb();
    const casesResult = await db
      .prepare(
        `SELECT id, uuid, label, description, ctime, mtime
       FROM cases
       WHERE owner_id = ?
       ORDER BY mtime DESC
       LIMIT ? OFFSET ?`
      )
      .all(DEFAULT_OWNER_ID, limit, skip);

    const favoritesResult = await db
      .prepare(
        `SELECT c.uuid
       FROM favorite_cases fc
       JOIN cases c ON fc.case_id = c.id
       WHERE fc.owner_id = ?`
      )
      .all(DEFAULT_OWNER_ID);

    const cases = casesResult.map((row: any) => ({
      id: row.uuid,
      label: row.label,
      description: row.description,
      ctime: row.ctime,
      mtime: row.mtime,
    }));

    const favorites = favoritesResult.map((row: any) => row.uuid);

    return { cases, favorites };
  }

  async createCase(label: string, description: string): Promise<any> {
    const db = this.getDb();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO cases (label, description, ctime, mtime, org, owner_id)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(label, description, now, now, DEFAULT_ORG, DEFAULT_OWNER_ID);

    // Get the created case
    const result = await db
      .prepare(
        `SELECT id, uuid, label, description, ctime, mtime
       FROM cases
       WHERE owner_id = ?
       ORDER BY id DESC LIMIT 1`
      )
      .all(DEFAULT_OWNER_ID);

    const row = result[0] as any;
    return {
      id: row.uuid,
      label: row.label,
      description: row.description,
      ctime: row.ctime,
      mtime: row.mtime,
    };
  }

  async getCaseById(uuid: string): Promise<any> {
    const db = this.getDb();
    const caseResult = await db
      .prepare(
        `SELECT id, uuid, label, description, ctime, mtime
       FROM cases
       WHERE uuid = ? AND owner_id = ?`
      )
      .all(uuid, DEFAULT_OWNER_ID);

    if (caseResult.length === 0) {
      throw new Error("Case not found");
    }

    const row = caseResult[0] as any;

    // Get counts
    const verticesResult = await db
      .prepare(
        `SELECT COUNT(*) as count FROM entities_current WHERE graph_id = ? AND sys_to IS NULL`
      )
      .all(uuid);
    const edgesResult = await db
      .prepare(
        `SELECT COUNT(*) as count FROM edges_current WHERE graph_id = ? AND sys_to IS NULL`
      )
      .all(uuid);

    // Get events count
    return {
      graph: {
        id: row.uuid,
        label: row.label,
        description: row.description,
        ctime: row.ctime,
        mtime: row.mtime,
      },
      vertices_count: (verticesResult[0] as any).count,
      edges_count: (edgesResult[0] as any).count,
    };
  }

  async updateCase(
    uuid: string,
    label: string,
    description: string
  ): Promise<any> {
    const db = this.getDb();
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE cases SET label = ?, description = ?, mtime = ?
       WHERE uuid = ? AND owner_id = ?`
      )
      .run(label, description, now, uuid, DEFAULT_OWNER_ID);

    const result = await db
      .prepare(
        `SELECT id, uuid, label, description, ctime, mtime
       FROM cases
       WHERE uuid = ? AND owner_id = ?`
      )
      .all(uuid, DEFAULT_OWNER_ID);

    const row = result[0] as any;
    return {
      id: row.uuid,
      label: row.label,
      description: row.description,
      ctime: row.ctime,
      mtime: row.mtime,
    };
  }

  async deleteCase(uuid: string): Promise<void> {
    const db = this.getDb();
    const entityStreamId = `entity:${uuid}`;
    const edgeStreamId = `edge:${uuid}`;

    // Get the integer id for favorites
    const caseResult = await db
      .prepare(`SELECT id FROM cases WHERE uuid = ? AND owner_id = ?`)
      .all(uuid, DEFAULT_OWNER_ID);

    if (caseResult.length > 0) {
      const caseId = (caseResult[0] as any).id;
      await db
        .prepare(`DELETE FROM favorite_cases WHERE case_id = ?`)
        .run(caseId);
    }

    // Delete related data
    await db
      .prepare(`DELETE FROM entities_current WHERE graph_id = ?`)
      .run(uuid);
    await db.prepare(`DELETE FROM edges_current WHERE graph_id = ?`).run(uuid);
    await db
      .prepare(`DELETE FROM entity_attachments WHERE graph_id = ?`)
      .run(uuid);
    await db
      .prepare(`DELETE FROM events WHERE stream_id IN (?, ?)`)
      .run(entityStreamId, edgeStreamId);
    await db
      .prepare(`DELETE FROM event_streams WHERE stream_id IN (?, ?)`)
      .run(entityStreamId, edgeStreamId);
    await db
      .prepare(`DELETE FROM cases WHERE uuid = ? AND owner_id = ?`)
      .run(uuid, DEFAULT_OWNER_ID);
  }

  async favoriteCase(uuid: string, isFavorite: boolean): Promise<void> {
    const db = this.getDb();
    // Get the integer id
    const caseResult = await db
      .prepare(`SELECT id FROM cases WHERE uuid = ? AND owner_id = ?`)
      .all(uuid, DEFAULT_OWNER_ID);
    if (caseResult.length === 0) {
      throw new Error("Case not found");
    }

    const caseId = (caseResult[0] as any).id;
    if (isFavorite) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO favorite_cases (case_id, owner_id) VALUES (?, ?)`
        )
        .run(caseId, DEFAULT_OWNER_ID);
    } else {
      await db
        .prepare(
          `DELETE FROM favorite_cases WHERE case_id = ? AND owner_id = ?`
        )
        .run(caseId, DEFAULT_OWNER_ID);
    }
  }

  // ============ ENTITIES ============

  async listEntities(
    skip: number,
    limit: number
  ): Promise<{ entities: any[]; favorites: string[] }> {
    const db = this.getDb();

    const entitiesResult = await db
      .prepare(
        `SELECT id, uuid, label, description, author, code, ctime, mtime
       FROM entities
       WHERE owner_id = ?
       ORDER BY mtime DESC
       LIMIT ? OFFSET ?`
      )
      .all(DEFAULT_OWNER_ID, limit, skip);

    const favoritesResult = await db
      .prepare(
        `SELECT e.uuid
       FROM favorite_entities fe
       JOIN entities e ON fe.entity_id = e.id
       WHERE fe.owner_id = ?`
      )
      .all(DEFAULT_OWNER_ID);

    const entities = entitiesResult.map((row: any) => ({
      id: row.uuid,
      label: row.label,
      description: row.description,
      author: row.author,
      source: row.code,
      ctime: row.ctime,
      mtime: row.mtime,
    }));

    const favorites = favoritesResult.map((row: any) => row.uuid);

    return { entities, favorites };
  }

  async createEntity(
    label: string,
    description: string,
    author: string,
    source: string
  ): Promise<any> {
    const db = this.getDb();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO entities (label, description, author, code, org, ctime, mtime, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        label,
        description,
        author,
        source,
        DEFAULT_ORG,
        now,
        now,
        DEFAULT_OWNER_ID
      );

    const result = await db
      .prepare(
        `SELECT id, uuid, label, description, author, code, ctime, mtime
       FROM entities
       WHERE owner_id = ?
       ORDER BY id DESC LIMIT 1`
      )
      .all(DEFAULT_OWNER_ID);

    const row = result[0] as any;
    return {
      id: row.uuid,
      label: row.label,
      description: row.description,
      author: row.author,
      source: row.code,
      ctime: row.ctime,
      mtime: row.mtime,
    };
  }

  async getEntityById(uuid: string): Promise<any> {
    const db = this.getDb();

    const result = await db
      .prepare(
        `SELECT id, uuid, label, description, author, code, ctime, mtime
       FROM entities
       WHERE uuid = ? AND owner_id = ?`
      )
      .all(uuid, DEFAULT_OWNER_ID);

    if (result.length === 0) {
      throw new Error("Entity not found");
    }

    const row = result[0] as any;
    return {
      id: row.uuid,
      label: row.label,
      description: row.description,
      author: row.author,
      source: row.code,
      ctime: row.ctime,
      mtime: row.mtime,
    };
  }

  async updateEntity(
    uuid: string,
    label: string,
    description: string,
    author: string,
    source: string
  ): Promise<any> {
    const db = this.getDb();
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE entities SET label = ?, description = ?, author = ?, code = ?, mtime = ?
       WHERE uuid = ? AND owner_id = ?`
      )
      .run(label, description, author, source, now, uuid, DEFAULT_OWNER_ID);

    const result = await db
      .prepare(
        `SELECT id, uuid, label, description, author, code, ctime, mtime
       FROM entities
       WHERE uuid = ? AND owner_id = ?`
      )
      .all(uuid, DEFAULT_OWNER_ID);

    const row = result[0] as any;
    return {
      id: row.uuid,
      label: row.label,
      description: row.description,
      author: row.author,
      source: row.code,
      ctime: row.ctime,
      mtime: row.mtime,
    };
  }

  async deleteEntity(uuid: string): Promise<void> {
    const db = this.getDb();

    // Get the integer id for favorites
    const entityResult = await db
      .prepare(`SELECT id FROM entities WHERE uuid = ? AND owner_id = ?`)
      .all(uuid, DEFAULT_OWNER_ID);

    if (entityResult.length > 0) {
      const entityId = (entityResult[0] as any).id;
      await db
        .prepare(`DELETE FROM favorite_entities WHERE entity_id = ?`)
        .run(entityId);
    }

    await db
      .prepare(`DELETE FROM entities WHERE uuid = ? AND owner_id = ?`)
      .run(uuid, DEFAULT_OWNER_ID);
  }

  async favoriteEntity(uuid: string, isFavorite: boolean): Promise<void> {
    const db = this.getDb();

    // Get the integer id
    const entityResult = await db
      .prepare(`SELECT id FROM entities WHERE uuid = ? AND owner_id = ?`)
      .all(uuid, DEFAULT_OWNER_ID);

    if (entityResult.length === 0) {
      throw new Error("Entity not found");
    }

    const entityId = (entityResult[0] as any).id;

    if (isFavorite) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO favorite_entities (entity_id, owner_id) VALUES (?, ?)`
        )
        .run(entityId, DEFAULT_OWNER_ID);
    } else {
      await db
        .prepare(
          `DELETE FROM favorite_entities WHERE entity_id = ? AND owner_id = ?`
        )
        .run(entityId, DEFAULT_OWNER_ID);
    }
  }

  async listAttachments(graphId: string, entityId: string): Promise<any[]> {
    const db = this.getDb();

    const result = await db
      .prepare(
        `SELECT attachment_id, filename, media_type, size, created_at
       FROM entity_attachments
       WHERE graph_id = ? AND entity_id = ? AND owner_id = ?
       ORDER BY created_at DESC`
      )
      .all(graphId, entityId, DEFAULT_OWNER_ID);

    return result.map((row: any) => ({
      attachment_id: row.attachment_id,
      filename: row.filename,
      media_type: row.media_type,
      size: row.size,
      created_at: row.created_at,
    }));
  }
}

const db = new DatabaseManager();
export default db;
