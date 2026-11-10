/**
 * The only wallet surface this app needs: an injected EIP-1193 provider.
 *
 * Declared once, globally, so every component sees the same `window.ethereum` type. No SDK, no
 * WalletConnect project id — the browser already exposes this.
 */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
