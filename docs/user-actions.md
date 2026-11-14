# User actions

Every action a user can take on the platform, where it lives, and what it does in each mode.

- **sample / dry_run**: quotes, prices and calldata are real where a source exists; settlement is a
  labelled simulation (`Simulated` tag, `sim-…` references, `dataMode: "dry_run"` positions scoped to
  the browser or the signed-in wallet). Nothing is signed or broadcast.
- **live**: the same plan runs step by step; each step is prepared server-side, signed in the wallet,
  and confirmed by its receipt (1Click legs by `/v0/status` SUCCESS).

Guardrails are the deterministic checks in `src/lib/policy/plan.ts`; a `block` disables approval.

## Account

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Connect wallet | `/signin` or Account menu → Connect wallet: click a detected wallet's icon (EIP-6963), or All wallets (Reown AppKit: WalletConnect QR, full directory; needs `NEXT_PUBLIC_REOWN_PROJECT_ID`) | `/api/auth/nonce`, `/api/auth/verify` | Signs one login message | Same | — |
| Sign out | Account menu | `/api/auth/logout` | Ends the session and disconnects the wallet | Same | — |
| Hide / show balance | Eye icon in the hero | — (localStorage) | Per browser | Same | — |
| Add a wallet (verified) | Settings → Wallets → Add wallet, or Account menu → Add wallet: switch account in the wallet, pick it, sign one message | `/api/wallet/link/nonce`, `/api/wallet/link/verify` | Balances join the account; the wallet can also sign in to this account | Can fund and sign plans (choose it in Pay with / From wallet) | Signed-in only; a wallet belongs to one account |
| Watch an address | Settings → Wallets → Watch address | `POST /api/wallet/linked` | Balances join the account | Balances only; it can never pay for a live plan | Signed-in only |
| Remove a wallet | Settings → Wallets → trash icon | `DELETE /api/wallet/linked` | Removes it from the account (nothing on-chain changes) | Same | Not the wallet you're signed in with |
| Sync portfolio | Home → Holdings → Sync | `/api/portfolio/sync` | Real RPC read | Same | Signed-in only |
| Search | Search icon or ⌘K | `/api/search` | Markets and traders | Same | — |

## Wallet flows

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Receive | Hero → Receive (`/receive`) | — | Token → network → address + QR. Demo account has no address: shows Connect | Same | — |
| Send | Hero → Send (`/send`) | `/api/plans/preview`, `/api/plans`, `/approve` | Same network: transfer; other network: real dry 1Click quote to the recipient. Simulated settlement | ERC-20/native transfer or committed 1Click quote, signed per step | Balance, recipient valid, route minimum, slippage |
| Swap | Hero → Swap (`/swap`) | same | Any tracked Base/Arbitrum token pair, real dry 1Click quote fills Buy | Committed 1Click quote, deposit signed in wallet | Balance, route minimum (USD for volatile assets), slippage, route exists |

## Opportunities

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Switch tab | `/opportunities/[tab]` (Lending, Vaults, Pools, Stocks & gold, Arbitrage, Copytrading) | — | — | — | — |
| Filter by network / asset, search, sort, grid↔table | Toolbar (URL params) | — | — | — | — |
| Sync markets | Opportunities header, empty states | `/api/opportunities/sync` | Pulls live sources; falls back to labelled sample rows; appends rate history | Same | — |
| Explore | Card → `/opportunities/[tab]/[id]` | — | Metrics, rate history (≥3 real readings), risks, contract, source + time | Same | — |
| Lend (Aave) | Detail → Execute panel | plans API | Bridge (if paying from the other network) → approve → supply → record, simulated | Each step signed; supply sized from the bridge's committed minimum | Balance, route minimum, slippage, network/protocol approved, protocol/strategy exposure, liquid reserve, market status, sample-data note |
| Vault deposit (ERC-4626) | same | plans API | bridge → approve → deposit → record, simulated | `deposit(assets, receiver)` | as above |
| Add liquidity (pool) | same | plans API | Simulated | **Blocked**: a single-asset live LP entry isn't wired | as above + live support |
| Buy stock / gold | Stocks detail → Execute | plans API | Bridge USDC to the asset's network → approve → buy, simulated | Arbitrum: SwapRouter02 with a min-out from the live price check. Ethereum assets: **blocked** (outside signing scope) | as above + market hours (XAUT trades 24/7) |
| Arbitrage entry | Arbitrage detail → Execute | plans API | Real dry 1Click quote for the buy leg; both legs simulated | **Simulation only** until a live two-leg path exists | as above |

## Copytrading

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Inspect a trader | Copytrading tab → Explore | — | Track record, holdings, memecoin flag | Same | Sample profiles are labelled |
| Copy a holding | Trader → holding → Copy | — | Opens the matching market (lending, vaults) or Swap prefilled with the token | Same | That flow's guardrails |
| Start copying | Trader → Copy this wallet | `/api/copytrading/subscriptions` | Saves rules (per-trade / daily caps, size, kinds); every copy needs approval | Same | Signed-in only; memecoins never copied |
| Inspect any wallet / pause / freeze copying | Not yet in the new UI (API exists: `/api/copytrading/inspect`, `PATCH /api/copytrading/subscriptions`) | | | | |

## Positions

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Open position detail | Home / Positions → card | — | Value, deposit, P&L, rate, history | Same | — |
| Withdraw (lending, vault) | Position → Manage → Withdraw | plans API | Simulated; reduces the position on completion (overlay, shared sample rows are never edited) | Aave `withdraw` / ERC-4626 `withdraw`; max read on-chain | Within position, slippage if delivering elsewhere |
| Sell stock | Position → Manage → Sell | plans API | Simulated | approve → SwapRouter02 sell | Within position |
| Receive on another network | Withdraw → Receive on | plans API | Adds a 1Click leg after the withdrawal | Leg sized from what the withdrawal produced | Route minimum, slippage |
| Collect pool fees | Pool position → Collect fees | plans API | Simulated (no fee amount is invented) | Uniswap `collect` | — |
| Remove liquidity | Pool position → Withdraw | plans API | Simulated | **Blocked** for now | live support |
| Add | Position → Manage → Add | — | Opens the same market's Execute panel | Same | That flow's guardrails |

## Strategy

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Propose | `/strategy` goal input / presets | `/api/strategy/propose` | NEAR AI model if configured, else the deterministic planner (labelled) | Same | `evaluateProposal` |
| Edit weights / guardrail overrides | Strategy builder | `/api/strategy/propose` with overrides | Re-evaluated per request | Same | Same |
| Review & run | Strategy card → Review & run | `/api/strategy/plans`, `/api/plans/[id]/approve`, `/api/strategy/approve` | One entry plan per leg, funded by `fundLegs`; one dialog approves all ready legs | Each plan then signs its own steps | Each leg's plan guardrails; blocked legs are skipped |

## Plans

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Approve (exact amount) | Execute → dialog | `POST /api/plans/[id]/approve` | Starts the simulated timeline | First step becomes Ready | Fresh quote (<10 min), preview passed, kill switch, per-plan and daily caps |
| Track | `/plans/[id]` | `GET /api/plans/[id]` (each read advances / reconciles) | Steps tick through submitted → settling → done | Receipts and 1Click status | — |
| Sign a step | Tracker → Sign in wallet | `/steps/[i]/prepare`, `/steps/[i]/submit` | Not shown | Wallet signs the server-built transaction | Signing gate (live, signed in, kill switch) |
| Cancel | Tracker → Cancel plan | `POST /api/plans/[id]/cancel` | Before any step goes out | Same | — |
| Retry | Tracker → Try again (failed plan) | — | Back to the market | Same | — |

## Settings

| Action | Where | API | sample / dry_run | live | Guardrails |
|---|---|---|---|---|---|
| Edit guardrails | Settings → Guardrails | `/api/strategy/constraints` | Signed-in only (the demo account's limits are shared, so read-only) | Same | — |
| View execution limits | Settings | — | Read-only | Read-only | — |
| Reset simulations | Settings → Reset simulations | `POST /api/demo/reset` | Deletes this session's simulated plans and positions | Not shown | — |
