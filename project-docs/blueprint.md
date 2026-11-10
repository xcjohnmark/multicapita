# NEAR Hackathon 2026: Ecosystem Blueprint & Winning Project Architecture

> **Dev Deadline**: 2026-11-14T23:59:00Z  
> **Prize Pool**: $250,000 (Grand Prize: $55,000 | 1st Place Track: $10,000 across 13 tracks)  
> **Core Theme**: *"Build what's next for AI and money: Create intelligent agents, autonomous payments, and apps that move value across chains with NEAR Intents, NEAR AI Cloud, Chain Signatures, and more."*

---

## 1. Hackathon Scope & Judging Panel Psychology

### The Judges & What They Care About
* **Illia Polosukhin** (NEAR Co-Founder, Transformer Co-Author): Wants to see **User-Owned AI**, autonomous agent economies, and verifiable compute where AI models transact permissionlessly using blockchain rails.
* **Mert Mumtaz** (Helius CEO): Pragmatic, anti-vaporware. Despises pure slide decks and fake mockups. Demands real working code, high developer ergonomics, and verifiable utility.
* **Eddy Lazzarin** (CTO, a16z crypto) & **Avichal Garg** (Electric Capital): Look for architectural elegance, composability, and crypto-native justification (answering *"Why does this need a blockchain?"*).
* **Kain Warwick** (Infinex / Synthetix) & **Haseeb Qureshi** (Dragonfly): Scrutinize capital efficiency, economic incentives, UX abstraction, and token mechanics.
* **Claude Code & Codex (Automated Screeners)**: Evaluate deterministic setup, unambiguous `README.md` steps, working test suites, and clean codebase hygiene before human judges review.

---

## 2. Core NEAR Sponsor Technologies to Integrate

```
+---------------------------------------------------------------------------------+
|                                 USER / CLIENT                                   |
|             Inputs complex intent / goal + budget in USDC / NEAR / SOL          |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                        INTELLIGENCE & ORCHESTRATION                             |
|  - NEAR AI Cloud (Confidential TEE Inference) / Local LLM Orchestrator          |
|  - Subtask Decomposition & Programmatic Verifier Generation                     |
+---------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
+--------------------------------------+ +--------------------------------------+
|          SECURITY & POLICY           | |           DISCOVERY & MARKET         |
|  - NEAR Function Call Keys           | |  - NEAR Agent Market (market.near.ai)|
|  - Strict Gas & Allowance Caps       | |  - Competitive Worker Bidding        |
|  - Zero Master-Key Exposure          | |  - Reputation, SLA, & Price Filters  |
+--------------------------------------+ +--------------------------------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                         ON-CHAIN ESCROW & VERIFICATION                          |
|  - Smart Contract Ledger (createTask / fundSubtask / releaseFunds)              |
|  - Deterministic Verification Engine (numeric bounds, cross-checks, LLM judge)  |
|  - Automatic Slash / Refund on SLA breach or bad output                         |
+---------------------------------------------------------------------------------+
                                       |
                                       v
+---------------------------------------------------------------------------------+
|                        CROSS-CHAIN SETTLEMENT RAILS                             |
|  - NEAR Intents / 1Click API (Solvers fulfill cross-chain payouts)             |
|  - Chain Signatures (MPC signing to external chains: Solana, EVM, Bitcoin)      |
+---------------------------------------------------------------------------------+
```

### Essential Tool Integrations:
1. **NEAR Intents & 1Click API (`docs.near-intents.org`)**:
   * Cross-chain intent execution across 35+ chains with zero MEV.
   * `dry: true` quotes for pre-flight testing and gasless cost estimation.
2. **Function Call Access Keys**:
   * Scoped cryptographic keys permitting the agent to call only specific contract methods with a hard spending cap. Completely prevents prompt-injection fund drains.
3. **NEAR AI Cloud (`cloud.near.ai`)**:
   * Hardware-secured inference inside Intel TDX / NVIDIA TEE enclaves.
4. **Agent Market (`market.near.ai`)**:
   * Discovery and programmatic hiring of specialized autonomous agents.
5. **Ecosystem Partner Contracts**:
   * **Trezu / NEAR Business**: Multisig treasury integration.
   * **Rhea Finance**: DEX & lending liquidity API.

---

## 3. The Gold-Standard Winning Architecture

An elite project that checks every judge's criteria is an **Autonomous Agentic Organization & Cross-Chain Escrow Protocol**:

### Component 1: Task Decomposition & Dispatch
* Receives natural language goals (e.g., *"Comprehensive token due diligence"*, *"Cross-chain arbitrage & risk audit"*, *"Automated vendor procurement"*).
* Generates discrete subtasks with individual budgets and tight deadlines (SLAs).

### Component 2: Programmatic Quality Verification ("Zero-Trust AI")
* Rather than trusting an LLM blindly, it compiles programmatic validation rules for each subtask:
  * `numeric_match`: Verifies values fall within valid ranges (e.g. market cap > 0, inflation between 0-100%).
  * `cross_check`: Compares outputs between independent agents to detect discrepancies.
  * `llm_judge`: Evaluates qualitative criteria and evidence citation.

### Component 3: On-Chain Escrow Ledger
* Locks subtask funds in a NEAR smart contract escrow.
* Funds are only unlocked to the worker agent's address if all verification checks pass.
* If a worker fails, times out, or produces invalid data, funds are automatically refunded.

### Component 4: Cross-Chain Intent Payouts
* Uses the **NEAR Intents / 1Click API** to pay worker agents in their requested native tokens (e.g., USDC on NEAR, SOL on Solana, ETH on Base).

### Component 5: Dual Interface (Developer CLI + Web Visualizer)
* **CLI**: For developers and automated screeners (Codex / Claude Code).
* **Web Dashboard**: An intuitive visual UI showing tasks spawning, verification checks firing in real-time, and on-chain transactions settling.

---

## 4. Multi-Track Submission Strategy

A single submission can target multiple tracks. We should enter every track our architecture touches:

| Track ID | Track Name | How Our Architecture Qualifies |
| :--- | :--- | :--- |
| `business` | **Autonomous Business** | Operates as a self-sustaining AI organization managing procurement, treasury, and automated revenue splits. |
| `agents` | **Agent Economy** | Features agent-to-agent hiring, dynamic bidding, and programmatic compensation over crypto rails. |
| `security` | **AI Security & Defense** | Enforces Function Call Key spending limits and programmatic output verification to prevent fraud and jailbreaks. |
| `defi` | **Unstoppable DeFi** | Executes atomic, non-custodial cross-chain token settlement using NEAR Intents. |
| `swarms` | **AI Swarms** | Coordinates multi-agent swarms with distinct roles working toward a unified deliverable. |

---

## 5. The "Must-Fulfill" Winning Checklist

To guarantee our submission is scored in the top tier by both automated AI screeners and the human jury, our project **MUST** satisfy this checklist:

### A. Technical & Code Quality
- [ ] **Deterministic Setup**: Runs with standard, reproducible commands (`npm install && npm run dev` or `cargo test`).
- [ ] **Working Smart Contract**: Real NEAR contract (Rust or JS) deployed on testnet/mainnet with passing unit and integration tests.
- [ ] **Real Data & Execution**: At least 2-3 real data endpoints or live agent queries (avoiding 100% simulated mock data).
- [ ] **NEAR Intents Integration**: Live or dry-run quote generation and cross-chain settlement logic via the 1Click API.
- [ ] **Security Guardrails**: Explicit use of NEAR Function Call Keys to demonstrate safe agent spending.

### B. Machine & Human Evaluation
- [ ] **Machine-Readable README**:
  - Clear "What is it?" and "Problem it solves".
  - Explicit "NEAR's Concrete Role" section.
  - Step-by-step "Do X -> See Y" instructions that Claude Code and Codex can run without intervention.
  - Architecture diagram (Mermaid).
- [ ] **Public GitHub Repository**: Made public before November 14, 2026, 23:59 UTC with an open-source `LICENSE` (e.g. MIT).
- [ ] **No Secrets in Repo**: All API keys, private keys, and credentials stored strictly in `.env.example` / environment variables.

### C. The Demo Post on X
- [ ] Published publicly on X before the deadline.
- [ ] Tags `@NEARProtocol` and `#NEARHackathon` (and optionally `@NearBuilders`, `@NearLegion`).
- [ ] Attaches a clean 60–90 second screen recording showing a complete real user action to visible on-chain settlement.
- [ ] Links to the public GitHub repository and live deployment.

### D. Flawless Submission API Payload
- [ ] Sent via `POST https://nearhackathon.com/api/applications` or the official form at `https://nearhackathon.com/#apply`.
- [ ] Reuses a single lowercase UUID `requestId`.
- [ ] `tracks` array includes all matched IDs: `["business", "agents", "security", "defi", "swarms"]`.
- [ ] Valid `nearAddress` (mainnet) for prize payout.
- [ ] Strictly omit the honeypot field (`website`).
- [ ] Explicit human review and confirmation of the exact JSON payload before sending.
