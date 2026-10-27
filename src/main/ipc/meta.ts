import { spawn } from "node:child_process";
import path from "node:path";
import { dialog, shell } from "electron";
import { IpcContext } from "./types";
import { bindHandle } from "./handle";

function tokenizeEditorCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"'`]+|"[^"]*"|'[^']*')+/g) ?? [];
  return parts.map((part) => part.replace(/^["']|["']$/g, ""));
}

function buildEditorArgs(
  executable: string,
  filePath: string,
  lineNumber?: number
): string[] {
  const basename = path.basename(executable).toLowerCase();
  const line = Number.isFinite(lineNumber) ? Math.max(1, Number(lineNumber)) : null;

  if (line) {
    if (
      basename.includes("code") ||
      basename.includes("cursor") ||
      basename.includes("windsurf") ||
      basename.includes("codium")
    ) {
      return ["--goto", `${filePath}:${line}`];
    }
    if (basename === "subl" || basename.includes("sublime")) {
      return [`${filePath}:${line}`];
    }
    if (basename === "mate") {
      return ["-l", String(line), filePath];
    }
    if (basename === "vim" || basename === "nvim" || basename === "vi") {
      return [`+${line}`, filePath];
    }
  }

  return [filePath];
}

function launchEditor(filePath: string, lineNumber?: number): Promise<void> {
  const editorCommand =
    process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || "";
  if (!editorCommand) {
    return Promise.reject(new Error("EDITOR is not set"));
  }

  const [executable, ...baseArgs] = tokenizeEditorCommand(editorCommand);
  if (!executable) {
    return Promise.reject(new Error("EDITOR is not set"));
  }

  const args = [...baseArgs, ...buildEditorArgs(executable, filePath, lineNumber)];

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function registerMetaIpc({ app }: IpcContext) {
  // Version information handler (for when a user requests support)
  bindHandle("app:get-version", async () => {
    return app.getVersion();
  });

  // Open a URL in user's default browser
  bindHandle("app:open-external", async (_, url: string) => {
    await shell.openExternal(url);
  });

  // Open folder selection dialog
  bindHandle("app:open-folder-dialog", async () => {
    return await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
  });

  bindHandle(
    "app:open-in-editor",
    async (_event, payload: { path: string; lineNumber?: number }) => {
      const targetPath = payload?.path?.trim();
      if (!targetPath) {
        return { success: false, error: "Missing path" };
      }

      const resolvedPath = path.resolve(targetPath);
      try {
        await launchEditor(resolvedPath, payload?.lineNumber);
        return { success: true };
      } catch (error) {
        console.warn("[meta] Failed to open editor via EDITOR:", error);
        const fallbackError = await shell.openPath(resolvedPath);
        if (fallbackError) {
          return { success: false, error: fallbackError };
        }
        return { success: true };
      }
    }
  );
}
