import { describe, expect, it } from "vitest";
import { signingGate } from "./signing-gate";

const on = { disabled: false, reason: null };

describe("signingGate", () => {
  it("refuses signing outside live mode, whoever is signed in", () => {
    for (const dataMode of ["sample", "dry_run"]) {
      const gate = signingGate({ dataMode, demo: false, killSwitch: on });
      expect(gate.signable).toBe(false);
      expect(gate.signingBlockedReason).toContain(dataMode);
    }
  });

  it("refuses a demo viewer even in live mode", () => {
    expect(signingGate({ dataMode: "live", demo: true, killSwitch: on }).signable).toBe(false);
  });

  it("honours the kill switch and reports its reason", () => {
    const gate = signingGate({
      dataMode: "live",
      demo: false,
      killSwitch: { disabled: true, reason: "Execution is disabled by the runtime kill switch." },
    });
    expect(gate).toEqual({
      signable: false,
      signingBlockedReason: "Execution is disabled by the runtime kill switch.",
    });
  });

  it("allows signing only for a signed-in wallet in live mode with execution on", () => {
    expect(signingGate({ dataMode: "live", demo: false, killSwitch: on })).toEqual({
      signable: true,
      signingBlockedReason: null,
    });
  });
});
