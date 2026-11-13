import { describe, expect, it } from "vitest";
import { LOCAL_DATABASE_URL, resolveDatabaseUrl, resolveMigrationUrl } from "./database-url";

describe("database URL resolution", () => {
  it("defaults to the local Docker database", () => {
    expect(resolveDatabaseUrl({})).toBe(LOCAL_DATABASE_URL);
    expect(resolveMigrationUrl({})).toBe(LOCAL_DATABASE_URL);
  });

  it("uses the prefixed Neon integration variables on Vercel", () => {
    const env = {
      NEON_MCAP_DATABASE_URL: "postgres://pooled",
      NEON_MCAP_DATABASE_URL_UNPOOLED: "postgres://direct",
    };
    expect(resolveDatabaseUrl(env)).toBe("postgres://pooled");
    expect(resolveMigrationUrl(env)).toBe("postgres://direct");
  });

  it("lets an explicit DATABASE_URL win and ignores blank values", () => {
    const env = {
      DATABASE_URL: "postgres://explicit",
      NEON_MCAP_DATABASE_URL: "postgres://pooled",
      DATABASE_URL_UNPOOLED: "  ",
    };
    expect(resolveDatabaseUrl(env)).toBe("postgres://explicit");
    // Blank unpooled → prefixed unpooled absent → pooled explicit URL
    expect(resolveMigrationUrl(env)).toBe("postgres://explicit");
  });
});
