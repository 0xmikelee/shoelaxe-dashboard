# Shoelaxe Dashboard — working context

Everything a new contributor (human or AI) needs before touching this repo. Written 2026-08-25
against the tree as it actually is, with the numbers re-measured rather than recalled.

Read this first, then the one document for the area you are working in:

| You are doing | Read |
|---|---|
| Backend / schema / ingest | [docs/PROMPT.md](PROMPT.md) — the authoritative brief |
| Any migration | [docs/SCHEMA-007-012.md](SCHEMA-007-012.md) — frozen DDL, ordering rationale |
| A screen | [docs/FRONTEND-SCREENS.md](FRONTEND-SCREENS.md) — per-screen endpoints, fields, states |
| Anything visual | [docs/DESIGN-TOKENS.md](DESIGN-TOKENS.md) — colour, type, radius, extracted from the .pen file |
| "the API doesn't give me X" | [docs/API-GAPS.md](API-GAPS.md) — 38 numbered gaps; it probably already says |
| Frontend intent | [docs/FRONTEND-PROMPT.md](FRONTEND-PROMPT.md) |
| Verbatim screen copy | [docs/design-screens.md](design-screens.md) |

---

## 1. What this is

Shoelaxe resells sneakers. Cost signals arrive hourly from **StockX emails** and from a **Google
Sheet**, both parsed by a Google Apps Script. Today that script calls a 476-line Supabase RPC that
does ingestion, pricing and stock in one transaction — which means the script holds a service-role
key, margins are edited in a spreadsheet, and **there is no approval step**: a bad crawl silently
reprices the whole catalogue.

This project inverts that. The Next.js app becomes the processor and the only writer of margins,
approvals and publishing state. The Apps Script keeps no database credentials and only POSTs batches
to `/api/ingest`. **Price changes outside a ±threshold are held for a human**, which is the entire
point of the product — Screen 1 (價格監控與審批) is the thing being built.

Later, approved prices publish to Shopify. The worker drain is still deferred behind
`PUBLISH_TARGET=none`, but the test store `shoelaxe-test.myshopify.com` is the enablement target:
`lib/shopify` talks Admin GraphQL 2026-07, `pnpm shopify:probe` resolves currency (F2) and location
(F1), and `pnpm shopify:ping` upserts a canary product. Production `shoelaxe.myshopify.com` is a
later cutover.

There is **no static Admin API token**. `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET` are the app's client
credentials, and `lib/shopify/auth.ts` exchanges them at `/admin/oauth/access_token` for a token that
lives 24 hours (`expires_in` 86399), cached in memory and re-minted a minute before expiry. Granted
scopes are a readback of the app version approved on the store, not something the token request asks
for: a missing scope means releasing a new version, not editing an env var.

Three internal users. Traditional Chinese UI (`zh-Hant-HK`), HKD only, times stored UTC and
displayed `Asia/Hong_Kong`.

### Two repos

- **this repo** — the Next.js app: API, domain logic, dashboard UI. Commits the generated DB types.
- **`../Shoelaxe/`** — `apps-script/` and `supabase/migrations/`. **Migrations and Apps Script
  changes go there, not here.**

---

## 2. Where the project actually stands

Verified by running the suite, not from memory:

```
pnpm typecheck   ✓ clean
pnpm test        ✓ 764 tests / 36 files   (~1.6s)
pnpm test:components ✓ 13 tests / 4 files
docs/openapi.json  34 paths, 42 operations, 42 marked x-provisional
```

**Built:**

- The whole **contract layer** — zod wire/param schemas, provisional route docs, generated
  `docs/openapi.json` and `lib/api/schema.d.ts`, the typed client, the query-key factory.
- **`lib/domain/**`** — 11 files, the §5 pricing and approval decision core, 100% branch coverage.
- **A complete MSW mock API** — seeded in-memory dataset, all 42 operations, a ticking job runner.
- **Design system** — tokens in `app/globals.css`, ~23 shadcn primitives, formatters, the full
  zh-Hant dictionary (637 lines, including all 34 error codes).
- **Five screens, read-only**: `/approvals`, `/products`, `/groups`, `/settings`, `/users`, plus a
  dev-only `/tokens` page. All render real data from the mocks and are covered by component tests.

**Not built:**

- **No backend at all.** There is no `app/api/` directory. `lib/db`, `lib/repo`, `lib/services`,
  `lib/auth` and `worker/` do not exist. Every endpoint the frontend calls is a mock.
- No auth. `app/(dash)/layout.tsx` renders for anyone; the allow-list gate is a comment.
- No writes anywhere. Action controls ship visible-and-disabled with a tooltip reason.
- Screen 8 (product detail) and the four modal screens (4, 5, 6, 9, 10) are not built.
  `components/modal-shell.tsx` and `components/publishing-banner.tsx` exist and are tested but are
  not yet wired to anything.
- No migrations applied. `007`–`012` are frozen as DDL in `docs/SCHEMA-007-012.md`, unwritten.

**Git state:** the repo has exactly one commit, `Initial commit from Create Next App`. *Everything
described above is uncommitted.* `git status` shows ~15 untracked directories. Commit early.

**Blocked:** backend M1/M3 need a DigitalOcean account (`doctl` not installed) and Docker Desktop
(daemon not running) for the local Supabase test database.

---

## 3. Repository map

```
app/
  (dash)/            the authenticated shell — layout + 5 screens
    layout.tsx       AppShell + Topbar. Allow-list gate belongs HERE, not in proxy.ts
    approvals/       Screen 1 — the product. page.tsx (server) + *-client.tsx (client)
    products/  groups/  settings/  users/
  (dev)/tokens/      every colour pair, type size, radius and font. Dev-only, dev-verifiable
  providers.tsx      QueryClient + ThemeProvider + TooltipProvider + MswGate + Toaster
  globals.css        the design tokens. Read section 6 before editing
components/
  ui/                shadcn primitives — regenerate with the CLI, edit sparingly
  format/            Money Percent Delta Num SizeLabel Timestamp — every number renders through these
  app-shell nav-rail nav-item topbar metric-card status-badge
  empty-state error-state modal-shell publishing-banner msw-gate
  approvals/ products/ data-table/
hooks/               use-approvals use-products use-groups — one useQuery wrapper per list screen
lib/
  domain/            PURE. §5 pricing + approval. eslint-enforced, 100% covered           ← see §5
  schemas/wire/      response schemas — the source of truth for the API contract          ← see §4
  schemas/params/    query/path/body schemas
  api/
    contract/        provisional RouteDocs for endpoints the backend hasn't built         ← see §4
    client.ts        the ONLY place the frontend talks to /api/v1
    keys.ts          query-key factory with normalised filters
    schema.d.ts      GENERATED — do not edit
  openapi/registry.ts  registerRoute / registerProvisional / allRoutes
  http/              errors (34 codes → HTTP status), envelope, handler, wire
  i18n/              zh-Hant.ts + enums/status/errors dictionaries
  format/            pure formatting functions (the components/format/* wrap these)
  env.ts             lazy memoized getEnv(), `import "server-only"`
  publishing/        pure desired-state mapper: listing → Shopify productSet input
  shopify/           Admin GraphQL 2026-07 client. Scripts import admin.ts, not client.ts
mocks/               the MSW API: db, seed, handlers/, fixtures/, job-runner, effects
tests/
  unit/              node, *.test.ts — 764 tests
  components/        jsdom, *.test.tsx
  integration/       does not exist yet; needs Docker + local Supabase
scripts/
  build-openapi.ts   routes + provisional contracts → docs/openapi.json
  token-report.ts    Claude Code transcripts → docs/COST.md
  shopify-probe.ts   F1/F2 enablement against shoelaxe-test.myshopify.com
  shopify-ping.ts    canary product/price/inventory round-trip
```

---

## 4. The contract bootstrap — read this before adding any endpoint

This is the load-bearing architectural idea. Get it wrong and the backend handoff becomes a
line-by-line reconciliation by eye.

**Zod schemas are the single source of truth. `docs/openapi.json` is always generated, never
hand-edited.**

```
lib/schemas/wire/**        ─┐
lib/schemas/params/**      ─┤
lib/api/contract/**        ─┴→ scripts/build-openapi.ts → docs/openapi.json → lib/api/schema.d.ts
   (provisional RouteDocs)                                                       (openapi-typescript)
                                                                                      ↓
                                                        lib/api/client.ts + mocks/handlers/** typed from it
```

`scripts/build-openapi.ts` does not read route files for their *handlers* — it imports them for the
side effect of `registerRoute(doc)`, then serialises `allRoutes()`. A `RouteDoc` carries its zod
schemas as plain data, so **the generator has no dependency on a route existing**. That is what lets
`lib/api/contract/**` register a contract for an endpoint nobody has written yet.

### When you land a real backend route

1. Write the route, calling `registerRoute()` with a `response` that is the **imported** wire schema
   — never an inline `z.object({…})`.
2. **Delete the matching entry from `lib/api/contract/**` in the same commit.**
3. `pnpm contract` (regenerates the spec and the types), commit both.

Three tests make this mechanical rather than a convention you have to remember:

- **`contract.provisional.test.ts`** — no `method path` may be both implemented and provisional. It
  fails until you do step 2.
- **`contract.identity.test.ts`** — every implemented route's `response` must be
  *reference*-identical to a member of `WIRE_SCHEMAS` in `lib/schemas/wire/index.ts`. An inline
  schema fails the suite. **Deleting this test should be a review trigger** — it is the mechanism
  the whole design rests on.
- **`mocks.contract.test.ts`** — every committed fixture *and* every live handler response parses
  through its wire schema under deep-strict rules. Strictness is the point: the wire schemas strip
  unknown keys, so a mock that invents a field parses cleanly, renders in the UI, and then vanishes
  the day the real backend answers.

**Done** for the bootstrap is: `lib/api/contract/**` empty, zero `x-provisional` operations in the
spec, mocks off.

### Constraints on schemas

- Must be **JSON-native**. `build-openapi.ts` runs `z.toJSONSchema` with
  `unrepresentable: "throw"`, so a `z.date()` fails the build rather than lying in the spec.
- Query schemas are converted with `io: "input"`. A field-level transform is fine; wrapping a whole
  object in one emits **no parameters at all**.
- Multi-value filters travel **comma-joined**, because `lib/http/handler.ts` parses the query as a
  flat string map and repeated keys collapse. Use `csv()` / `joinCsv()` from
  `lib/schemas/params/common.ts`; the client is configured with `explode: false` to match.

---

## 5. The rules that are not negotiable

These are in `CLAUDE.md` and repeated here because each one has a specific failure behind it.

1. **`lib/domain/**` is pure.** No I/O, no `postgres`, no `lib/db`, no `lib/repo`, no `node:*`, no
   `react`. Enforced by an eslint `no-restricted-imports` block in `eslint.config.mjs`. This is why
   the §5 decision-table suite runs in milliseconds — *and* why the domain is importable into a
   client component, so `/settings` renders the price preview using the same `computeSellingPrice()`
   the server will decide with instead of a second JavaScript re-implementation that drifts.

2. **Never `await fetch()` inside `sql.begin()`.** Publishing and every other network call is
   enqueued, never inline. A transaction held across a network hop is how this design falls over.

3. **`DATABASE_URL` points at the Supavisor pooler in session mode.** Never
   `db.<ref>.supabase.co` — verified with `dig` to have an AAAA record only, and DigitalOcean App
   Platform cannot reach IPv6 hosts. The failure is an `ECONNREFUSED` that does not name its cause.
   Session mode also matters because `pg_try_advisory_lock` is session-scoped and silently broken
   under transaction pooling.

4. **`lib/env.ts` validates lazily** through a memoized `getEnv()`. A module-scope parse breaks
   `next build` inside Docker, where runtime-scoped secrets are absent — and the tempting fix bakes
   the database password into an image layer.

5. **`supabase-js` is for auth and Storage only.** All data access goes through `postgres.js`.

6. **Money is integer cents inside the domain.** `numeric` comes back from postgres.js as a *string*
   and stays a string until the domain boundary. Use `toCents()` / `fromCents()`.

7. **Every mutation writes an `audit_log` row.**

8. API responses are `{data, meta?}` or `{error: {code, message, details?, request_id}}`, with
   exactly one canonical HTTP status per error code (`lib/http/errors.ts`).

---

## 6. Frontend conventions

### Tokens and styling

- **The design's hex values are kept verbatim** — deliberately not converted to oklch. The
  conversion is lossy and unreviewable and buys gamut headroom a dense internal tool never spends.
- **The nav rail is dark in both themes by construction.** `--nav*` is declared only in `:root` and
  deliberately absent from `.dark`. Do **not** adopt shadcn's `Sidebar` — its theme-following
  `--sidebar-*` tokens are the reliable way to end up with a rail that turns light in light mode.
  `tests/components/nav-rail.test.tsx` asserts this.
- **Radius is remapped, not renamed**: Tailwind's own `--radius-sm/md/lg/xl` point at 4/6/8/12px, so
  shadcn's existing `rounded-md` already lands on the design. Don't introduce `--radius-badge`.
- **Nine named type sizes**, not a t-shirt ramp: `text-micro badge meta label body cell num title
  section`. If you add one to `globals.css`, **you must also add it to `TEXT_SIZES` in
  `lib/utils.ts`** — see the trap in §8.
- **Every number is mono.** The `num` utility (`@utility num` in `globals.css`) sets
  `font-mono` + `tabular-nums`, and `Money`, `Percent`, `Delta`, `SizeLabel`, `Timestamp` all render
  through it so the rule can't be forgotten one component at a time.
- **The CJK fallback is not optional.** Inter carries no CJK glyphs; `--font-sans` includes
  `"PingFang TC", "Noto Sans TC", "Microsoft JhengHei"` or every Chinese label falls to an arbitrary
  system font with different metrics.
- Theme is `attribute="class"`, `defaultTheme="light"`, **`enableSystem={false}`** — the dark palette
  has never been reviewed on a real screen.

### Data fetching

- **One client**: `lib/api/client.ts`. Every failure arrives as an `ApiRequestError` carrying a real
  `ErrorCode`; no caller ever sees a `Response`. Every request carries an `x-request-id`.
- **Query keys come from the factory** (`lib/api/keys.ts`), which normalises filters so `{}` and
  `{page: 1, per_page: 20}` are one cache entry. `qk.approvals.stats()` **takes no argument** — Gap 8
  says the metric cards must not follow the table filters, encoded as a key that cannot accept one.
- **Never call `invalidateQueries()` with no key.** Each namespace exposes a `root`.
- **Retries are limited** to `internal_error`, `service_unavailable` and network errors. A 409 or 422
  is the server's *decision*, not a failure — retrying re-asks a question already answered, and in
  the approval queue it re-asks it about a row someone else just acted on.
- Parse every response through its wire schema at the hook boundary. `meta` is not typed by the
  generator — validate it with `parseMeta(SomeMetaWire, result)` rather than casting.

### Copy

All user-visible text lives in `lib/i18n/zh-Hant.ts`. Never inline a Chinese string in a component —
`tests/unit/i18n.dictionary.test.ts` and the publishing-sweep test both iterate the dictionary, and
a hardcoded string is invisible to them.

---

## 7. Commands

```bash
pnpm dev                  # NEXT_PUBLIC_API_MOCKS=1 is already in .env.local
pnpm typecheck
pnpm lint
pnpm test                 # unit, node, ~1.6s
pnpm test:components      # jsdom
pnpm test:all
pnpm coverage             # glob-scoped thresholds; 100% on lib/domain
pnpm build

pnpm contract             # docs:openapi && api:types — run after ANY schema change
pnpm docs:openapi
pnpm api:types

pnpm test:int             # needs Docker + local Supabase (not runnable today)
pnpm db:reset             # ../Shoelaxe
pnpm db:types             # regenerates lib/db/types.generated.ts, committed here

pnpm cost                 # regenerates docs/COST.md from Claude Code transcripts
```

### Running it locally

`.env.local` already sets `NEXT_PUBLIC_API_MOCKS=1`. `pnpm dev`, open
[http://localhost:3000](http://localhost:3000) → it redirects to `/approvals` and serves everything
from MSW with a seeded dataset.

- `NEXT_PUBLIC_MOCK_PUBLISHING=1 pnpm dev` walks the publishing-**enabled** half of the UI.
- `MswGate` holds the tree until the service worker is *active*. If registration fails it shows an
  amber banner and falls through — it will not hang.
- **Known environment issue:** service-worker registration fails inside the Claude Code browser
  pane (the script serves fine; `navigator.serviceWorker.register()` throws). Normal Chrome is
  unaffected. Verify screens with `pnpm test:components` when the pane misbehaves.

---

## 8. Traps — each of these cost real time once

**Framework**

- **`middleware.ts` does not exist in Next 16 — the convention is `proxy.ts`**, at the repo root,
  exporting `export function proxy(request: NextRequest)`. It defaults to the Node runtime (so
  `@supabase/ssr` works), and setting `runtime` throws. It does **cookie refresh only**: it cannot
  sign a user out, so the allow-list check belongs in `app/(dash)/layout.tsx` or you get the
  Google-to-blank-page loop.
- **`images.qualities` is mandatory from Next 16.** Already set in `next.config.ts` alongside
  `unoptimized: true` (sharp is deliberately blocked in `pnpm-workspace.yaml`).
- **Intercepted routes do not survive a refresh.** Screen 4 must. Every modal therefore needs three
  files: the standalone page, the `(.)` intercepted page, and a slot `default.tsx`.
- **Relative timestamps hydrate-mismatch on every page** unless `<Timestamp>` renders the absolute
  form server-side and swaps after mount.

**This repo specifically**

- **`cn()` and the type scale.** tailwind-merge files any unrecognised `text-*` under *colour*, so
  `cn("text-body", "text-muted-foreground")` silently drops the size, and
  `<Delta className="text-num">` silently drops the colour. `lib/utils.ts` declares the nine role
  names as a font-size group. **Add a size to `globals.css` without adding it there and it is
  silently dropped again.**
- **MSW must be imported dynamically inside an effect.** `setupWorker()` throws during prerender —
  client components are still rendered on the server — so a static import fails `next build`. And
  `MswGate`'s initial state is `!MOCKS_ENABLED`, not `false`, or you get a hydration mismatch on
  every page.
- **The API client resolves an absolute origin.** A browser resolves a relative URL against
  `location`; the WHATWG `Request` constructor does not, and undici (backing `fetch` under Node and
  jsdom) throws `Failed to parse URL from /api/v1/…`. Leaving it relative works in the app and
  fails in every component test — the worst possible split.
- **shadcn Tooltip throws without `TooltipProvider`** rather than degrading. One at the root, and
  one in any test that renders a screen.
- **`shadcn` is a runtime dependency**, not just a CLI — `globals.css` does `@import
  "shadcn/tailwind.css"`. It must survive `pnpm install --prod`. Pinned exactly.
- **Order matters in `mocks/handlers/index.ts`.** MSW matches in array order and `:sku` swallows a
  literal segment, so `GET /products/export` must be registered before `GET /products/{sku}` or the
  export downloads a product called "export".
- **Sorting with nulls.** `pending_since` is null on resolved rows; sorting them first buries every
  actionable row. `nullsLast` must take the sort order, because `sortRows` flips the sign.
- **`z.iso.datetime()` needs `offset: true`** — Postgres emits `+00:00` and the default rejects it.

**Pinned versions, deliberately**

- **TanStack Table v8.21.3** — v9 shipped weeks ago and its migration guide 404s.
- **dnd-kit legacy trio** (`@dnd-kit/core` 6.3.1 + sortable 10 + modifiers 9) — the maintained
  successor has an open React 19 bug (#2116: `DragDropProvider` destroyed during StrictMode replay,
  and `next dev` runs StrictMode). Confine it to the image gallery and ship keyboard reorder buttons
  as both the accessibility path and the escape hatch.
- **jsdom, not happy-dom** — Radix leans on `hasPointerCapture` / `setPointerCapture` /
  `ResizeObserver` / `scrollIntoView`, and Select and Popover have a history of breaking under
  happy-dom's pointer model.

---

## 9. Domain rules worth knowing before you touch pricing

`lib/domain/` is small and 100% covered; read it directly. The parts that are subtle:

- **Rounding is x49/x99 and must be idempotent**, or repeated no-op ingests drift the price upward
  forever. `rem = 0` *raises* by 49 (1900 → 1949).
- **Rounding runs before the Δ comparison**, so small cost moves land on Δ = 0 — which makes the
  `no_change` early-out load-bearing rather than an optimisation.
- **Band comparison cross-multiplies** rather than dividing, to avoid float boundary error: a row
  can display `+10.0%` and still be held because the true figure was 10.04%. **Always render the
  server-decided status field; never re-derive it from the Δ you just formatted.**
- **`base_cost` is not `max(cost)`** — it is whichever `listing_sources` row was most recently
  written with a non-null cost. `last_synced_at` also moves on quantity-only syncs, which would let
  a StockX quantity ping steal base-cost ownership.
- **Arrival order is not observation order.** Order on `coalesce(observed_at, received_at)`.
- **Margin overrides are all-or-nothing**, and `null` vs `undefined` on `margin_override` are
  different operations — conflating them silently drops "reset to group rule".
- **Five NULL-`approved_price` cases**, plus `approved_price = 0` as an explicit division guard.

`tests/fixtures/decision-table.csv` is one human-readable row per §5 situation, driven through
`decide()` by a table test — diff it against the brief line by line. Branch coverage cannot tell you
the table is *wrong*.

### Two decisions encoded as single constants

- **Gap 1 — `BATCH_BYPASSES_BAND`** (`lib/domain/approval.ts`): a human-initiated batch *is* the
  approval and bypasses the ±band. Reversing it is that one line plus the copy it gates.
- **Gap 4 — `LISTING_TAB_BY_STATUS`** (`lib/domain/types.ts`): where `pending_price` sits in the
  taxonomy. Screen 7's tabs and Screen 1's row labels both derive from it.

---

## 10. Testing

Three vitest projects in `vitest.config.mts`:

| Project | Env | Glob | Notes |
|---|---|---|---|
| `unit` | node | `tests/unit/**/*.test.ts` | 764 tests, whole suite under 2s |
| `components` | jsdom | `tests/components/**/*.test.tsx` | Radix polyfills + MSW in `tests/setup/` |
| `integration` | node | `tests/integration/**/*.test.ts` | single-threaded forks; needs Docker |

- Component tests run MSW with **`onUnhandledRequest: "error"`** — a silently unmocked request is a
  test passing for the wrong reason.
- Coverage thresholds are **glob-scoped**, not one global bar: 100% on `lib/domain` and `lib/draft`,
  95% on `lib/format`, 80–90% on `lib/api` and `lib/table`, layout components excluded. (`lib/draft`
  and `lib/table` do not exist yet — the thresholds are pre-declared so the directories arrive
  already gated.)
  `lib/schemas` is deliberately excluded — importing a schema "covers" it without asserting
  anything, and a green number there would be theatre.
- **Fixtures cover the states that get got wrong**, as named files: null `approved_price`, zero
  approved price, exactly-ten-but-held, superseded, single-source listing, no images, empty history,
  queued job, partial failure, stalled heartbeat. A happy-path fixture tests nothing.

---

## 11. What to build next

**Frontend** (see the plan's Phase 2 for full detail):

- **FE-1** — auth: Screen 0, the OAuth callback, `proxy.ts` cookie refresh, the allow-list gate in
  `(dash)/layout.tsx`. Needs Supabase credentials.
- **FE-3** — Screen 8 (product detail), Screens 3/5/6, and wiring `PublishingBanner` from
  `meta.publishing.enabled`, which must be **read once server-side in the dash layout** and seeded
  into context — reading it per screen means every screen renders sync copy for 200ms first.
- **FE-4** — all writes. Blocked on backend M10.
- **FE-5** — Screen 4 states A–E and `JobProgress`. The draft state is a **reducer over a tri-state
  discriminated union** — `{kind:"untouched"} | {kind:"set", value} | {kind:"cleared"}` — never a
  null/undefined sentinel. The sentinel *is* the bug.

**Backend**: M0 and M2 are done. M1 (deployment skeleton) and M3 (migrations) are blocked on
DigitalOcean and Docker. M4 (domain core) is done. The critical path to a demo is M0 → M1 → M3 → M5
→ M6 → M7, where M7's acceptance is: *a real StockX email lands in Gmail and within the hour
`GET /api/v1/approvals` shows that SKU and size with a pending price, a Δ% outside the band, and
status 超出閾值.*

**Seven asks the frontend has of the backend**, each cheap:

1. `GET /settings` and `GET /settings/allowed-users` moved into M9 (they sit in M10's write half).
2. `GET /jobs/:id` into M9 — it is already specified as a pure read.
3. `GET /jobs` gains `kind`, `scope_key`, `status` filters.
4. `job_already_running` must carry `details.job_id`.
5. Offset pagination — and therefore **delete `invalid_cursor` and `cursor_sort_mismatch` from
   `ERROR_CODES`**. `lib/i18n/errors.ts` is an exhaustive `Record<ErrorCode, …>` and will fail to
   compile until they go, which is the type system enforcing the cleanup.
6. `ORDER BY pending_since DESC NULLS LAST`.
7. Extend the eslint purity glob to `.tsx`.

---

## 12. Open questions for Mike

Flagged rather than silently decided:

1. **A Δ that rounds to zero renders `0.0%` with no sign**, which deviates from the brief's "Δ always
   carries a sign". Which wins?
2. **`total_pages: 0` on an empty list** — currently floored at 1 in the pager. Confirm.
3. **Supabase plan tier** and the exact **pooler hostname** from the dashboard (both `aws-0-` and
   `aws-1-` prefixes resolve; Supabase has been migrating projects between them).
4. **The Shopify store's own currency.** Must be HKD. `pnpm shopify:probe` fails if it is not.
   Repeat on production cutover. The test store `shoelaxe-test.myshopify.com` was switched to HKD
   during enablement.
5. **The app must be installed on each store it publishes to.** The client credentials grant mints
   tokens only for installed apps in the same Dev Dashboard organization; correct credentials against
   an uninstalled store return `app_not_installed`, not an auth error. Blocks `shopify:probe` on
   `shoelaxe-test.myshopify.com` right now, and will need repeating at production cutover.

Defaults taken — flag any you disagree with: sub-HK$100 rounding applies literally (HK$30 → HK$49);
variant SKU is `{product_sku}-{size}`; `PATCH /groups/:id` handles name only, with every margin
change routed through `POST /groups/:id/apply`; thresholds seed at 10/10, treating Screen 2's
"上限 10% / 下限 8%" as mock data.
