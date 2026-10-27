import { constants as fsConstants } from "node:fs";
import { access, chmod, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const appRoot = process.cwd();
const frameworkRoot = path.join(appRoot, "framework");
const specCandidates = [
  path.join(frameworkRoot, "pyinstaller", "omoika-worker.spec"),
  path.join(frameworkRoot, "src", "omoika.spec"),
];
const distPath = path.join(frameworkRoot, "dist");
const workPath = path.join(frameworkRoot, "build", "pyinstaller");
const runtimeDirName = "omoika-runtime";
const workerBinaryName =
  process.platform === "win32" ? "omoika-worker.exe" : "omoika-worker";

const pythonCandidates =
  process.platform === "win32"
    ? [path.join(frameworkRoot, ".venv", "Scripts", "python.exe")]
    : [path.join(frameworkRoot, ".venv", "bin", "python")];

async function resolvePython(): Promise<string> {
  for (const candidate of pythonCandidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return process.platform === "win32" ? "python.exe" : "python3";
}

async function resolveSpecPath(): Promise<string> {
  for (const candidate of specCandidates) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // Try the next known framework layout.
    }
  }

  throw new Error(
    [
      "Unable to find a PyInstaller spec for the bundled Python runtime.",
      "Expected one of:",
      ...specCandidates.map((candidate) => `- ${candidate}`),
    ].join("\n")
  );
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rendered = [command, ...args].join(" ");
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          [
            `Command failed with exit code ${code ?? "unknown"}: ${rendered}`,
            stderr.trim(),
            stdout.trim(),
          ]
            .filter(Boolean)
            .join("\n")
        )
      );
    });
  });
}

function runCapture(
  command: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(
        new Error(
          `Command failed with exit code ${code ?? "unknown"}: ${[command, ...args].join(" ")}\n${stderr.trim()}`
        )
      );
    });
  });
}

async function hasModule(python: string, moduleName: string): Promise<boolean> {
  const output = await runCapture(
    python,
    [
      "-c",
      `import importlib.util; print('1' if importlib.util.find_spec(${JSON.stringify(moduleName)}) else '0')`,
    ],
    frameworkRoot
  );
  return output.trim() === "1";
}

async function ensureBuildPythonEnvironment(python: string): Promise<void> {
  if (!(await hasModule(python, "pip"))) {
    await run(python, ["-m", "ensurepip", "--upgrade"], frameworkRoot);
  }

  if (!(await hasModule(python, "PyInstaller"))) {
    throw new Error(
      `PyInstaller is not installed in the framework environment: ${python}`
    );
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(root: string, maxDepth = 4): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let children;
    try {
      children = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const child of children) {
      const childPath = path.join(currentPath, child.name);
      entries.push(childPath);
      if (child.isDirectory()) {
        await walk(childPath, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return entries;
}

async function assertBundledPythonRuntime(): Promise<void> {
  const runtimePath = path.join(distPath, runtimeDirName);
  const workerPath = path.join(runtimePath, workerBinaryName);

  if (await pathExists(workerPath)) {
    return;
  }

  const appBundleWorkerPath = path.join(
    runtimePath,
    `${workerBinaryName}.app`,
    "Contents",
    "MacOS",
    workerBinaryName
  );

  if (process.platform === "darwin" && (await pathExists(appBundleWorkerPath))) {
    await writeFile(
      workerPath,
      [
        "#!/bin/sh",
        'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
        `exec "$DIR/${workerBinaryName}.app/Contents/MacOS/${workerBinaryName}" "$@"`,
        "",
      ].join("\n")
    );
    await chmod(workerPath, 0o755);
    return;
  }

  const distEntries = await findFiles(distPath, 3);
  throw new Error(
    [
      `PyInstaller did not produce ${path.join(runtimeDirName, workerBinaryName)}.`,
      `Expected runtime directory: ${runtimePath}`,
      "Found dist entries:",
      ...distEntries.map((entry) => `- ${path.relative(distPath, entry)}`),
    ].join("\n")
  );
}

export async function buildBundledPythonRuntime(): Promise<void> {
  if (process.env.OMOIKA_SKIP_PY_RUNTIME_BUILD === "1") {
    return;
  }

  const python = await resolvePython();
  const specPath = await resolveSpecPath();
  await ensureBuildPythonEnvironment(python);

  await rm(path.join(distPath, "omoika-runtime"), {
    force: true,
    recursive: true,
  });

  await run(
    python,
    [
      "-m",
      "PyInstaller",
      "--noconfirm",
      "--distpath",
      distPath,
      "--workpath",
      workPath,
      specPath,
    ],
    frameworkRoot
  );

  await assertBundledPythonRuntime();
}

if (require.main === module) {
  buildBundledPythonRuntime().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
