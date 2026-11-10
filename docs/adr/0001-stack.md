# ADR-0001 — Next.js full-stack + Prisma 7 + SQLite, one deployable process

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** project owner, technical lead

## Context

Four days to a hackathon submission (deadline 2026-11-14T23:59Z) with a $0 budget and no cloud
accounts. Judges and automated screeners must be able to run the product from a fresh clone.
The PRD suggests PostgreSQL/Supabase and a conventional frontend + API split.

## Decision

One Next.js 16 (App Router, TypeScript, Tailwind v4) application containing both the UI and the
server-side HTTP surface, backed by **SQLite via Prisma 7 with the `better-sqlite3` driver
adapter** and a committed `prisma.config.ts` + initial migration.

Prisma packages are pinned to the stable **7.x** line (`7.10.1`), not `latest`, because Prisma 8
is a release candidate and its SQLite support is experimental.

## Consequences

- A judge runs `npm install && npx prisma migrate dev && npm run dev`. No Docker, no hosted
  database, no paid account, no network dependency for boot.
- Financial state lives in a local file (`prisma/dev.db`), which is gitignored. That makes the app
  unsuitable for a serverless deployment with an ephemeral filesystem; the README says so.
- Every query is written to be portable: no SQLite-only features, no raw SQL beyond a health
  check, no JSON-path queries. Moving to PostgreSQL means changing the datasource provider,
  swapping the adapter, and re-running migrations — not rewriting the data layer.
- SQLite has no enums and no decimal type. Status fields are `String` validated by zod unions;
  token amounts are atomic strings; USD is `Float`. These are documented in
  `prisma/schema.prisma` so the trade-off is visible rather than accidental.

## Alternatives considered

- **Postgres/Supabase:** closer to the PRD and better concurrency, but requires an account or
  Docker, which directly harms reproducibility for screeners.
- **Vite SPA + separate Node API:** cleaner separation, but two processes and two deploy targets
  for a four-day build.
- **Prisma 8 RC:** rejected for experimental SQLite support.
