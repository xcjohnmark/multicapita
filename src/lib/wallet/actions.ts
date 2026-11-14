import {
  connect,
  getConnection,
  sendTransaction,
  signMessage,
  switchChain,
  type Connector,
} from "@wagmi/core";
import { wagmiConfig } from "./config";

/**
 * Client wallet actions on top of wagmi. The server builds every message and transaction; these
 * functions only ask the connected wallet to sign or send exactly that.
 */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string; rejected?: boolean };

function rejected(error: unknown): boolean {
  const e = error as { code?: number; name?: string; message?: string; cause?: { code?: number } };
  return e?.code === 4001 || e?.cause?.code === 4001 || e?.name === "UserRejectedRequestError" || /reject|denied/i.test(e?.message ?? "");
}

function failure(error: unknown, fallback: string): { ok: false; error: string; rejected: boolean } {
  const isRejected = rejected(error);
  return { ok: false, rejected: isRejected, error: isRejected ? "Cancelled in your wallet." : fallback };
}

/** Connect a specific wallet (or keep the current connection) and return its address. */
export async function connectWallet(connector?: Connector): Promise<ActionResult<`0x${string}`>> {
  try {
    const current = getConnection(wagmiConfig);
    if (connector && (current.connector?.uid !== connector.uid || current.status !== "connected")) {
      const result = await connect(wagmiConfig, { connector });
      return { ok: true, value: result.accounts[0] };
    }
    if (current.status === "connected" && current.address) return { ok: true, value: current.address };
    return { ok: false, error: "Pick a wallet to connect." };
  } catch (error) {
    const e = error as { name?: string };
    if (e?.name === "ConnectorAlreadyConnectedError") {
      const now = getConnection(wagmiConfig);
      if (now.address) return { ok: true, value: now.address };
    }
    return failure(error, "The wallet didn't connect.");
  }
}

async function postJson<T>(url: string, body: unknown): Promise<ActionResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json()) as { data?: T; error?: { message: string } };
    if (!response.ok || json.data === undefined) return { ok: false, error: json.error?.message ?? "Request failed." };
    return { ok: true, value: json.data };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** Server challenge → wallet signature → server verification. Shared by sign-in and linking. */
async function signChallenge(
  address: `0x${string}`,
  endpoints: { nonce: string; verify: string },
): Promise<ActionResult<{ address: string }>> {
  const challenge = await postJson<{ message: string }>(endpoints.nonce, { address, chainId: 8453 });
  if (!challenge.ok) return challenge;
  let signature: `0x${string}`;
  try {
    signature = await signMessage(wagmiConfig, { account: address, message: challenge.value.message });
  } catch (error) {
    return failure(error, "The wallet didn't sign.");
  }
  const verified = await postJson<{ address: string }>(endpoints.verify, { message: challenge.value.message, signature });
  return verified.ok ? { ok: true, value: { address } } : verified;
}

export async function signInWithConnector(connector?: Connector): Promise<ActionResult<{ address: string }>> {
  const connected = await connectWallet(connector);
  if (!connected.ok) return connected;
  return signChallenge(connected.value, { nonce: "/api/auth/nonce", verify: "/api/auth/verify" });
}

/** Prove control of another wallet and attach it to the signed-in account. */
export async function linkWithConnector(
  connector: Connector | undefined,
  signedInAddress: string | null,
): Promise<ActionResult<{ address: string }>> {
  const connected = await connectWallet(connector);
  if (!connected.ok) return connected;
  if (signedInAddress && connected.value.toLowerCase() === signedInAddress.toLowerCase()) {
    return { ok: false, error: "That's the wallet you're signed in with. Switch accounts in your wallet, then try again." };
  }
  return signChallenge(connected.value, { nonce: "/api/wallet/link/nonce", verify: "/api/wallet/link/verify" });
}

/**
 * Send one server-built transaction from `expectedFrom`. Refuses to send from any other account:
 * a plan is bound to the wallet that holds its funds.
 */
export async function sendFromWallet(
  instruction: { chainId: number; to: string; data: string; value: string },
  expectedFrom: string | null,
): Promise<ActionResult<`0x${string}`>> {
  const current = getConnection(wagmiConfig);
  if (current.status !== "connected" || !current.address) return { ok: false, error: "Connect your wallet first." };
  if (expectedFrom && current.address.toLowerCase() !== expectedFrom.toLowerCase()) {
    return { ok: false, error: `Switch your wallet to ${expectedFrom.slice(0, 6)}…${expectedFrom.slice(-4)} to sign this step.` };
  }
  try {
    if (current.chainId !== instruction.chainId) {
      await switchChain(wagmiConfig, { chainId: instruction.chainId as 8453 | 42161 });
    }
    const hash = await sendTransaction(wagmiConfig, {
      account: current.address,
      chainId: instruction.chainId as 8453 | 42161,
      to: instruction.to as `0x${string}`,
      data: instruction.data as `0x${string}`,
      value: BigInt(instruction.value),
    });
    return { ok: true, value: hash };
  } catch (error) {
    return failure(error, "The wallet returned an error.");
  }
}
