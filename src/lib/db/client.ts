import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Prisma 7 requires a driver adapter. SQLite via better-sqlite3 keeps the project
 * runnable with `npm install` only — no Docker, no hosted database.
 *
 * Migrating to PostgreSQL later means changing the datasource provider, swapping this
 * adapter for `@prisma/adapter-pg`, and re-running migrations. No query in the app
 * depends on SQLite-specific behaviour.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export type Db = PrismaClient;
