# ADR-0002 — No custom NEAR smart contract; 1Click is the NEAR integration

- **Status:** accepted
- **Date:** 2026-11-10

## Context

The PRD lists several NEAR surfaces: Intents / 1Click APIs, the experimental NEAR Intents Agent
API, Chain Signatures, and the option of deploying a contract. The workspace has no Rust toolchain
and no time to build, audit and deploy a contract.

## Decision

Integrate **NEAR Intents 1Click** (`/v0/tokens`, `/v0/quote`, `/v0/deposit/submit`, `/v0/status`,
Earn) plus **NEAR AI Cloud** for inference. Do **not** write a NEAR smart contract, do not use
Chain Signatures, and do not use the Agent API in the MVP.

## Rationale

1Click already provides what the product actually needs from NEAR: cross-chain asset movement with
a real quote → deposit → settlement lifecycle. A contract would add audit risk and deployment
surface without adding a user-visible capability. The hackathon permits this (the 1Click API is
the NEAR ecosystem surface), and claiming "NEAR integration" on the basis of live 1Click usage is
honest and demonstrable.

## Consequences

- The product does not custody funds and holds no keys. Wallets sign; 1Click settles.
- Every NEAR claim in the README/demo must map to a route or endpoint that can actually be hit.
- Anything requiring on-chain programmability (e.g. an on-chain policy vault) is out of scope and
  must not be implied in the UI.
- The experimental Agent API is documented as deliberately out of scope rather than silently
  omitted.
