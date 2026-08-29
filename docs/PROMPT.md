# Shoelaxe Dashboard — Build Brief (backend first)

## Remaining decisions before coding

| # | Item | Where used |
|---|---|---|
| F1 | Shopify inventory **location id** for `shoelaxe-test.myshopify.com` — captured by `pnpm shopify:probe`. Production `shoelaxe.myshopify.com` is a later cutover. | §7 |
| F2 | Shopify **store currency** — must be HKD. `pnpm shopify:probe` fails if the shop is not HKD. `shoelaxe-test.myshopify.com` was switched to HKD during enablement. Repeat this check on production cutover. | §7 |

Everything else about Phase 1 is decided; the two rows above are enablement checks and block nothing before it. Fixed values: thresholds **+10% / −10%** (asymmetric, independently editable), Shopify **test** store **shoelaxe-test.myshopify.com** (production `shoelaxe.myshopify.com` is a later cutover), StockX stock is **always 1 per size**, hosting **DigitalOcean App Platform** (region `sgp`; a `web` service plus a long-lived `worker`), Supabase project in **ap-southeast-1**, currency **HKD everywhere**.

### Design deltas (the .pen file is authoritative EXCEPT for these)
The frontend design lives at `~/Documents/projects/shoelaxe/design/shoelaxe-dashboard.pen`
(https://app.pen.dev/s/obg-2MWJixf2f-U4wn0VaduWdQtKfTOuMQRaEFFEg_I); the text of every
screen is extracted in `docs/design-screens.md`. The following in the design are **not** to
be built:
- "+ 新增價格來源" (add price source) on the product detail — sources are fixed: StockX + in-house.
- "暫停銷售" (paused) listing state — only 未上架 / 已上架 / 已下架 exist.
- Multi-platform sync copy ("3 個平台", "StockX 與店內銷售系統") — the only publish target is Shopify.
- Two orphaned text layers named "低於平台底價" parked at canvas origin (0,0) — leftovers from the removed floor-price badges; delete them. The floor-price failure state itself has been removed from Screen 4 States (state E now lists failed sizes with no reason badges; note its sentence "以下尺寸的未套用變更" lost its clause in the edit and needs a copy fix, e.g. "以下尺寸未套用變更").
- Invitation email on user creation — creating an allowed user just lets them sign in.
- 通知中心 (notification center) and 幫助文檔 (help docs) nav items — out of scope for v1.
- StockX "供應/掛單" ask-count — StockX quantity is a constant 1.
- Screen 1's Δ% column semantics: Δ is computed on **listing price vs approved listing price** (§5), not crawled cost vs previous crawled cost as the current column labels suggest. UI copy will be updated.

---

## 1. Context

Shoelaxe resells sneakers. Cost signals arrive from two sources:

1. **StockX email notifications** ("新的最低报价 / New Lowest Ask", "订单已送达 / Order Delivered"), parsed hourly by a Google Apps Script (`GmailStockX.gs`).
2. **Manual rows in a Google Sheet** (`價格更新` sheet), synced from a menu action in the same script (`SheetUpdater.gs`).

Today the script calls Supabase RPC `record_and_apply_price_update` which does everything in one transaction. **This contract changes** (§3); the dashboard becomes the processor and the only writer of margins, approvals and Shopify state.

### Repos

```
~/Documents/projects/shoelaxe/
├── Shoelaxe/                 git repo — apps-script/, supabase/migrations/001–006
├── shoelaxe-dashboard/       git repo — THIS project (Next 16.3, React 19, Tailwind 4, pnpm)
├── design/                   shoelaxe-dashboard.pen
└── files/                    sample StockX .eml, Shopify products_export*.csv
```

Read `Shoelaxe/apps-script/README.md` first. All new migrations (`007+`) go in `Shoelaxe/supabase/migrations/`; this repo commits `supabase gen types` output. Out of scope: the Gmail search query and the Sheet menu UX.

### Existing DB (Supabase `zvujctyumstkvfxgahai`, ap-northeast-1)

`products` (SKU catalog) · `listings` (variant = product+size+currency, holds cost/margins/current_price) · `stock_levels` · `price_updates` (event log, idempotent on source+source_ref) · `price_history` (append-only) · `sneaker_listings` (compat **view**) · `media.product_images`.

Formula (existing `compute_listing_price`, extended in §5): `price = cost + cost × margin% / 100 + margin_fixed`.

---

## 2. Core domain model (revised — supersedes the current schema's assumptions)

- A **product** is a SKU (color is baked into the SKU code). Product-level data: English name, Chinese name (`name_zh`), brand, Shopify content, images, **group** (every product belongs to exactly one group; a seeded, undeletable **預設分組/default group** catches the rest).
- A **listing** is a variant: product + size. Each size prices independently.
- Each listing has up to two **price sources** (`listing_sources`), fixed set:
  - `stockx` — cost synced from emails, read-only in the UI, quantity constant **1**.
  - `in_house` — cost and quantity from the Google Sheet, editable in the dashboard.
- **One selling price per listing**, shared across sources: `base_cost` = the cost from the **most recently applied price update** for that listing, from either source. Selling price = margin formula over `base_cost`, then rounding (§5).
- **Shopify inventory = in-house quantity only.** StockX's constant 1 never feeds Shopify stock.
- **Margin precedence: per-listing (size) override → group rule → system default.** A size-level override (badge 已覆寫) survives group changes unless a group batch-apply explicitly overwrites it (§6.3). The system default (Screen 2: e.g. 12% + HK$0, toggleable) applies when neither override nor group margins are set; if it is disabled and nothing else is set, the listing is `needs_margins`.
- Listing states: 未上架 (never listed: `pending_new` / `needs_margins` / `rejected`) · 已上架 (`approved`) · 已下架 (`inactive`).

---

## 3. Ingestion rework (breaking change to Apps Script)

### 3.1 Apps Script holds no database credentials
- Remove Supabase key usage and `callSupabaseRpc_*` from `Code.gs`. Replace with `POST {DASHBOARD_URL}/api/ingest`, header `X-Shoelaxe-Key: {INGEST_SECRET}` (both Script Properties). Not behind Google SSO.
- Body: `{ run: {source, trigger: 'cron'|'manual', started_at}, updates: [ {product_name, product_sku, brand, size, cost, quantity?, currency? (default 'HKD'), source: 'stockx'|'google_sheet', source_ref, stockx_internal_id?, image_url?, allow_create} ] }`. Batch size is **negotiated, not hard-coded**: `GET /api/ingest/health` returns `accepts_max_items` and the script reads it at run start, so the number can change server-side without another manual Apps Script redeploy. Server default 25.
- `source: 'stockx'` maps to the `stockx` listing source (quantity forced to 1); `'google_sheet'` maps to `in_house`.
- Response: per-item `{ ok, status, outcome, error?, listing_id? }` in order; `SheetUpdater.gs` writes it to the 狀態 column as today (new value: `pending_approval`).
- Keep `record_and_apply_price_update` for one release as a stub that raises `'use /api/ingest'`.
- **Delete the direct Supabase REST reads too**: `fetchExistingProductSkus_`, `fetchExistingListingVariants_` (the sheet's pre-validation — the per-item ingest response `unknown_sku` replaces it) and `testSupabaseConnection` (replace with `testIngestConnection` hitting **GET `/api/ingest/health`**, same header auth, returns `{ok:true}`).
- The Apps Script does **not** call the publish drain. On DigitalOcean the long-lived worker drives all background work; a second driver would only race the same lock. The script's whole surface is `POST /api/ingest` and `GET /api/ingest/health`.
- **Sheet idempotency fix**: today's sheet `source_ref` is `'sheet:價格更新:row:N'` — row-number based, so an edited row re-synced later collides with the old key and the change is silently swallowed by idempotency. New rule: generate a `runId` (UUID) per sync run; `source_ref = 'sheet:{runId}:row:{N}'`. Chunk retries within a run stay idempotent; a new run reprocesses edited rows. Gmail keeps `message.getId()` (correct as is).
- The `run` envelope feeds `crawl_runs` (§6.5): last run, next run (computed from cadence), today's count — Screen 2's crawl panel.

### 3.2 StockX quantity is constant 1
`GmailStockX.gs` always sends `quantity: 1`; no parsing change beyond the constant. Add a fixture test over the `.eml` files in `files/`.

### 3.3 Margins leave the Sheet; currency defaults to HKD
- `SheetUpdater.gs`: remove columns 百分比毛利, 固定毛利, 上架價格 plus all code referencing `MARGIN_PERCENT`, `MARGIN_FIXED`, `LISTING_PRICE`, `computeListingPrice_`, and the listing-price formula/protection (`applyListingPriceFormula_`, `applyLockedListingPriceColumn_`); re-index `SHEET_SYNC.COL`. `formatPriceSheet` migrates an existing sheet in place (delete the three columns, drop their validations/protections, preserve other data).
- **Final sheet headers (12 columns):** 產品名稱 | 產品貨號 | 品牌 | 尺碼 | 庫存數量 | 成本 | 貨幣 | 圖片網址 | 新產品 | 狀態 | 上次同步 | 錯誤.
- **Currency defaults to HKD, not USD.** The 貨幣 column and dropdown stay, but every USD default flips to HKD: `normalizeCurrency_(blank)` → `'HKD'`, bare `$` → `'HKD'`, `parseMoney_`/`parseAmount_` fallback `'HKD'`, dropdown help text updated (今天空白預設 USD → 空白預設 HKD). The ingest payload keeps an optional `currency` field defaulting to `'HKD'`. The server currently accepts **HKD only** — any other value is rejected per row (`invalid_currency`, 錯誤 column: 目前僅支援 HKD) — the schema stays per-currency so other currencies can be enabled later without migration.
- Keep behaviors: blank 品牌 → `deriveBrand_` prefix match; 新產品 rows default quantity to 1 when blank.
- **Allow quantity 0** (sold out) from both sheet and dashboard: sheet validation becomes ≥ 0, and the `price_updates.quantity` CHECK relaxes from `> 0` to `>= 0`.
- `price_updates`: drop `margin_percent`, `margin_fixed`, `listing_price`.
- Rewrite the README pricing section.

### 3.4 `/api/ingest` processing (synchronous, per item, own transaction)
1. Insert `price_updates` row (`pending`); on `(source, source_ref)` conflict return the stored result with `idempotent: true`.
2. Resolve/create `products` (into the default group) / `listings` / `listing_sources`. `allow_create=false` + unknown SKU → `rejected / unknown_sku`.
3. `select … for update` on the listing.
4. Update the matching source row's cost (and quantity for `in_house`); recompute `base_cost` (most recent applied update wins) and the candidate selling price via §5.
5. Run the approval decision (§5).
6. If `image_url` is present, upsert it into `media.product_images` for the SKU (primary when the SKU has no primary yet; otherwise update the existing primary URL) — this replaces both `.gs` files' separate `upsert_product_image_url` RPC calls.
7. Write `price_history` on real change; stamp the `price_updates` row (`status, outcome, listing_id, history_id, applied_at, threshold_at_decision`).
8. Never call Shopify inline — enqueue (§7).

Each item is one short DB transaction. Item failure → `status='error'` + `error_message`; batch continues. (No serverless duration cap applies — the app runs as a long-lived Node process.)

---

## 4. Schema migrations (`007+`)

```sql
create table listing_sources (
  id uuid pk, listing_id uuid not null references listings,
  source text not null check (source in ('stockx','in_house')),
  cost numeric(12,2), quantity integer not null default 0 check (quantity >= 0),
  last_source_ref text, last_synced_at timestamptz, updated_at timestamptz,
  unique (listing_id, source));
-- backfill from listings.cost + stock_levels using listings.source; then stock_levels becomes a view or is dropped

alter table listings add column
  approval_status text not null default 'approved'
    check (approval_status in ('approved','pending_new','pending_price','needs_margins','rejected','inactive')),
  approved_price numeric(12,2), approved_at timestamptz, approved_by uuid,
  base_cost numeric(12,2), base_cost_source text, base_cost_at timestamptz,
  pending_price numeric(12,2), pending_since timestamptz, pending_update_id uuid,
  margin_source text check (margin_source in ('override','group','default')),  -- derived, for display
  shopify_product_id text, shopify_variant_id text, shopify_inventory_item_id text,
  shopify_synced_at timestamptz, shopify_sync_error text;
-- listings.margin_percent / margin_fixed become the per-size OVERRIDE (nullable)

alter table products add column
  name_zh text, title text, body_html text, vendor text, product_type text, tags text[],
  product_group_id uuid not null references product_groups(id);  -- seed default group first

create table product_groups (id uuid pk, name text unique, margin_percent numeric(8,4),
  margin_fixed numeric(12,2), is_default boolean default false, timestamps);
-- exactly one is_default row; deletion of it is forbidden; deleting a group reassigns its products to it

create table pricing_settings (id int pk check (id=1),
  auto_approve_up_percent numeric(6,3) not null default 10,
  auto_approve_down_percent numeric(6,3) not null default 10,
  default_margin_enabled boolean not null default true,
  default_margin_percent numeric(8,4) not null default 12,
  default_margin_fixed numeric(12,2) not null default 0,
  rounding_enabled boolean not null default true,   -- §5 rounding to x49/x99
  updated_at, updated_by uuid);

create table allowed_users (email citext pk, name text not null, added_by uuid, added_at);
-- seed: mike@empha.xyz

create table crawl_runs (id uuid pk, run_id text unique, source text, trigger text,
  started_at, finished_at, item_count int, ok_count int, error_count int);
-- run_id is the Apps Script's per-run UUID; one run spans several chunk requests

create table shopify_sync_jobs (id uuid pk, listing_id uuid, attempts int default 0,
  state text not null default 'pending',   -- 'deferred' while PUBLISH_TARGET=none
  next_attempt_at, last_error text, created_at, done_at);
create unique index shopify_sync_jobs_pending_unique on shopify_sync_jobs (listing_id)
  where done_at is null;                    -- bounds the backlog at one row per listing

create table jobs (id uuid pk, kind text not null, scope_key text, payload jsonb,
  total int, done int, status job_status, triggered_by_user_id uuid,
  created_at, started_at, finished_at, last_error text);
create unique index jobs_active_scope_unique on jobs (kind, scope_key)
  where status in ('queued','running');          -- five rapid clicks return one job
create table job_items (id uuid pk, job_id uuid not null references jobs on delete cascade,
  listing_id uuid, status job_status, reason text, attempts int default 0,
  max_attempts int default 5, locked_by text, heartbeat_at, updated_at);
-- one table for every fan-out: group apply, settings recompute, margin_source recompute (§6.3)

create table worker_heartbeat (id int pk check (id=1), instance text, last_beat_at timestamptz);

alter table price_history add column
  change_type text check (change_type in ('cost','margin_percent','margin_fixed','listing_price',
    'quantity','listing_status','margin_source','manual_price')),
  actor_id uuid, actor_label text;   -- '系統自動', '爬取更新', '分組批次更新', or user name
create table audit_log (id uuid pk, user_id uuid, action text, target_table text,
  target_id uuid, before jsonb, after jsonb, created_at);

alter table media.product_images add column sort_order int not null default 0;
-- Supabase Storage bucket `product-images`; JPG/PNG, ≤2MB, max 8 per SKU, one primary
```
`price_updates` gains `engine text not null default 'v2'` — five legacy outcome values are re-emitted by the new engine with different meanings, and `/approvals` reads across both eras. `price_updates.status` CHECK gains `'error'`; `outcome` gains `'held_for_approval','auto_approved','superseded','needs_margins','unknown_sku','invalid_currency'`. `price_history.source` gains `'dashboard'`. Drop `listings.managed_by` if previously added.

---

## 5. Pricing & approval decision

**Selling price** for a listing:
```
margins   = listing override ?? group margins ?? system default (if enabled) ?? none
raw       = base_cost + base_cost × margin% / 100 + margin_fixed
price     = rounding_enabled ? round_up_to_49_or_99(raw) : raw
            -- last two digits ≤49 → x49; 50–99 → x99  (1,901→1,949; 1,951→1,999)
```
Rounding runs after group markup, before the threshold comparison. `compute_listing_price` is extended accordingly.

**Definitions.** *Live price* = `approved_price` (what Shopify shows). *Held* = stored as `pending_price`, visible in the queue, NOT sent to Shopify until a human approves.

| Situation | Result |
|---|---|
| No listing existed | `pending_new` — always manual |
| No margins resolvable (§5 chain empty) | `needs_margins`; cost/stock still saved |
| Listing `rejected` / `inactive` | cost/stock saved; not re-queued until human reactivates |
| Δ = (price − approved_price) / approved_price within [−down%, +up%] | **auto-approved**: `approved_price = price`, actor 系統自動, Shopify enqueued |
| Δ outside band | **held**: `pending_price = price`, `pending_since` kept from oldest unapproved |

- Δ is computed on **listing price vs approved listing price** — never on raw cost, and never against the previous computed price (1000→1200 held, then 1250: vs 1200 = +4% would sneak through; vs 1000 = +25% stays held).
- **Latest wins**: one pending price per listing; newer replaces, older `price_updates` row → `superseded`.
- Quantity-only changes skip approval; inventory syncs immediately.
- **Manual price adjustment**: an authenticated user may set the selling price directly (`POST /listings/:id/price`), bypassing the threshold (it *is* the human approval). Records `price_history` as `manual_price` with the user as actor; syncs Shopify.
- Both threshold values are stamped on every decision (`threshold_at_decision`).

---

## 6. Dashboard backend

### 6.1 Auth
Supabase Auth, Google provider. No domain restriction — a session is valid iff the email is in `allowed_users`; otherwise sign out with a message. Single role; anyone allowed can approve and manage users. Every mutation → `audit_log`. Writes go through server-side service-role only.

### 6.2 Endpoints (`/api/v1`, JSON, `{data}|{error:{code,message}}`)

| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Product-level list for Screen 7: search (name/SKU), status tabs with counts (未上架/已上架/已下架), group filter, sort incl. latest-import; aggregates per product: size count, margin summary, price range, primary image. Cursor pagination 50. |
| GET | `/products/export` | CSV of the current filter. |
| GET | `/products/:sku` | Detail: product content + all listings with sources, margins (and margin_source badge), prices, images. |
| PATCH | `/products/:sku` | **Transactional nested payload** (detail page saves drafts in one shot): `{name_en?, name_zh?, content?, status?, listings?: [{id, margin_override?, in_house?: {cost?, quantity?}}]}`. SKU and sizes immutable. In-house fields only — `stockx` source rows are read-only (400 on attempt). Recompute + §5 decision per touched listing. |
| POST/PATCH/DELETE | `/products/:sku/images`, `/images/reorder` | Upload to Storage (JPG/PNG ≤2MB, max 8), set primary, replace, delete, drag order → `sort_order`. Changed images enqueue Shopify sync. |
| GET | `/listings/:id` | + history + inbound log (last 20 each). |
| GET | `/listings/:id/history` | Full history, filter by size/all, `?format=csv` export. Rows carry change_type + actor. |
| PATCH | `/listings/:id/margins` | Single-size override (Screen 8 popover / Screen 3 inline edit). Null clears the override (falls back to group/default). |
| POST | `/listings/:id/price` | Manual price adjustment (§5). |
| POST | `/listings/:id/approve` · `/reject` · `/deactivate` · `/reactivate` | As §5. Reject on `pending_new` → `rejected`; on `pending_price` → back to `approved` at old price. Optional reason. Deactivate → Shopify `draft`. |
| POST | `/listings/bulk-approve` | `{listing_ids}` or `{product_sku}` ("approve all sizes"). |
| POST | `/products/bulk` | Screen 7's 批次操作 (menu undefined in the design — defined here): `{skus, action: 'assign_group'|'deactivate'|'reactivate', group_id?}` applied per product across its listings. |
| GET | `/approvals` | View over `price_updates` incl. auto-approved rows ("無需處理"); filters source/status/date-range; per-variant rows (product, SKU, **size**, live price, new price, Δ%, pending_since). |
| GET | `/approvals/stats` | Screen 1 metric cards: total crawled (+today), pending, confirmed + pass rate, rejected + rejection rate. |
| GET/POST/PATCH/DELETE | `/groups`, `/groups/:id` | Default group cannot be deleted or lose is_default. Deleting a group reassigns products to the default group and re-runs §5 for each affected listing. |
| POST/DELETE | `/groups/:id/members` | Accepts products already in another group; response reports "moved from X"; recomputes with the new group's margins. |
| POST | `/groups/:id/apply` | Batch margin update. Body: `{scope: 'all'|'group_rule_only'|'overridden_only', margin_percent?, margin_fixed?}` — only provided fields update. `all` also clears/overwrites size overrides; `group_rule_only` skips overridden sizes; `overridden_only` resets overrides to the new rule. Returns **202** with a `jobs` row id; the worker processes it. **GET `/api/v1/jobs/:id`** is a **pure read** returning progress (`done/total`) and per-size failures with a retry action (Screen 4 states B–E); `POST /api/v1/jobs/:id/retry` seeds a new job from the failures. The API still returns a machine-readable reason per failed size (`missing_cost`, `shopify_error`) even though the design shows only the failed SKU/size list. |
| GET/PATCH | `/settings` | Thresholds, system default margin (enabled/%/fixed), rounding toggle. |
| GET/POST/DELETE | `/settings/allowed-users` | Name + email. No invitation email. |
| GET | `/crawl-runs` | Screen 2 panel: cadence (display-only — lives in the Apps Script trigger), last/next run, today's count. |
| POST | `/shopify/sync/:listingId` · `/shopify/drain` | §7. **Publishing is deferred** — with `PUBLISH_TARGET=none` these enqueue/report but never call Shopify. Drain is worker-driven. |
| POST | `/ingest` · GET `/ingest/health` | §3. Machine auth, not under `/v1`. |

zod on every body. Money as numeric strings. Store UTC, display Asia/Hong_Kong.

### 6.3–6.5 covered above (group apply jobs, crawl runs).

---

## 7. Shopify publishing — enablement against the test store

The worker drain, `shopify_sync_jobs` queue, and `POST /api/shopify/drain` are still deferred:
Phase 1 builds everything up to the publishing boundary and stops. Selection is an explicit
`PUBLISH_TARGET=none|shopify` flag — never absent-credential detection, because a lost secret must
not degrade silently to "everything skipped, dashboard green". While disabled, jobs take state
`deferred`: never deleted, excluded from staleness alarms, and replayed in `created_at` order at
enablement. The queue **is** the enablement backfill.

The test store is reachable. `lib/shopify` is the Admin GraphQL client; `pnpm shopify:probe`
resolves F1/F2; `pnpm shopify:ping` upserts a canary SKU. Keep `PUBLISH_TARGET=none` for `pnpm dev`.
The rules below are the contract the adapter will satisfy.

- Admin GraphQL 2026-07, custom-app token, `shoelaxe-test.myshopify.com`, location **F1**. Production `shoelaxe.myshopify.com` is a later cutover.
- One product per SKU, one variant per size. Variant price = `approved_price` (HKD). Inventory = **in-house quantity only**; track inventory; no overselling.
- Content: `products` fields + images (`sort_order`, primary first). No image → create as `draft`, else `active`. 已下架 → `draft`.
- Adopt existing store products by SKU on first sync; upsert by stored IDs after.
- Variant SKU is `{product_sku}-{size}` (e.g. `555088-101-US9`). Adopt-by-SKU queries on **every** attempt where ids are absent, not just the first, so a torn write recovers; two matches is `ambiguous_sku`, never a guess.
- Drain: leaky-bucket aware, backoff 1m/5m/30m/2h/12h, 5 attempts then surface `shopify_sync_error`. Driven by the long-lived worker and a "Sync now" button. Stock 0 does not auto-unpublish.

---

## 8. Phase 2 — Frontend
Implement the .pen design (minus the deltas listed at the top): Screens 0–10 incl. approval queue with stats, product list with tabs/export, product detail with per-size drawer (two source cards, unified price panel, draft save bar), group batch-apply modal states A–E, settings, users.

## 9. Deliverables, Phase 1
1. Migrations 007+ applied; generated types committed here.
2. Apps Script changes (§3) + README rewrite + one-time sheet migration.
3. `/api/ingest`, `/api/v1/*`, `/api/shopify/drain` with zod; vitest covering every §5 table row, latest-wins, Δ-vs-approved, rounding boundaries (…49/…99) and the margin precedence chain. The live Shopify dev-store test moves to enablement; Phase 1 verifies the publishing boundary against a fake adapter.
4. `.env.example`: `DATABASE_URL` (Supavisor **session** pooler — never `db.<ref>.supabase.co`, which is IPv6-only and unreachable from DigitalOcean), `DIRECT_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `INGEST_SECRET`, `APP_ROLE`, `PG_POOL_MAX`, `PUBLISH_TARGET=none`. The four `SHOPIFY_*` vars (`STORE_DOMAIN`, `API_KEY`, `API_SECRET`, `LOCATION_ID`) are optional and only required when `PUBLISH_TARGET=shopify`.
5. `README.md`: endpoints, env, plain-language §5, and how to run locally against Docker Supabase.
6. `docs/API.md` + generated `docs/openapi.json` (from the same zod schemas the routes validate with).
7. `docs/COST.md`, regenerated by `pnpm cost`.
8. `.do/app.yaml`, `Dockerfile`, `Dockerfile.worker`, `.dockerignore`, and the GitHub Actions deploy.
