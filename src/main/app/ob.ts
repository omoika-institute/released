import fs from "node:fs";
import path from "node:path";

export interface ObConfig {
  obPath: string;
  venvPath: string | null;
}

export function findObConfig(): ObConfig {
  const venvBin = process.platform === "win32" ? "Scripts" : "bin";
  const obExecutable = process.platform === "win32" ? "ob.exe" : "ob";
  const possiblePaths = [
    path.join(process.cwd(), "venv", venvBin, obExecutable),
    path.join(__dirname, "..", "..", "venv", venvBin, obExecutable),
    path.join(process.cwd(), "environment", "venv", venvBin, obExecutable),
  ];

  for (const obPath of possiblePaths) {
    try {
      if (fs.existsSync(obPath)) {
        const venvPath = path.dirname(path.dirname(obPath));
        console.log("[CLI] Found ob at:", obPath);
        console.log("[CLI] Using venv at:", venvPath);
        return { obPath, venvPath };
      }
    } catch {
      // Continue checking
    }
  }

  console.warn("[CLI] ob not found in venv locations, using 'ob' from PATH");
  return { obPath: "ob", venvPath: null };
}

export function getObEnvironment(config: ObConfig): NodeJS.ProcessEnv {
  const env = { ...process.env };

  if (config.venvPath) {
    env.VIRTUAL_ENV = config.venvPath;
    const venvBin = path.join(
      config.venvPath,
      process.platform === "win32" ? "Scripts" : "bin"
    );
    env.PATH = `${venvBin}${path.delimiter}${env.PATH || ""}`;
    delete env.PYTHONHOME;
    console.log("[CLI] Environment configured with venv:", config.venvPath);
  }

  return env;
}

export function resolvePythonExecutable(config: ObConfig): string {
  if (!config.venvPath) {
    throw new Error(
      "Virtual environment path is required. Set it in Settings."
    );
  }

  if (process.platform === "win32") {
    return path.join(config.venvPath, "Scripts", "python.exe");
  }

  const binDir = path.join(config.venvPath, "bin");
  const versioned = process.versions?.python
    ? `python${process.versions.python}`
    : null;
  const majorMinor = versioned?.split(".").slice(0, 2).join(".");

  const candidates = [
    path.join(binDir, "python"),
    path.join(binDir, "python3"),
  ];

  if (versioned) {
    candidates.push(path.join(binDir, versioned));
  }

  if (majorMinor && versioned !== `python${majorMinor}`) {
    candidates.push(path.join(binDir, `python${majorMinor}`));
  }

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    return candidates[0];
  }
  return found;
}
