import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { App } from "electron";
import type {
  BuiltinToolInfo,
  UserToolDefinition,
  UserToolSavePayload,
} from "../../lib/userTools";
import {
  osintAgentTools,
  osintToolDescriptions,
  type OsintToolName,
} from "../../lib/aosint/agentTools";

const OMOIKA_DIR = "omoika";
const TOOLS_DIR = "tools";
const BUILTIN_SETTINGS_FILENAME = "_builtin.json";

interface BuiltinSettings {
  disabledTools: string[];
}

const VALID_TOOL_NAME = /^[A-Za-z0-9_-]+$/;
const VALID_PARAM_TYPES = new Set(["string", "number", "integer", "boolean"]);

export class UserToolLibrary {
  private toolsDir: string | null = null;
  private readyPromise: Promise<void> | null = null;

  async ready(app: App): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize(app);
    }
    return this.readyPromise;
  }

  private async initialize(app: App): Promise<void> {
    const appData = app.getPath("appData");
    this.toolsDir = path.join(appData, OMOIKA_DIR, TOOLS_DIR);
    await fs.mkdir(this.toolsDir, { recursive: true });
  }

  private requireDir(): string {
    if (!this.toolsDir) throw new Error("UserToolLibrary not initialized");
    return this.toolsDir;
  }

  private async readBuiltinSettings(): Promise<BuiltinSettings> {
    const dir = this.requireDir();
    try {
      const raw = await fs.readFile(
        path.join(dir, BUILTIN_SETTINGS_FILENAME),
        "utf-8"
      );
      return JSON.parse(raw) as BuiltinSettings;
    } catch {
      return { disabledTools: [] };
    }
  }

  private async writeBuiltinSettings(settings: BuiltinSettings): Promise<void> {
    const dir = this.requireDir();
    await fs.writeFile(
      path.join(dir, BUILTIN_SETTINGS_FILENAME),
      JSON.stringify(settings, null, 2),
      "utf-8"
    );
  }

  async listBuiltin(): Promise<BuiltinToolInfo[]> {
    const settings = await this.readBuiltinSettings();
    const disabled = new Set(settings.disabledTools);
    return osintAgentTools.map((t) => ({
      name: t.function.name,
      description:
        osintToolDescriptions[t.function.name as OsintToolName] ?? "",
      enabled: !disabled.has(t.function.name),
    }));
  }

  async setBuiltinEnabled(name: string, enabled: boolean): Promise<void> {
    if (!osintAgentTools.some((tool) => tool.function.name === name)) {
      throw new Error(`Unknown builtin tool: ${name}`);
    }

    const settings = await this.readBuiltinSettings();
    const disabled = new Set(settings.disabledTools);
    if (enabled) {
      disabled.delete(name);
    } else {
      disabled.add(name);
    }
    await this.writeBuiltinSettings({ disabledTools: [...disabled] });
  }

  async list(): Promise<UserToolDefinition[]> {
    const dir = this.requireDir();
    try {
      const files = await fs.readdir(dir);
      const tools: UserToolDefinition[] = [];
      for (const file of files) {
        if (!file.endsWith(".json") || file.startsWith("_")) continue;
        try {
          const raw = await fs.readFile(path.join(dir, file), "utf-8");
          tools.push(JSON.parse(raw) as UserToolDefinition);
        } catch {
          // skip corrupt files
        }
      }
      return tools.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  }

  private async findById(id: string): Promise<UserToolDefinition | null> {
    const dir = this.requireDir();
    try {
      const raw = await fs.readFile(path.join(dir, `${id}.json`), "utf-8");
      return JSON.parse(raw) as UserToolDefinition;
    } catch {
      return null;
    }
  }

  private validateToolName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new Error("Tool name is required.");
    }
    if (!VALID_TOOL_NAME.test(normalized)) {
      throw new Error(
        "Tool names may only contain letters, numbers, underscores, and hyphens."
      );
    }
    return normalized;
  }

  private validateParameters(
    parameters: UserToolSavePayload["parameters"]
  ): UserToolSavePayload["parameters"] {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
      throw new Error("Parameters must be an object.");
    }

    const properties =
      parameters.properties &&
      typeof parameters.properties === "object" &&
      !Array.isArray(parameters.properties)
        ? parameters.properties
        : {};

    const normalizedProperties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
          throw new Error("Parameter names cannot be empty.");
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error(`Parameter "${trimmedKey}" must be an object.`);
        }
        if (!VALID_PARAM_TYPES.has(value.type)) {
          throw new Error(
            `Parameter "${trimmedKey}" has an unsupported type: ${String(value.type)}.`
          );
        }
        if (
          value.description !== undefined &&
          typeof value.description !== "string"
        ) {
          throw new Error(`Parameter "${trimmedKey}" description must be a string.`);
        }

        return [
          trimmedKey,
          {
            type: value.type,
            ...(value.description ? { description: value.description.trim() } : {}),
          },
        ];
      })
    );

    if (
      parameters.required !== undefined &&
      !Array.isArray(parameters.required)
    ) {
      throw new Error("Parameters.required must be an array.");
    }

    const required = Array.from(
      new Set(
        (parameters.required ?? []).map((name) => {
          if (typeof name !== "string" || !name.trim()) {
            throw new Error("Each required parameter name must be a non-empty string.");
          }
          return name.trim();
        })
      )
    );

    for (const name of required) {
      if (!(name in normalizedProperties)) {
        throw new Error(`Required parameter "${name}" is missing from properties.`);
      }
    }

    return {
      properties: normalizedProperties,
      required,
    };
  }

  async save(payload: UserToolSavePayload): Promise<UserToolDefinition> {
    const dir = this.requireDir();
    const now = new Date().toISOString();
    const id = payload.id ?? randomUUID();
    const existing = payload.id ? await this.findById(id) : null;
    const name = this.validateToolName(payload.name);
    const parameters = this.validateParameters(payload.parameters);
    const script = payload.script.trim();
    if (!script) {
      throw new Error("Tool script is required.");
    }

    if (osintAgentTools.some((tool) => tool.function.name === name)) {
      throw new Error(`"${name}" is reserved by a builtin tool.`);
    }

    const tools = await this.list();
    const duplicate = tools.find((tool) => tool.id !== id && tool.name === name);
    if (duplicate) {
      throw new Error(`A tool named "${name}" already exists.`);
    }

    const tool: UserToolDefinition = {
      id,
      name,
      description: payload.description.trim(),
      enabled: payload.enabled,
      parameters,
      script,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify(tool, null, 2),
      "utf-8"
    );
    return tool;
  }

  async delete(id: string): Promise<void> {
    const dir = this.requireDir();
    await fs.unlink(path.join(dir, `${id}.json`));
  }

  async getEnabledBuiltinNames(): Promise<string[]> {
    const settings = await this.readBuiltinSettings();
    const disabled = new Set(settings.disabledTools);
    return osintAgentTools
      .map((t) => t.function.name)
      .filter((name) => !disabled.has(name));
  }
}

const userTools = new UserToolLibrary();
export default userTools;
