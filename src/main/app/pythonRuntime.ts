import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const BUNDLED_RUNTIME_DIR_NAME = "omoika-runtime";
const WORKER_BINARY =
  process.platform === "win32" ? "omoika-worker.exe" : "omoika-worker";

function resolveRuntimeDirCandidates(): string[] {
  return Array.from(
    new Set(
      [
        process.env.OMOIKA_PY_RUNTIME_DIR,
        path.join(process.resourcesPath, BUNDLED_RUNTIME_DIR_NAME),
        path.resolve(
          process.cwd(),
          "framework",
          "dist",
          BUNDLED_RUNTIME_DIR_NAME,
        ),
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => path.resolve(value)),
    ),
  );
}

function resolveWorkerCandidates(): string[] {
  return resolveRuntimeDirCandidates().map((runtimeDir) =>
    path.join(runtimeDir, WORKER_BINARY),
  );
}

export function findBundledWorkerPath(): string | null {
  for (const candidate of resolveWorkerCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveBundledRuntimeDir(): string {
  const workerPath = findBundledWorkerPath();
  if (workerPath) {
    return path.dirname(workerPath);
  }

  throw new Error(
    [
      "Bundled Omoika runtime is missing.",
      "Build the Python runtime before starting the app.",
      `Expected ${WORKER_BINARY} in one of:`,
      ...resolveRuntimeDirCandidates().map((candidate) => `- ${candidate}`),
    ].join("\n"),
  );
}

function resolveUserDataPath(): string | null {
  const configuredUserDataPath = process.env.OMOIKA_USER_DATA_PATH?.trim();
  if (configuredUserDataPath) {
    return configuredUserDataPath;
  }

  try {
    if (app.isReady()) {
      return app.getPath("userData");
    }
  } catch {
    // Fall back to the current working directory outside the Electron app lifecycle.
  }

  return null;
}

export function resolveBundledWorkerPath(): string {
  const workerPath = findBundledWorkerPath();
  if (workerPath) {
    return workerPath;
  }

  throw new Error(
    [
      "Bundled Omoika worker is missing.",
      "Build the Python runtime before starting the app.",
      `Expected ${WORKER_BINARY} in one of:`,
      ...resolveWorkerCandidates().map((candidate) => `- ${candidate}`),
    ].join("\n"),
  );
}

export function resolvePythonRuntimeHome(): string {
  const userDataPath = resolveUserDataPath();
  if (userDataPath) return path.join(userDataPath, "python-runtime");

  return path.resolve(process.cwd(), ".omoika-runtime");
}

export function buildBundledWorkerEnvironment(): NodeJS.ProcessEnv {
  const runtimeHome = resolvePythonRuntimeHome();
  return {
    ...process.env,
    OMOIKA_RUNTIME_HOME: runtimeHome,
    PIP_CACHE_DIR: path.join(runtimeHome, "pip-cache"),
    PLAYWRIGHT_BROWSERS_PATH: path.join(runtimeHome, "playwright"),
  };
}
