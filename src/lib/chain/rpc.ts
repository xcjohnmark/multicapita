import { createPublicClient, http, type Address, type Chain, type PublicClient } from "viem";
import { SUPPORTED_CHAINS, getChain, toViemChain } from "@/lib/chains";

/**
 * One place that constructs RPC clients.
 *
 * Direct `createPublicClient` calls scattered through the codebase cannot be stubbed, which makes
 * receipt verification, gas preflight, pricing and protocol reads untestable. Every read goes
 * through here, and tests replace the client for a chain id.
 *
 * No private key ever touches this module: every client is read-only.
 */

export type RpcClient = PublicClient;

const RPC_TIMEOUT_MS = 10_000;
const overrides = new Map<number, RpcClient>();
const clients = new Map<number, RpcClient>();

export function getPublicClient(chainId: number): RpcClient {
  const override = overrides.get(chainId);
  if (override) return override;

  const existing = clients.get(chainId);
  if (existing) return existing;

  const chain = getChain(chainId);
  if (!chain) throw new Error(`No RPC configured for chain ${chainId}.`);

  const client = createPublicClient({
    chain: toViemChain(chain) as Chain,
    transport: http(chain.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 2 }),
  }) as RpcClient;

  clients.set(chainId, client);
  return client;
}

/** Test hook. Passing `null` removes the override and restores the real client. */
export function setPublicClientForTests(chainId: number, client: RpcClient | null): void {
  if (client) overrides.set(chainId, client);
  else overrides.delete(chainId);
}

export function resetPublicClientsForTests(): void {
  overrides.clear();
  clients.clear();
}

/** Read the native balance of an address on one chain. */
export async function readNativeBalance(chainId: number, address: Address): Promise<bigint> {
  return getPublicClient(chainId).getBalance({ address });
}

export function supportedRpcChainIds(): number[] {
  return SUPPORTED_CHAINS.map((chain) => chain.id);
}
