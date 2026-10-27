#!/usr/bin/env node

const { createHash } = require("node:crypto") as typeof import("node:crypto");
const fs = require("node:fs/promises") as typeof import("node:fs/promises");
const path = require("node:path") as typeof import("node:path");

type Database = import("@tursodatabase/database").Database;

type MigrationFile = {
  id: string;
  filename: string;
  sql: string;
  checksum: string;
  legacyChecksum: string;
};

type AppliedMigrationRow = {
  migration_id: string;
  checksum: string;
};

const projectRoot = __dirname;
const migrationsDir = path.join(projectRoot, "src", "main", "schemas");

const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;

function usage() {
  console.error(`Usage:
  npm run db:migration:list
  npm run db:migration:create -- <name>
  npm run db:migrate -- <database-path>`);
}

function checksumFor(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function stripSqlComments(sql: string): string {
  let output = "";
  let index = 0;
  let quote: "'" | '"' | "`" | null = null;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (quote) {
      output += char;
      if (char === quote) {
        if (sql[index + 1] === quote) {
          output += sql[index + 1];
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function canonicalizeSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim();
}

function canonicalChecksumFor(sql: string): string {
  return checksumFor(canonicalizeSql(sql));
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function readMigrationFiles(): Promise<string[]> {
  await fs.mkdir(migrationsDir, { recursive: true });

  return (await fs.readdir(migrationsDir))
    .filter((file) => MIGRATION_FILE_PATTERN.test(file))
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const files = await readMigrationFiles();

  return Promise.all(
    files.map(async (filename) => {
      const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
      return {
        id: filename.replace(/\.sql$/, ""),
        filename,
        sql,
        checksum: canonicalChecksumFor(sql),
        legacyChecksum: checksumFor(sql),
      };
    })
  );
}

async function ensureMigrationTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      checksum     TEXT NOT NULL,
      applied_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getAppliedMigrations(
  db: Database
): Promise<Map<string, AppliedMigrationRow>> {
  const rows = (await db
    .prepare(
      `SELECT migration_id, checksum
       FROM schema_migrations
       ORDER BY migration_id ASC`
    )
    .all()) as AppliedMigrationRow[];

  return new Map(rows.map((row) => [row.migration_id, row]));
}

async function applyMigration(
  db: Database,
  migration: MigrationFile
): Promise<void> {
  try {
    await db.exec("BEGIN");
    await db.exec(migration.sql);
    await db
      .prepare(
        `INSERT INTO schema_migrations (migration_id, checksum)
         VALUES (?, ?)`
      )
      .run(migration.id, migration.checksum);
    await db.exec("COMMIT");
  } catch (error) {
    try {
      await db.exec("ROLLBACK");
    } catch {
      // Ignore rollback failures so the original error is preserved.
    }

    throw new Error(
      `Failed to apply migration "${migration.filename}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function updateMigrationChecksum(
  db: Database,
  migration: MigrationFile
): Promise<void> {
  await db
    .prepare(
      `UPDATE schema_migrations
       SET checksum = ?
       WHERE migration_id = ?`
    )
    .run(migration.checksum, migration.id);
}

async function listCommand(): Promise<void> {
  const files = await readMigrationFiles();
  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  for (const file of files) {
    console.log(file);
  }
}

async function createCommand(name: string): Promise<void> {
  const slug = slugify(name);
  if (!slug) {
    throw new Error("Migration name is required");
  }

  const files = await readMigrationFiles();
  const last = files.at(-1);
  const nextNumber = last
    ? Number.parseInt(last.match(MIGRATION_FILE_PATTERN)![1], 10) + 1
    : 1;
  const filename = `${String(nextNumber).padStart(4, "0")}_${slug}.sql`;
  const targetPath = path.join(migrationsDir, filename);

  const template = `-- ${filename}
-- Write forward-only SQL here.
-- Example rename:
-- ALTER TABLE my_table RENAME COLUMN old_name TO new_name;
`;

  await fs.writeFile(targetPath, template, "utf8");
  console.log(targetPath);
}

async function migrateCommand(databasePath: string): Promise<void> {
  if (!databasePath) {
    throw new Error("Database path is required");
  }

  const { connect } =
    (await import("@tursodatabase/database")) as typeof import("@tursodatabase/database");
  const db = await connect(path.resolve(projectRoot, databasePath), {
    timeout: 5000,
  });

  try {
    await db.exec("PRAGMA foreign_keys = ON");
    await db.exec("PRAGMA journal_mode = WAL");
    await ensureMigrationTable(db);

    const migrations = await loadMigrations();
    const applied = await getAppliedMigrations(db);

    for (const migration of migrations) {
      const existing = applied.get(migration.id);
      if (existing) {
        if (existing.checksum === migration.checksum) {
          continue;
        }

        if (existing.checksum !== migration.legacyChecksum) {
          console.warn(
            `Migration "${migration.filename}" checksum changed after being applied; updating stored checksum. Schema changes must be added as a new migration.`
          );
        }

        await updateMigrationChecksum(db, migration);
        continue;
      }

      await applyMigration(db, migration);
      console.log(`Applied ${migration.filename}`);
    }
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (command === "list") {
    await listCommand();
    return;
  }

  if (command === "create") {
    await createCommand(rest.join(" "));
    return;
  }

  if (command === "migrate") {
    await migrateCommand(rest[0] ?? "");
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
