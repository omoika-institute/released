import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";

export interface Workspace {
  label: string;
  filename: string;
  path: string;
  mtime: string;
}

// TODO: omoika -> OMOIKA
const DATA_DIR_NAME = "omoika";
// TODO...
const ENTITIES_DIR_NAME = "entities";
// TODO...
const JSON_DIR_NAME = "json";
// TODO...
const PYTHON_DIR_NAME = "python";

export class EntityLibrary {
  private dataDir: string | null = null;
  private entitiesDir: string | null = null;
  private jsonDir: string | null = null;
  private pythonDir: string | null = null;
  private readyPromise: Promise<void> | null = null;

  async ready(app: App): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize(app);
    }
    return this.readyPromise;
  }

  private async initialize(app: App): Promise<void> {
    const appData = app.getPath("appData");
    this.dataDir = path.join(appData, DATA_DIR_NAME);
    this.entitiesDir = path.join(this.dataDir, ENTITIES_DIR_NAME);
    this.jsonDir = path.join(this.entitiesDir, JSON_DIR_NAME);
    this.pythonDir = path.join(this.entitiesDir, PYTHON_DIR_NAME);

    await fs.mkdir(this.jsonDir, { recursive: true });
    await fs.mkdir(this.pythonDir, { recursive: true });
  }

  private sanitizeFilename(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async listJsonEntities(): Promise<Workspace[]> {
    if (!this.jsonDir) return [];

    try {
      const files = await fs.readdir(this.jsonDir);
      const entities: Workspace[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(this.jsonDir, file);
        const stat = await fs.stat(filePath);
        const label = file.replace(/\.json$/, "");

        entities.push({
          label,
          filename: file,
          path: filePath,
          mtime: stat.mtime.toISOString(),
        });
      }

      return entities.sort(
        (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
      );
    } catch (error) {
      console.error("[EntityManager] Failed to list JSON entities:", error);
      return [];
    }
  }

  async listPythonTransforms(): Promise<Workspace[]> {
    if (!this.pythonDir) return [];

    try {
      const files = await fs.readdir(this.pythonDir);
      const transforms: Workspace[] = [];

      for (const file of files) {
        if (!file.endsWith(".py")) continue;

        const filePath = path.join(this.pythonDir, file);
        const stat = await fs.stat(filePath);
        const label = file.replace(/\.py$/, "");

        transforms.push({
          label,
          filename: file,
          path: filePath,
          mtime: stat.mtime.toISOString(),
        });
      }

      return transforms.sort(
        (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
      );
    } catch (error) {
      console.error("[EntityManager] Failed to list Python transforms:", error);
      return [];
    }
  }

  async saveJsonEntity(label: string, content: string): Promise<Workspace> {
    if (!this.jsonDir) {
      throw new Error("EntityManager not initialized");
    }

    const filename = `${this.sanitizeFilename(label)}.json`;
    const filePath = path.join(this.jsonDir, filename);

    await fs.writeFile(filePath, content, "utf-8");
    const stat = await fs.stat(filePath);

    return {
      label: this.sanitizeFilename(label),
      filename,
      path: filePath,
      mtime: stat.mtime.toISOString(),
    };
  }

  async savePythonTransform(
    label: string,
    content: string
  ): Promise<Workspace> {
    if (!this.pythonDir) {
      throw new Error("EntityManager not initialized");
    }

    const filename = `${this.sanitizeFilename(label)}.py`;
    const filePath = path.join(this.pythonDir, filename);

    await fs.writeFile(filePath, content, "utf-8");
    const stat = await fs.stat(filePath);

    return {
      label: this.sanitizeFilename(label),
      filename,
      path: filePath,
      mtime: stat.mtime.toISOString(),
    };
  }

  async loadJsonEntity(label: string): Promise<string> {
    if (!this.jsonDir) {
      throw new Error("EntityManager not initialized");
    }

    const filename = `${this.sanitizeFilename(label)}.json`;
    const filePath = path.join(this.jsonDir, filename);

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(`Entity "${label}" not found`);
    }
  }

  async loadPythonTransform(label: string): Promise<string> {
    if (!this.pythonDir) {
      throw new Error("EntityManager not initialized");
    }

    const filename = `${this.sanitizeFilename(label)}.py`;
    const filePath = path.join(this.pythonDir, filename);

    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(`Transform "${label}" not found`);
    }
  }

  async deleteEntity(label: string, type: "json" | "python"): Promise<void> {
    const dir = type === "json" ? this.jsonDir : this.pythonDir;
    const ext = type === "json" ? ".json" : ".py";

    if (!dir) {
      throw new Error("EntityManager not initialized");
    }

    const filename = `${this.sanitizeFilename(label)}${ext}`;
    const filePath = path.join(dir, filename);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete ${type} entity "${label}"`);
    }
  }

  getEntitiesDir(): string | null {
    return this.entitiesDir;
  }
}

const workspace = new EntityLibrary();
export default workspace;
