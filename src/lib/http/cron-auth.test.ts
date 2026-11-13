import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const SECRET = "s3cret-value-for-tests-0123456789";

describe("isCronAuthorized", () => {
  it("accepts the exact Vercel Cron bearer header", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET, "production")).toBe(true);
  });

  it("rejects a missing, wrong or differently-sized header when a secret is set", () => {
    expect(isCronAuthorized(null, SECRET, "production")).toBe(false);
    expect(isCronAuthorized("Bearer wrong", SECRET, "production")).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET, "production")).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET, "development")).toBe(false);
  });

  it("closes the route in production when no secret is configured", () => {
    expect(isCronAuthorized(null, undefined, "production")).toBe(false);
    expect(isCronAuthorized("Bearer anything", "", "production")).toBe(false);
  });

  it("allows local triggering without a secret outside production", () => {
    expect(isCronAuthorized(null, undefined, "development")).toBe(true);
    expect(isCronAuthorized(null, undefined, "test")).toBe(true);
  });
});
