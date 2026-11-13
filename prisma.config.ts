import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveMigrationUrl } from "./src/lib/db/database-url";

// Prisma 7 reads connection settings here, not from schema.prisma.
// `process.env` (not the throwing `env()` helper) keeps `prisma generate` working
// in a fresh clone before anyone has created a .env file.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Migrations need a direct (unpooled) connection; see src/lib/db/database-url.ts.
  datasource: {
    url: resolveMigrationUrl(),
  },
});
