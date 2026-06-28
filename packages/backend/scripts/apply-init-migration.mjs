import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL / DIRECT_URL required");
  process.exit(1);
}

const migrationName = "20260711000000_init";
const sqlPath = resolve("prisma/migrations", migrationName, "migration.sql");
const sql = readFileSync(sqlPath, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
});

await client.connect();
console.log("connected");

await client.query("BEGIN");
try {
  await client.query(sql);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  const exists = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
    [migrationName],
  );
  if (exists.rowCount === 0) {
    await client.query(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)`,
      [randomUUID(), checksum, migrationName],
    );
  }
  await client.query("COMMIT");
  console.log("migration applied:", migrationName);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
