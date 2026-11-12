import { describe, expect, it } from "vitest";
import { runPortfolioHealthCheck } from "./monitoring";

describe("Stage S6: Portfolio Health & Monitoring Engine", () => {
  it("returns healthy status when no risky positions or depegs exist", async () => {
    // Non-existent user returns clean healthy report
    const report = await runPortfolioHealthCheck("non-existent-user-id");

    expect(report.status).toBe("healthy");
    expect(report.openPositionsCount).toBe(0);
    expect(report.alerts).toEqual([]);
    expect(report.checkedAt).toBeDefined();
  });
});
