# Agent skills inventory

Project-scoped skills live in `.agents/skills/` and are installed with the
[Skills CLI](https://www.skills.sh/docs/cli). Installed 2026-11-10 with
`npx skills@latest add ...`; scope is **project**, so a fresh clone gets them with the repo.

Skills are third-party instructions that run with full agent permissions. Each one below was
checked for relevance before install; none of them ask for credentials or run opaque scripts
against this repo.

## Installed

### NEAR ecosystem — `near/agent-skills`

| Skill | Capability | Why it is here | Where it is used |
| --- | --- | --- | --- |
| `near-intents` | Authoritative 1Click integration rules: `/v0/tokens`, `/v0/quote` (`dry` vs committed), `/v0/deposit/submit`, `/v0/status`, per-chain deposit recipes, Earn, fees, swap types. | This is the single most important integration in the product, and it is maintained by the protocol team. It already caught one real detail: committed quotes are valid ~10 minutes and `dry` quotes never contain a deposit address. | `src/lib/near/*`, the execution lifecycle |
| `near-ai-cloud` | NEAR AI Cloud OpenAI-compatible inference, TEE attestation (NVIDIA NRAS / Intel TDX), message-signature verification, E2E encrypted chat, specialised endpoints. | We use NEAR AI Cloud for the strategy orchestrator. This keeps model/gateway claims honest and tells us what verification is actually possible. | `src/lib/ai/*` |

### Engineering workflow — `mattpocock/skills`

| Skill | Capability | Why it is here |
| --- | --- | --- |
| `setup-matt-pocock-skills` | One-time repo configuration: issue tracker, triage labels, domain-doc layout. | Run once; produced `docs/agents/*`. |
| `ask-matt` | Router over the skill collection. | Picks the right workflow without me guessing. |
| `codebase-design` | Deep-module vocabulary: seams, interface depth, testability. | Keeps `finance/`, `policy/`, `near/` as narrow interfaces over real logic instead of leaking Prisma and HTTP everywhere. |
| `implement-spec` | Implements a spec/ticket set in code. | The build loop for each MVP slice. |
| `code-review` | Dual-axis review (repo standards + originating spec) since a fixed point. | Run before each merge to `main`; the "does it match the spec" axis is exactly the anti-over-claiming check this project needs. |
| `diagnosing-bugs` | Reproduce → minimise → hypothesise → instrument → fix → regression-test. | Execution-state bugs (quote expiry, refunds) are hard to reason about from logs alone. |
| `domain-modeling` | Builds `GLOSSARY.md` and ADRs from resolved decisions. | Financial terminology must mean one thing everywhere (`available` vs `deployed`, `APY` vs `APR`). |
| `writing-for-agents` | How to write skills and `AGENTS.md`/`CLAUDE.md`. | Applied to this repo's `AGENTS.md`. |
| `setup-pre-commit` | Husky + lint-staged + typecheck + tests. | Deferred until the schema and lint config settle. |

### Discovery — `vercel-labs/skills`

| Skill | Capability | Why it is here |
| --- | --- | --- |
| `find-skills` | Searches and evaluates the skills.sh ecosystem. | So capability gaps can be filled deliberately instead of by installing everything. |

### Already available globally (not duplicated into the repo)

`tdd`, `grill-with-docs`, `improve-codebase-architecture`, `triage`, `to-prd`, `to-issues`,
`prototype`, `diagnose`, `handoff`, `write-a-skill`, plus the OpenCode built-ins listed in the
harness (`animate`, `baseline-ui`, `better-typography`, `browser`, `solana-dev`, etc.).

Relevant ones in practice: `tdd` for the finance/policy engine, `grill-with-docs` before locking
the strategy proposal schema, `to-issues` when the MVP slices are cut.

## Investigated and rejected

| Candidate | Source | Why not |
| --- | --- | --- |
| `near-dapp`, `near-kit`, `near-api-js`, `near-cli-rs` | `near/agent-skills` | We do not build a NEAR-chain app. 1Click is the NEAR surface; adding NEAR wallet/account code would grow scope with no user-visible benefit. |
| `near-smart-contracts`, `near-contract-audit` | `near/agent-skills` | No Rust toolchain and no custom contract in scope (see ADR-0002). |
| `swarms` / multi-agent orchestration skills | ecosystem | One orchestrator with typed tools is the correct shape here; a swarm adds latency, cost and non-determinism without a measurable benefit. |
| Generic "blockchain expert" / "DeFi expert" skills | ecosystem | Low signal compared to the official 1Click docs and skills, which I read directly and verified against live responses. |
| `implement`, `pr`, `retro`, `research`, `prototype` (mattpocock) | `mattpocock/skills` | Overlap with already-installed equivalents (`implement-spec`, `to-prd`, `diagnose`). Installing both invites contradictory process instructions. |

## Known limits

- `skills@latest add` has been interrupted twice mid-run by a server restart and left an empty
  skill directory. If a skill folder has zero files, delete it and reinstall that skill only.
- These skills describe upstream APIs. Observed behaviour wins: 1Click's documented 25 bps
  unauthenticated surcharge did not match the ~2.5 bps measured on Base→Arbitrum USDC.
- Skills never override `project-docs/prd.md` or the rules in `AGENTS.md`.
