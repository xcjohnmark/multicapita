import "@/lib/wallet/provider";

/**
 * Client-side SIWE flow, shared by the header menu and the sign-in page.
 *
 * Step by step: ask the wallet for an account, ask the server for a challenge, sign exactly the
 * server's message, hand the signature back. The message never contains anything secret and the
 * signature authorises nothing beyond "this address is controlled by whoever is holding it".
 */

const USER_REJECTED = 4001;

export type SignInResult =
  | { ok: true; address: string }
  | { ok: false; error: string; rejected: boolean };

function toHex(text: string): `0x${string}` {
  const bytes = new TextEncoder().encode(text);
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

export async function signInWithWallet(): Promise<SignInResult> {
  const provider = window.ethereum;
  if (!provider) {
    return {
      ok: false,
      rejected: false,
      error: "No injected wallet found. Install a browser wallet to sign in.",
    };
  }

  let address: string | undefined;
  try {
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    address = accounts[0];
  } catch (cause) {
    const rejected = (cause as { code?: number } | undefined)?.code === USER_REJECTED;
    return {
      ok: false,
      rejected,
      error: rejected
        ? "The connection request was rejected in the wallet."
        : "The wallet refused the connection request.",
    };
  }

  if (!address) {
    return { ok: false, rejected: false, error: "The wallet returned no account." };
  }

  let message: string;
  try {
    const response = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, chainId: 8453 }),
    });
    const body = (await response.json()) as { data?: { message: string }; error?: { message: string } };
    if (!response.ok || !body.data) {
      return {
        ok: false,
        rejected: false,
        error: body.error?.message ?? "Could not start the sign-in challenge.",
      };
    }
    message = body.data.message;
  } catch {
    return { ok: false, rejected: false, error: "Could not reach the sign-in endpoint." };
  }

  let signature: string;
  try {
    signature = (await provider.request({
      method: "personal_sign",
      params: [toHex(message), address],
    })) as string;
  } catch (cause) {
    const rejected = (cause as { code?: number } | undefined)?.code === USER_REJECTED;
    return {
      ok: false,
      rejected,
      error: rejected ? "Sign-in was rejected in the wallet." : "The wallet refused to sign.",
    };
  }

  try {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message: string } };
      return {
        ok: false,
        rejected: false,
        error: body.error?.message ?? "The signature could not be verified.",
      };
    }
  } catch {
    return { ok: false, rejected: false, error: "Could not reach the verification endpoint." };
  }

  return { ok: true, address };
}
