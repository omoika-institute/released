/// <reference types="vite/client" />

import { createHash } from "node:crypto";
import type { Database } from "@tursodatabase/database";

type Migration = {
  id: string;
  filename: string;
  sql: string;
  checksum: string;
  legacyChecksum: string;
};

type AppliedMigration = {
  migration_id: string;
  checksum: string;
};

const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_]+)\.sql$/;

const migrationModules = import.meta.glob("../schemas/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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

function parseMigration(pathname: string, sql: string): Migration {
  const filename = pathname.split("/").pop();
  if (!filename) {
    throw new Error(`Invalid migration path: ${pathname}`);
  }

  if (!MIGRATION_FILE_PATTERN.test(filename)) {
    throw new Error(
      `Invalid migration filename "${filename}". Expected NNNN_description.sql`
    );
  }

  return {
    id: filename.replace(/\.sql$/, ""),
    filename,
    sql,
    checksum: canonicalChecksumFor(sql),
    legacyChecksum: checksumFor(sql),
  };
}

function loadMigrations(): Migration[] {
  const migrations = Object.entries(migrationModules)
    .map(([pathname, sql]) => parseMigration(pathname, sql))
    .sort((left, right) =>
      left.filename.localeCompare(right.filename, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration id "${migration.id}"`);
    }
    seen.add(migration.id);
  }

  return migrations;
}

const MIGRATIONS = loadMigrations();

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
): Promise<Map<string, AppliedMigration>> {
  const rows = (await db
    .prepare(
      `SELECT migration_id, checksum
       FROM schema_migrations
       ORDER BY migration_id ASC`
    )
    .all()) as AppliedMigration[];

  return new Map(rows.map((row) => [row.migration_id, row]));
}

async function applyMigration(db: Database, migration: Migration): Promise<void> {
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
  migration: Migration
): Promise<void> {
  await db
    .prepare(
      `UPDATE schema_migrations
       SET checksum = ?
       WHERE migration_id = ?`
    )
    .run(migration.checksum, migration.id);
}

export function listMigrations(): string[] {
  return MIGRATIONS.map((migration) => migration.filename);
}

export async function migrateDatabase(db: Database): Promise<void> {
  await ensureMigrationTable(db);

  const applied = await getAppliedMigrations(db);

  for (const migration of MIGRATIONS) {
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
  }
}
