/**
 * Prisma client factory (Prisma 7 + pg adapter for Render PostgreSQL).
 * Call getPrisma() only after DATABASE_URL is configured.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  globalForPrisma.prisma = createPrismaClient(url);
  return globalForPrisma.prisma;
}
