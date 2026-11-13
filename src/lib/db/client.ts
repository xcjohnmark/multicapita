import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { withVerifiedSsl } from "./database-url";

/**
 * Prisma 7 requires a driver adapter. PostgreSQL via node-postgres: Neon in production (pooled
 * `DATABASE_URL`), a local Docker Postgres in development. See docs/adr/0007-postgres-on-vercel.md.
 *
 * The client is cached on globalThis so dev hot-reloads and warm serverless invocations reuse one
 * pool instead of opening a new set of connections per request.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: withVerifiedSsl(env.DATABASE_URL) });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export type Db = PrismaClient;
