/**
 * Whether the UI may hand a prepared transaction to the wallet for signing.
 *
 * Preparing calldata is research and is allowed in every mode, so a dry run can show exactly what
 * would be signed. Sending it is execution: it needs live mode, a signed-in (non-demo) wallet and
 * no kill switch. The 1Click path enforces the same rule server-side in `prepareMove`; protocol
 * calls are signed client-side, so the gate is returned with every prepared step and the client
 * must not offer a signature when `signable` is false.
 */
export type SigningGate = { signable: boolean; signingBlockedReason: string | null };

export function signingGate(input: {
  dataMode: string;
  demo: boolean;
  killSwitch: { disabled: boolean; reason: string | null };
}): SigningGate {
  if (input.dataMode !== "live") {
    return {
      signable: false,
      signingBlockedReason: `Signing is off: this deployment runs in ${input.dataMode} mode. The calldata above is what a live deployment would ask your wallet to sign.`,
    };
  }
  if (input.demo) {
    return { signable: false, signingBlockedReason: "Sign in with your wallet to sign transactions." };
  }
  if (input.killSwitch.disabled) {
    return {
      signable: false,
      signingBlockedReason: input.killSwitch.reason ?? "Execution is disabled.",
    };
  }
  return { signable: true, signingBlockedReason: null };
}
