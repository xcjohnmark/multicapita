# DESIGN.md — Capita Platform Design System

> **Document Role:** Canonical UI, branding, and interaction specification for coding agents building **Capita**.
> **Scope Note (Platform-Specific):** This design system replicates the **`near.com/home` web application platform (`#dashboard`)** extracted in [`project-docs/strp-design-sys.md`](project-docs/strp-design-sys.md), **strictly adapted to White Mode (Light Mode)** and paired with Capita's product requirements in [`project-docs/prd.md`](project-docs/prd.md) and [`GLOSSARY.md`](GLOSSARY.md).
> **Update 2026-11-13:** structure, typography, spacing and radii now follow the **Nouva** Framer template's design system (§0), kept in Capita's light palette. §0 wins wherever older sections disagree.

---

## 0. Nouva Structure (current — overrides older sections)

Source: the free **Nouva** Framer template ([marketplace](https://www.framer.com/marketplace/templates/nouva/), [design-system page](https://nouva-template.framer.website/design-system)). We borrow its **system**, not its assets or copy: Nouva is dark-only with no accent; Capita keeps its **light palette** (§2) and the green accent for the primary action and money-positive states only.

**Borrowed:**
- **Type:** Onest, regular-weight headings with -0.04em tracking (§3).
- **Spacing:** 8 (inside a group) · 12 (eyebrow→title, button rows) · 16 (card grids, title→subtitle) · 24 (card padding) · 32 (large cards) · 48 (section head→panel) · 64 (section head→content) · **96px section padding top/bottom, 40px left/right** (`.section`), **150px hero top padding**.
- **Radii:** 16 / 12 / 10 (§5.1).
- **Restraint:** no shadows/glows/gradients; depth from surface steps + 1px border.
- **Section anatomy (landing):** `.section` → `.section-head` (`.eyebrow` → `.type-h2` → `.type-body-lg` intro, centered, max 44rem) → content grid with `gap-4`.
- **Patterns:** full-height landscape hero with centered title, one primary + one outline action and a "Scroll to discover" indicator; feature cards in rows of three; benefits in a 2×3 grid; one landscape per section at most (inside a 16px panel or full-bleed); FAQ accordion; footer with an oversized wordmark.

**Not borrowed:** dark surfaces, Nouva's landscape images, its copy, pricing section, testimonials (Capita has no real testimonials — never invent them).

**Honesty constraints stay absolute:** marketing sections never show rates, APYs or "live" data unless they are read from the database with source + timestamp (see `src/components/landing/live-markets.tsx`); empty states say data hasn't been synced rather than showing placeholders.

---

## 1. Platform Identity & Branding

| Property | Specification |
|---|---|
| **Platform Name** | **Capita** |
| **Tagline** | *All your crypto. One place.* |
| **Wordmark** | `Capita` — set in **Onest Regular (`400`)**, `-0.02em` tracking, `text-ink` |
| **Logo Mark** | Minimal geometric "C" / converging loop mark (`24×24px`, `1.5px` stroke) derived from continuous cross-chain settlement geometry |
| **Theme Mode** | **Strict White Mode (Light Mode)** — pure white canvas, crisp slate borders, high-contrast ink |
| **Personality** | Calm, clinical, trustworthy, concise. Feels like a modern consumer fintech desk — never noisy, never "degen dark-neon" or generic AI SaaS slop. |

### Voice & Copy Rules (Aligned with [`project-docs/prd.md`](project-docs/prd.md))

1. **Concise UI labels:** Prefer icon-only controls (`aria-label` required) or 1–2 word labels over verbose pills.
2. **No invented or hyped numbers:** Every APY, balance, quote, and P&L figure must carry its `source` and observation timestamp. Never say "guaranteed yield" or "risk-free".
3. **Honest states:** Explicitly distinguish **Research/Discovery** from **Executable Quotes**, **Estimated Profit** from **Realised P&L**, and **`sample` / `dry_run`** from **`live`**.
4. **Canonical terminology:** Follow [`GLOSSARY.md`](GLOSSARY.md) (`Available`, `Deployed`, `Total value`, `Unrealised P&L`, `Cost basis`, `1Click`, `Guardrail`).

---

## 2. Color System (White Mode — `near.com/home` Light Tokens)

Derived from the live `near.com/home` platform extraction (`strp-design-sys.md`) and strictly scoped to **White Mode (Light Mode)**.

### 2.1 Canvas & Surface Hierarchy

| Token | Value / Tailwind Ref | Usage |
|---|---|---|
| `--color-canvas` | `#FFFFFF` (`bg-white`) | Primary page & `#dashboard` background |
| `--color-surface` | `#F9FAFB` (`gray-50`) | Card backgrounds, subtle panels, table header strips |
| `--color-surface-raised` | `#F3F4F6` (`gray-100`) | Nested cards, hover fills, active nav backgrounds |
| `--color-surface-hover` | `rgba(17, 24, 39, 0.04)` (`gray-900/4`) | Light-mode counterpart to `near.com/home`'s `hover:bg-white/4` on cards & nav links |
| `--color-surface-overlay` | `#FFFFFF` | Floating popovers, dropdowns, modals (separated via border + subtle shadow) |

### 2.2 Borders & Lines

| Token | Value / Tailwind Ref | Usage |
|---|---|---|
| `--color-line` | `#E5E7EB` (`gray-200`) | Default `1px` card borders, table row rules, section dividers |
| `--color-line-strong` | `#D1D5DB` (`gray-300`) | Hover borders, active inputs, secondary button borders |
| `--color-line-faint` | `#F3F4F6` (`gray-100`) | Subtle internal dividers inside cards and dense tables |

### 2.3 Ink (Typography Colors)

| Token | Value / Tailwind Ref | Usage |
|---|---|---|
| `--color-ink` | `#111827` (`gray-900` / `lab(7.78 0 0)`) | Primary headings, active nav, metric values, primary body |
| `--color-ink-secondary` | `#4B5563` (`gray-600`) | Supporting descriptions, inactive nav labels, secondary copy |
| `--color-ink-muted` | `#6B7280` (`gray-500`) | Eyebrows, table headers, timestamps, data provenance |
| `--color-ink-faint` | `#9CA3AF` (`gray-400`) | Disabled labels, placeholders, subtle metadata |

### 2.4 Primary, Secondary & Semantic Accents (from `near.com/home`)

| Token | Value / Tailwind Ref | Role & Platform Source |
|---|---|---|
| `--color-accent` | `#22C55E` (`green-500` / `lab(82.9 -63.9 27.4)`) | **Primary Accent** — text selection (`selection:bg-green-500 selection:text-black`), positive P&L, active/connected indicators, `LIVE` status |
| `--color-accent-surface` | `rgba(34, 197, 94, 0.12)` (`green-500/12`) | Soft green pill backgrounds, positive badge fills |
| `--color-accent-ink` | `#15803D` (`green-700`) | Accessible dark green text on light green or white backgrounds |
| `--color-highlight` | `rgba(254, 240, 138, 0.5)` (`yellow-200/50`) | **Secondary Platform Accent** — extracted verbatim from `near.com/home`'s signature interactive icon buttons & attention triggers (`oklab(0.769 0.064 0.177 / 0.25)`) |
| `--color-highlight-hover` | `#FEF08A` (`yellow-200`) | Hover fill for yellow-tinted action buttons (`hover:not-disabled:bg-yellow-200`) |
| `--color-highlight-ink` | `#A16207` (`yellow-700`) | Text/icon color inside yellow-tinted buttons & warning chips |
| `--color-highlight-outline` | `#EAB308` (`yellow-500`) | Focus ring on yellow-accented interactive controls |
| `--color-info` | `#0091FD` (`blue-500` / NEAR Blue) | Links, explorer URLs, `dry_run` mode indicators, info callouts |
| `--color-warn` | `#F59E0B` (`amber-500`) | `sample` data mode banner, slippage alerts, pending settlement |
| `--color-danger` | `#EF4444` (`red-500`) | Negative P&L, policy violations, failed/reverted transactions, danger CTAs |

### 2.5 Button Color Tokens

| Button Variant | Background | Hover Background | Text / Icon | Border / Outline |
|---|---|---|---|---|
| **Primary CTA** | `#111827` (`gray-900`) | `#1F2937` (`gray-800`) | `#FFFFFF` | `outline-gray-900` |
| **Positive / Execute** | `#22C55E` (`green-500`) | `#16A34A` (`green-600`) | `#000000` (`text-black`) | `outline-green-600` |
| **Platform Highlight (Near-style Icon/Action)** | `rgba(254, 240, 138, 0.5)` (`yellow-200/50`) | `#FEF08A` (`yellow-200`) | `#A16207` (`yellow-700`) | `outline-yellow-500` |
| **Secondary** | `#FFFFFF` | `#F9FAFB` (`gray-50`) | `#111827` (`gray-900`) | `1px solid #D1D5DB` (`gray-300`) |
| **Ghost** | `transparent` | `rgba(17, 24, 39, 0.04)` (`gray-900/4`) | `#4B5563` (`gray-600`) -> `#111827` | `outline-gray-900` |
| **Danger** | `#EF4444` (`red-500`) | `#DC2626` (`red-600`) | `#FFFFFF` | `outline-red-500` |

### 2.6 Strict Color Rules

1. **White Mode only.** Never ship dark-mode backgrounds on Capita. All containers sit on `#FFFFFF`, `#F9FAFB`, or `#F3F4F6`.
2. **Text selection always matches `near.com/home`:** `selection:bg-green-500 selection:text-black` applied on `<html>`.
3. **No decorative gradients.** Flat surfaces and crisp `1px` borders only.
4. **Never rely on color alone:** Pair green/red P&L with `▲` / `▼` or `+` / `−`, and pair status dots with explicit labels (`PENDING_DEPOSIT`, `PROCESSING`, `SUCCESS`, `REFUNDED`, `FAILED`).

---

## 3. Typography (Onest, Nouva scale)

- **UI & display:** **Onest** (Google Fonts, SIL OFL), loaded with `next/font/google` in [`src/app/layout.tsx`](src/app/layout.tsx) as `--font-onest`, weights `400` and `500` only.
- **Figures:** **JetBrains Mono** + `tabular-nums` for amounts, rates, hashes, addresses (`.metric`, `data-numeric`).
- Classes live in [`src/app/globals.css`](src/app/globals.css). Use them instead of ad-hoc `text-[Npx] font-semibold`.

| Class | Size | Line height | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `.type-h1` | 60px (clamps down to 40px) | 1.0 | -0.04em | 400 | Landing hero title, once per page |
| `.type-h2` | 48px (clamps to 32px) | 1.05 | -0.04em | 400 | Section titles, always under an `.eyebrow` |
| `.type-h3` | 36px (clamps to 28px) | 1.15 | -0.04em | 400 | Large statements inside a section |
| `.type-h4` | 28px | 1.3 | -0.02em | 400 | **App page titles** (`Opportunities`, `Positions`, …) |
| `.type-h5` | 20px | 1.3 | -0.02em | 400 | Landing card titles, strategy card names |
| `.type-h6` | 18px | 1.4 | -0.01em | 400 | FAQ questions, small titles |
| `.type-card-title` | 16px | 1.4 | -0.02em | 500 | Dense app panel titles (`PanelHeader`) |
| `.type-body-lg` | 18px | 1.4 | 0 | 400 | Hero subtitle, section intros |
| `.type-body-md` | 16px | 1.45 | 0 | 400 | Regular copy, card descriptions |
| `.type-body-sm` | 14px | 1.5 | 0 | 400 | Captions, small print |
| `.eyebrow` | 12px uppercase | 1.33 | 0.06em | 500 | Above every section title; badges; table headers |
| Button text | 15px (`lg`) / 14px (`md`) / 13px (`sm`) | 1 | -0.01em | 500 | Inside buttons only |

Rules:
1. **Nothing heavier than `500`.** Headings are regular; hierarchy comes from size, tracking and ink contrast.
2. **Nothing smaller than `12px`.** No `text-[10px]`/`text-[11px]`.
3. All money/rate/time figures use `tabular-nums`; addresses are shortened (`0xA238…d1c5`) with the full value in `title`.

---

## 4. Spacing & Layout (`#dashboard` Architecture)

Built **desktop-first** to mirror `near.com/home`'s `#dashboard` shell, then scaled cleanly to tablet and mobile.

### 4.1 Spacing Scale (4px Tailwind Unit)

| Token | Value | Platform Usage |
|---|---|---|
| `space-1` | `4px` (`gap-1`) | Tight icon-to-badge spacing |
| `space-1.5` | `6px` (`gap-1.5`) | Inline status dot + label |
| `space-2` | `8px` (`gap-2`, `p-2`) | Toolbar button gaps, compact chip padding |
| `space-2.5` | `10px` (`px-2.5`) | Nav link horizontal padding (`px-2.5` from `near.com/home`) |
| `space-3` | `12px` (`gap-3`, `p-3`) | Nav icon-to-label gap (`gap-3` from `near.com/home`), tight panel sections |
| `space-4` | `16px` (`gap-4`, `p-4`) | Standard card padding (`p-4`), form field stack |
| `space-5` | `20px` (`p-5`) | Primary dashboard panel padding (`p-5` on desktop) |
| `space-6` | `24px` (`gap-6`, `space-y-6`) | Grid gap between cards and major vertical section stack |
| `space-8` | `32px` (`px-8`, `py-8`) | Desktop outer workspace padding |

### 4.2 Shell & `#dashboard` Layout Structure (Desktop-First)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ <html class="antialiased selection:bg-green-500 selection:text-black">     │
│ <body class="relative isolate bg-white text-gray-900">                     │
│                                                                            │
│ ┌─────────────────┬──────────────────────────────────────────────────────┐ │
│ │ Sidebar (232px) │ Top Bar (h-16 / 64px, sticky, border-b gray-200)     │ │
│ │                 │ [Mode Chip]         [Icon:Wallet] [Icon:Bell] [CTA]  │ │
│ │  [C] Capita     ├──────────────────────────────────────────────────────┤ │
│ │                 │ #dashboard Main Workspace (max-w-[1200px], mx-auto)  │ │
│ │  Nav Links:     │                                                      │ │
│ │  h-11 (44px)    │  • DataModeBanner (if sample / dry_run)              │ │
│ │  rounded-xl     │  • Page Header + Observed Timestamp                  │ │
│ │  px-2.5 gap-3   │  • KPI Summary Strip (4-col grid on xl)              │ │
│ │  hover:gray-900/4│ • Primary Content Grid (12-col, gap-6)              │ │
│ │                 │                                                      │ │
│ │  ─────────────  ├──────────────────────────────────────────────────────┤ │
│ │  Networks:      │ Footer: Non-custodial & source provenance disclaimer │ │
│ │  Base · Arbitrum│                                                      │ │
│ └─────────────────┴──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Exact Platform Component Spacing Measurements

| Element | Extracted / Target Spacing |
|---|---|
| `body` stacking isolation | `relative isolate` |
| Desktop sidebar width | `232px` (`w-[232px]`), internal padding `p-3` (`12px`), nav list `space-y-1` (`4px`) |
| Sidebar nav link | `h-11` (`44px`), `px-2.5` (`10px`), `gap-3` (`12px`), `rounded-xl` (`12px`) |
| Icon-only toolbar button | `size-9` (`36×36px`), `rounded-lg` (`8px`), icon `size-5` (`20×20px`) |
| Top utility bar height | `h-16` (`64px`), `px-6` / `px-8`, `gap-2` (`8px`) between action controls |
| Main content container | `max-w-[1200px]`, `px-8 py-6` on desktop (`>= xl`), `px-4 py-4` on mobile |
| Card / Panel internal padding | `p-5` (`20px`) standard, `px-5 py-4` for panel headers |
| Grid gutter between cards | `gap-6` (`24px`) desktop, `gap-4` (`16px`) mobile |

---

## 5. Border Radius & Elevation

Direct replication of `near.com/home`'s platform geometry (`strp-design-sys.md`):

### 5.1 Radius Scale (Nouva)

| Token | Value | Use |
|---|---|---|
| `--radius-panel` | **16px** | Cards, panels, landscape frames, modals (`.panel`, `.panel-inset`) |
| `--radius-control` | **12px** | Buttons, inputs, insets, nav links, icon tiles, banners |
| `--radius-media` | **10px** | Images/media inside a card (`.media`) |
| `rounded-md` | 6px | Small inline risk tags only |
| `rounded-full` | 9999px | Status dots, chips/pills, avatars |

> Never use other arbitrary radii. Depth comes from surface steps (`canvas` → `surface` → `surface-raised`) and a 1px `line` border — **no shadows, glows or gradients on UI** (the only gradients allowed are legibility scrims over landscape photos).

### 5.2 Elevation & Shadow Model

In White Mode, borders carry structure; shadows are ultra-subtle and strictly reserved for floating layers.

| Level | Usage | Definition |
|---|---|---|
| **0 (Flat)** | Cards, panels, tables | `shadow-none`, `border border-gray-200` |
| **1 (Floating)** | Dropdowns, tooltips, popovers | `border border-gray-200 shadow-[0_4px_16px_rgba(17,24,39,0.08)]` |
| **2 (Modal)** | Confirmation dialogs, wallet modals | `border border-gray-200 shadow-[0_12px_36px_rgba(17,24,39,0.12)]` |
| **Scrim** | Behind open modals | `bg-gray-900/30 backdrop-blur-[2px]` |

---

## 6. Iconography (Concise Icon-First Design)

| Property | Specification |
|---|---|
| **Library** | **`lucide-react`** ([lucide.dev/icons](https://lucide.dev/icons)) |
| **Stroke Width** | `1.5` (`strokeWidth={1.5}`) for calm fintech precision |
| **Sizes** | `20×20px` (`size-5`) inside `size-9` buttons & sidebar nav; `16×16px` (`size-4`) inline/table; `14×14px` (`size-3.5`) inside compact chips |
| **Color** | `currentColor` (inherits parent ink token) |

### Concise Icon-First Rules

1. **Replace redundant text pills with clean icon buttons:**
   - Instead of a bulky `[Wallet] Connect Wallet` pill everywhere in compact toolbars, use a `size-9 rounded-lg` button with `<Wallet />` (`aria-label="Wallet"` / shows connected green dot when active, opening wallet popover on click; show shortened address only when helpful or inside the popover).
   - Use `<RefreshCw />` for quote refresh, `<SlidersHorizontal />` for guardrails, `<Eye />` / `<EyeOff />` for privacy/balance masking (`confidential-mode` inspired!), `<ArrowLeftRight />` for swaps/routes, `<ShieldCheck />` for deterministic policy pass, `<AlertTriangle />` for guardrail block, `<ExternalLink />` for block explorer links.
2. **Accessibility is mandatory:** Every icon-only button **MUST** include `aria-label` and a subtle hover tooltip (`title` or Tooltip component). Decorative icons carry `aria-hidden="true"`.
3. **Chain & Token Logos:** Use authentic SVG marks for Base, Arbitrum, Ethereum, NEAR, and USDC. Never invent fake token icons.

---

## 7. Components (Platform-Specific Blueprints)

Every interactive class below mirrors `near.com/home`'s exact structural DNA from `strp-design-sys.md`, adapted for White Mode.

### 7.1 Buttons

**Base shared behavior (exact `near.com/home` platform pattern):**
```txt
relative inline-flex shrink-0 items-center justify-center font-medium leading-none tracking-tight
transition-transform duration-100 active:not-disabled:scale-[0.97]
disabled:cursor-not-allowed disabled:opacity-40 data-loading:pointer-events-none
outline-offset-2 focus-visible:outline-2 rounded-lg
```

- **Icon-Only Button (`size-9`, 36×36px):**
  `size-9 rounded-lg [&_svg:not([class*='size-'])]:size-5`
  - **Platform Yellow Highlight Variant (signature `near.com/home` action/wallet/alert trigger):**
    `bg-yellow-200/50 text-yellow-700 outline-yellow-500 hover:not-disabled:bg-yellow-200`
  - **Neutral Ghost Icon Button:**
    `bg-transparent text-gray-600 outline-gray-900 hover:not-disabled:bg-gray-900/4 hover:not-disabled:text-gray-900`
- **Text / Action Buttons:**
  - **Size `sm`:** `h-8 px-3 text-sm gap-1.5`
  - **Size `md` (default):** `h-9 px-4 text-sm gap-2`
  - **Size `lg` (execution confirm):** `h-11 px-5 text-base gap-2`
  - **Primary (`gray-900`):** `bg-gray-900 text-white outline-gray-900 hover:not-disabled:bg-gray-800`
  - **Execute / Approve (`green-500`):** `bg-green-500 text-black font-semibold outline-green-600 hover:not-disabled:bg-green-400`
  - **Secondary (Outline):** `bg-white text-gray-900 border border-gray-300 outline-gray-900 hover:not-disabled:bg-gray-50`
  - **Danger:** `bg-red-500 text-white outline-red-500 hover:not-disabled:bg-red-600`

### 7.2 Navigation Items (Sidebar)

Exact `near.com/home` link geometry adapted to White Mode:
```txt
group focus-visible:-outline-offset-2 relative flex h-11 flex-1 items-center gap-3 rounded-xl px-2.5
text-sm font-medium tracking-tight transition-colors duration-100
hover:bg-gray-900/4 focus-visible:outline-2 focus-visible:outline-gray-900
```
- **Active item:** `bg-gray-100 text-gray-900` (with subtle green status indicator or crisp bold icon).
- **Inactive item:** `text-gray-600 hover:text-gray-900`.
- **Routes (aligned with [`src/components/shell/app-shell.tsx`](src/components/shell/app-shell.tsx)):** Overview (`/`), Opportunities (`/opportunities`), Strategy (`/strategy`), Execute (`/execute`), Positions (`/positions`), Activity (`/activity`).

### 7.3 Cards & Panels

- **Container:** `bg-white border border-gray-200 rounded-xl` (or `bg-gray-50 border border-gray-200 rounded-xl` for grouped inset sections).
- **Interactive Card Hover:** `transition-colors duration-100 hover:border-gray-300 hover:bg-gray-50/50`.
- **Panel Header:** `flex items-center justify-between gap-4 px-5 py-3.5 border-b border-gray-200`.

### 7.4 Inputs & Amount Controls

- **Standard Input:** `h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500`
- **Amount Input (DeFi numeric):** Right-aligned `font-mono tabular-nums`, inline token selector/chip on the left or right, `MAX` ghost micro-button inside field, atomic precision warning if decimals exceed token decimals.
- **Error State:** `border-red-500 focus-visible:outline-red-500` + `text-xs text-red-600 mt-1`.

### 7.5 Tables (Portfolio, Markets, Activity)

- **Wrapper:** `overflow-x-auto rounded-xl border border-gray-200 bg-white`.
- **Header Row (`thead`):** `bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500`.
- **Body Rows:** `border-b border-gray-100 last:border-b-0 hover:bg-gray-900/4 transition-colors duration-100`.
- **Numeric Columns:** Always `text-right font-mono tabular-nums text-gray-900`.

### 7.6 Modals, Popovers & Tooltips

- **Modal:** `rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_12px_36px_rgba(17,24,39,0.12)]` with `Esc` close, focus trap, and `size-9 rounded-lg` ghost close icon (`<X />`).
- **Tooltip / Popover:** `rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-[0_4px_16px_rgba(17,24,39,0.08)]`.

### 7.7 Status Chips, Badges & Execution Lifecycle

- **Compact Chip:** `inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700`.
- **1Click Settlement States (exact PRD / Glossary states, never hidden or remapped):**
  - `PENDING_DEPOSIT` / `KNOWN_DEPOSIT_TX`: Yellow/amber dot (`bg-amber-500 animate-pulse`) + text
  - `PROCESSING`: Subtle `14px` spinner + `blue-500` label
  - `SUCCESS`: `bg-green-500` dot + `text-green-700`
  - `REFUNDED`: `bg-blue-500` dot + `text-blue-700`
  - `INCOMPLETE_DEPOSIT` / `FAILED`: `bg-red-500` dot + `text-red-600`

### 7.8 Loading States (`data-loading`)

- Interactive controls while submitting/fetching receive `data-loading="true"` (`data-loading:pointer-events-none` disables double clicks without jarring layout shift) + inline spinner.
- Data panels and tables use **Skeleton placeholders** (`bg-gray-100 animate-pulse rounded-lg`) matching exact row/card heights.

---

## 8. Data Visualization (White Mode Palette)

| Series | Hex | Usage |
|---|---|---|
| Series 1 | `#22C55E` (`green-500`) | Lending / Primary yield / Positive P&L |
| Series 2 | `#0091FD` (`blue-500`) | Stablecoin LP / Base / Info |
| Series 3 | `#F59E0B` (`amber-500`) | Yield Vaults / Warnings |
| Series 4 | `#6366F1` (`indigo-500`) | Arbitrum / Secondary series |
| Series 5 | `#9CA3AF` (`gray-400`) | Available / Undeployed cash |
| Series 6 | `#EF4444` (`red-500`) | Arbitrage / Negative P&L |

**Chart Rules:**
- Transparent background sitting inside a white `rounded-xl` card.
- Gridlines: `1px` dashed `#E5E7EB` (`gray-200`).
- Axis labels: `12px` `Onest` or `JetBrains Mono` in `gray-500`.
- Allocation bars: `rounded-md` segments with `2px` white gap between categories, matching [`src/app/page.tsx`](src/app/page.tsx).

---

## 9. Motion & Micro-interactions Only

Strictly micro-interactions only (per `strp-design-sys.md` and project direction — **no bloated page transitions or scroll-jacking**):

| Interaction | CSS / Utility Spec |
|---|---|
| **Duration** | `100ms` (`duration-100`) |
| **Easing** | `cubic-bezier(0.4, 0, 0.2, 1)` (`ease-in-out`) |
| **Animated Properties** | `transform`, `translate`, `scale`, `rotate`, `background-color`, `border-color` |
| **Button Tactile Press** | `active:not-disabled:scale-[0.97]` |
| **Row / Nav Hover** | `hover:bg-gray-900/4` (`100ms`) |
| **Disclosure / Accordion Chevron** | `rotate-180` (`duration-100`) |
| **Loading Pulse** | Standard skeleton pulse (`1.5s`) and pending dot pulse |
| **Reduced Motion** | `@media (prefers-reduced-motion: reduce)` disables scale/transform animations while keeping instant state feedback |

---

## 10. Responsive Strategy (Desktop-First)

We design and verify on **Desktop (`>= 1280px` / `xl`)** first, then scale cleanly down to tablet and mobile:

| Breakpoint | Layout Adaptation |
|---|---|
| **`xl` (`>= 1280px`) — Primary** | Fixed `232px` left sidebar + `64px` sticky header + `1200px` centered `#dashboard` workspace, 4-col KPI strip, 12-col split grids |
| **`lg` (`1024px–1279px`)** | Sidebar remains visible (`216px`), 4-col KPI strip, compact padding (`px-6`) |
| **`md` (`768px–1023px`, Tablet)** | Sidebar collapses to horizontal top tabs inside header; 2-col KPI strip; 1-col stacked panels; tables scroll horizontally with sticky asset column |
| **`< 768px` (Mobile)** | Compact sticky top bar (`56px`) + horizontally scrollable tab strip; `44×44px` minimum touch targets on mobile; full-width primary CTAs; bottom-sheet dialogs |

---

## 11. Accessibility

1. **WCAG 2.1 AA Contrast:** `#111827` on `#FFFFFF` = `17.4:1`; `#4B5563` on `#FFFFFF` = `7.5:1`; `#15803D` on `#FFFFFF` = `5.1:1`. Avoid putting white text on `#22C55E` (`green-500`) — always use **`text-black`** on green fills (matching `selection:bg-green-500 selection:text-black`).
2. **Focus Rings:** `outline-offset-2 focus-visible:outline-2` on all interactive controls (`-outline-offset-2` inside sidebar links).
3. **Keyboard & Screen Readers:** Full Tab order, `Esc` to close modals/popovers, `aria-label` on every icon-only button, `aria-current="page"` on active nav, `aria-live="polite"` on quote status and toast updates.
4. **Zoom & Touch:** All spacing/type in `rem`; clean layout up to `200%` zoom.

---

## 12. Special DeFi & Capita Patterns

1. **Data Mode Banner (Non-negotiable PRD Rule 3):**
   - When `dataMode === "sample"`: full-width `rounded-xl` banner with `border-amber-300 bg-amber-50` and `text-amber-900` stating data is from a labelled local fixture. Never dismissible into hiding live vs sample status.
   - When `dataMode === "dry_run"`: `border-blue-200 bg-blue-50` banner stating live reads + `dry: true` quotes are active and no funds move.
2. **Confidential / Privacy Toggle (`confidential-mode` inspired):**
   - Optional header icon button (`<Eye />` / `<EyeOff />`) to mask USD balances (`•••••`) during screen-sharing or public use without altering underlying logic.
3. **Quote Freshness & Non-Atomicity Callout:**
   - Every executable action panel displays a countdown/expiry (`deadline`), exact `originAsset` -> `destinationAsset` `(chainId, contractAddress)` identity, `depositAddress`, `refundTo`, and explicit multi-step leg indicator when an action spans >1 transaction (e.g., 1Click swap + Aave supply).
4. **AI Proposal vs Deterministic Guardrail Card:**
   - Clearly split **"AI Proposed Allocation"** (rationale, ranked opportunities) from **"Deterministic Policy Engine Verdict"** (pass/fail checklist: liquidity floor, protocol cap, slippage cap, gas check) with `<ShieldCheck />` (green) or `<ShieldAlert />` (red).
5. **Opportunity Card Pattern:**
   - `rounded-xl border border-gray-200 bg-white p-5`
   - Top row: Strategy category eyebrow + Chain badge + Protocol name
   - Middle: 3-column `font-mono tabular-nums` metrics (Net Est. APY / Net Profit, TVL / Liquidity, Asset)
   - Footer: `Source · Observed timestamp` on left + concise `[Review Quote ->]` action button on right.

---

## 13. Token Summary (Tailwind v4 `@theme` for `src/app/globals.css`)

```css
@import "tailwindcss";

@theme {
  /* White Mode Canvas & Surfaces */
  --color-canvas: #ffffff;
  --color-surface: #f9fafb;
  --color-surface-raised: #f3f4f6;

  /* Lines & Borders */
  --color-line: #e5e7eb;
  --color-line-strong: #d1d5db;
  --color-line-faint: #f3f4f6;

  /* Ink */
  --color-ink: #111827;
  --color-ink-muted: #4b5563;
  --color-ink-faint: #6b7280;

  /* Brand & Semantic Accents (near.com/home platform tokens) */
  --color-accent: #22c55e;       /* green-500 */
  --color-accent-ink: #000000;
  --color-highlight: #fef08a;    /* yellow-200 */
  --color-highlight-ink: #a16207;/* yellow-700 */
  --color-warn: #f59e0b;         /* amber-500 */
  --color-danger: #ef4444;       /* red-500 */
  --color-info: #0091fd;         /* near blue */

  /* Typography */
  --font-sans: var(--font-figtree), ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* Platform Radii */
  --radius-control: 8px;   /* rounded-lg */
  --radius-panel: 12px;    /* rounded-xl */
  --radius-modal: 16px;    /* rounded-2xl */
}
```

---

## 14. File Structure

```txt
DESIGN.md                           ← This canonical design spec (repo root)
src/
├── app/
│   ├── globals.css                 ← White Mode @theme tokens, base isolate, micro-interaction helpers
│   ├── layout.tsx                  ← Onest + JetBrains Mono loading, html selection/light classes
│   ├── page.tsx                    ← Overview (#dashboard)
│   ├── opportunities/page.tsx      ← Opportunity Explorer
│   ├── strategy/page.tsx           ← AI Strategy Builder + Policy Guardrail Check
│   ├── execute/page.tsx            ← Execution Center (1Click + Protocol leg tracking)
│   ├── positions/page.tsx          ← Active Positions
│   └── activity/page.tsx           ← Audit Log & Transactions
├── components/
│   ├── ui/
│   │   ├── primitives.tsx          ← Panel (rounded-xl), PanelHeader, Metric, StatusDot, EmptyState
│   │   ├── button.tsx              ← Button & IconButton (size-9 rounded-lg, scale-[0.97], data-loading)
│   │   ├── badge.tsx               ← ChainBadge, DataModeBanner, SettlementChip
│   │   ├── table.tsx               ← Tabular numeric tables
│   │   ├── input.tsx               ← AmountInput, GuardrailInput
│   │   ├── modal.tsx               ← Accessible Dialog (rounded-2xl)
│   │   └── tooltip.tsx             ← Hover/focus tooltips for icon-only actions
│   ├── shell/
│   │   └── app-shell.tsx           ← Capita sidebar (h-11 rounded-xl nav), sticky header, disclaimer footer
│   ├── wallet/
│   │   └── wallet-connect.tsx      ← Concise icon-first Wallet trigger + account popover
│   ├── strategy/
│   └── execution/
```

---

## 15. Implementation Checklist

- [ ] Install `lucide-react` (`npm.cmd install lucide-react`) for concise icon-first UI
- [x] Configure `Onest` and `JetBrains_Mono` via `next/font/google` in `src/app/layout.tsx`
- [ ] Update `<html>` (`antialiased selection:bg-green-500 selection:text-black light`) and `<body>` (`relative isolate bg-white text-gray-900`)
- [ ] Migrate `src/app/globals.css` from legacy dark tokens to the White Mode `@theme` tokens in §13
- [ ] Update `src/components/shell/app-shell.tsx` with **Capita** wordmark, `h-11 rounded-xl px-2.5 gap-3` nav items, `hover:bg-gray-900/4`, and concise icon-only header actions (`size-9 rounded-lg`)
- [ ] Standardize buttons (`duration-100`, `active:not-disabled:scale-[0.97]`, `disabled:opacity-40`, `data-loading:pointer-events-none`, yellow-200/50 highlight variant)
- [ ] Update `src/components/ui/primitives.tsx` (`rounded-xl` panels, crisp `border-gray-200`, `tabular-nums` metrics, white-mode status dots)
- [ ] Convert Wallet button and utility triggers to concise Lucide icons with `aria-label` + tooltips
- [ ] Ensure every page (`Overview`, `Opportunities`, `Strategy`, `Execute`, `Positions`, `Activity`, `Sign In`) renders cleanly in White Mode with zero dark-mode leftovers
- [ ] Verify desktop (`1280px+`) layout first, then tablet (`md`/`lg`) and mobile (`sm`), and confirm `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build` stay green
