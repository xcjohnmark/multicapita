import { describe, expect, it } from "vitest";
import {
  LOCAL_DATABASE_URL,
  resolveDatabaseUrl,
  resolveMigrationUrl,
  withVerifiedSsl,
} from "./database-url";

describe("withVerifiedSsl", () => {
  it("pins weaker-in-future sslmodes to verify-full", () => {
    expect(withVerifiedSsl("postgres://u:p@h/db?sslmode=require")).toBe(
      "postgres://u:p@h/db?sslmode=verify-full",
    );
    expect(withVerifiedSsl("postgres://u:p@h/db?channel_binding=require&sslmode=prefer&x=1")).toBe(
      "postgres://u:p@h/db?channel_binding=require&sslmode=verify-full&x=1",
    );
  });

  it("leaves URLs without a weak sslmode untouched", () => {
    expect(withVerifiedSsl(LOCAL_DATABASE_URL)).toBe(LOCAL_DATABASE_URL);
    expect(withVerifiedSsl("postgres://h/db?sslmode=disable")).toBe("postgres://h/db?sslmode=disable");
    expect(withVerifiedSsl("postgres://h/db?sslmode=verify-full")).toBe(
      "postgres://h/db?sslmode=verify-full",
    );
  });
});

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
