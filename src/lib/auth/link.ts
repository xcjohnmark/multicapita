/**
 * Wallet linking: a signed-in account proves control of another wallet with a one-time signature.
 *
 * The statement names the account being linked to, so a signature collected for one account can't
 * be replayed into another, and it differs from the sign-in statement, so a sign-in signature
 * can't be reused to link.
 */
export function linkStatement(accountAddress: string): string {
  return `Link this wallet to the Capita account ${accountAddress.toLowerCase()}. This proves you control it. It does not authorise any transaction.`;
}

export const SUPPORTED_WALLET_CHAINS = [8453, 42161] as const;
