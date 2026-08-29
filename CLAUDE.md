@AGENTS.md

# Shoelaxe Dashboard

Backend for a sneaker-resale price-management system. Cost signals arrive from StockX emails and a
Google Sheet via a Google Apps Script; this app decides pricing, holds out-of-threshold changes for
human approval, and (later) publishes to Shopify.

- **Start here** — `docs/CONTEXT.md`: current state of the tree, repo map, the contract
  architecture, and the traps that have already cost time once.
- **What to build** — `docs/PROMPT.md` is the authoritative brief. `docs/design-screens.md` is the
  text of every screen in the .pen design.
- **How it is being built** — the approved implementation plan, milestones M0–M13.
- **Sibling repo** — `../Shoelaxe/` holds `apps-script/` and `supabase/migrations/`. Migrations and
  Apps Script changes go there, not here. This repo commits the generated types.

## Rules that are not negotiable

- **`lib/domain/**` is pure.** No I/O, no `postgres`, no `lib/db`, no `lib/repo`, no `node:*`. All
  pricing and approval logic lives there so it is unit-testable in milliseconds. Enforced by eslint.
- **Never `await fetch()` inside `sql.begin()`.** Publishing and any other network call is enqueued,
  never inline. A transaction held across a network hop is how this design falls over.
- **`DATABASE_URL` points at the Supavisor pooler in session mode**, never `db.<ref>.supabase.co` —
  that host is IPv6-only and DigitalOcean App Platform cannot reach it.
- **`lib/env.ts` validates lazily** via a memoized `getEnv()`. A module-scope parse breaks
  `next build` inside Docker, where runtime-scoped secrets are absent.
- **`supabase-js` is for auth and Storage only.** All data access goes through `postgres.js`.
- Money is handled as integer cents inside the domain; `numeric` comes back from postgres.js as a
  string and stays a string until the domain boundary.
- Store UTC, display `Asia/Hong_Kong`. Currency is HKD only for now, though the schema is
  per-currency.

## Conventions

- pnpm. `pnpm test` (unit, fast) and `pnpm test:int` (integration, needs local Supabase via Docker).
- API responses are `{data, meta?}` or `{error: {code, message, details?, request_id}}`, with one
  canonical HTTP status per error code.
- Every mutation writes an `audit_log` row.
