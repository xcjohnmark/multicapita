import { getPrisma } from "@/lib/db/client";

/**
 * An account's wallets, one entry per address (rows are stored per chain).
 *
 *  - `signed_in`: the wallet this session signed in with;
 *  - `owned`: control proven by a signature (can sign plans);
 *  - `watch`: added by address only — balances are read, nothing is ever signed for it.
 */

export type WalletRole = "signed_in" | "owned" | "watch";

export type AccountWallet = {
  address: string;
  label: string | null;
  role: WalletRole;
  chainIds: number[];
  verifiedAt: string | null;
};

export async function listAccountWallets(userId: string, sessionAddress: string | null): Promise<AccountWallet[]> {
  const rows = await getPrisma().wallet.findMany({
    where: { userId, chainFamily: "evm" },
    orderBy: { createdAt: "asc" },
    select: { address: true, chainId: true, label: true, ownershipVerifiedAt: true },
  });
  const byAddress = new Map<string, AccountWallet>();
  for (const row of rows) {
    const address = row.address.toLowerCase();
    const entry =
      byAddress.get(address) ??
      ({ address, label: null, role: "watch", chainIds: [], verifiedAt: null } satisfies AccountWallet);
    if (!entry.chainIds.includes(row.chainId)) entry.chainIds.push(row.chainId);
    if (row.ownershipVerifiedAt) {
      entry.role = "owned";
      entry.verifiedAt = row.ownershipVerifiedAt.toISOString();
    }
    if (row.label && !/^Live .* Wallet$/.test(row.label)) entry.label = entry.label ?? row.label;
    byAddress.set(address, entry);
  }
  const session = sessionAddress?.toLowerCase() ?? null;
  const wallets = [...byAddress.values()].map((wallet) =>
    wallet.address === session ? { ...wallet, role: "signed_in" as const } : wallet,
  );
  const order: Record<WalletRole, number> = { signed_in: 0, owned: 1, watch: 2 };
  return wallets.sort((a, b) => order[a.role] - order[b.role]);
}

/** Addresses this account has proven it controls (may sign plans). */
export async function ownedAddresses(userId: string): Promise<Set<string>> {
  const rows = await getPrisma().wallet.findMany({
    where: { userId, ownershipVerifiedAt: { not: null } },
    select: { address: true },
    distinct: ["address"],
  });
  return new Set(rows.map((row) => row.address.toLowerCase()));
}
