import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

for (const p of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
]) {
  if (existsSync(p)) loadDotenv({ path: p, override: false });
}

/**
 * Prisma CLI uses DIRECT_URL (session/direct) for migrations.
 * Runtime PrismaClient continues to use DATABASE_URL (Supabase pooler).
 */
function migrateUrl(): string {
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) return direct;
  const pooled = process.env.DATABASE_URL?.trim();
  if (!pooled) throw new Error("DATABASE_URL is required");
  // Best-effort: transaction pooler :6543 → session :5432
  return pooled
    .replace(":6543/", ":5432/")
    .replace("?pgbouncer=true", "")
    .replace("&pgbouncer=true", "");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrateUrl(),
  },
});
