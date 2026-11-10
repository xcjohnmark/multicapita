import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 reads connection settings here, not from schema.prisma.
// `process.env` (not the throwing `env()` helper) keeps `prisma generate` working
// in a fresh clone before anyone has created a .env file.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
