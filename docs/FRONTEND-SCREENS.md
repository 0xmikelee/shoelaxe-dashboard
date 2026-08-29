# Screen → endpoint → state matrix

The operational companion to `docs/FRONTEND-PROMPT.md`. One entry per design screen: what it reads,
what it writes, which fields it renders, and which states it must handle. Endpoints are `/api/v1/*`
unless noted. Error codes are from the real union in `lib/http/errors.ts` — none are invented.
Bracketed `[Gap N]` markers point at `docs/API-GAPS.md`.

Four codes are machine-only and can never appear here: `missing_key`, `invalid_key`, `run_mismatch`,
`batch_too_large`. Four more — `unknown_sku`, `invalid_currency`, `invalid_size`, `missing_cost` —
never arrive as HTTP errors either; they surface as `job_items.reason` and `price_updates.outcome`
values inside Screen 4 state E and Screen 1 rows. `rate_limited` and `shopify_not_configured` are
deliberately absent from the union: do not build for them.

---

## Shell — `(dash)/layout.tsx`

**Reads** `GET /approvals/stats` for the nav badge (revalidate after any approve/reject), plus a
bootstrap call for identity, `meta.publishing.enabled` and the default group id [Gap 5].

**States** Badge loading renders nothing, not `0`. A 401 anywhere in the tree redirects to
`/login?reason=expired`; a 403 `not_allowed` signs the user out first. A persistent banner shows while
`publishing.enabled === false`.

## Screen 0 — Google 登入

**Reads** none. **Writes** Supabase Auth only; the callback route exchanges the code and the guard
checks `allowed_users`.

**States** idle · redirecting · returning-from-callback · **not_allowed** (authenticated but not on
the list → sign out, show 沒有存取權限) · provider error (`?error=access_denied`) · arrival from an
expired session · `service_unavailable` if the guard's own database check fails — and that last one
must read differently from `not_allowed`, because "we can't verify you right now" is not "you don't
have access".

**Delta** Delete 僅限 @shoelaxe.com 網域. There is no domain rule, only the allow-list.

## Screen 1 — 價格監控與審批

**Reads** `GET /approvals` with `q`, `source`, `status`, `from`/`to` (or a `preset`), `sort`, paging,
and `listing_id`/`sku` for deep links from Screen 8. `GET /approvals/stats` for the four cards —
whether the cards follow the table filters is unspecified [Gap 8].

**Writes** `POST /listings/:id/approve` · `POST /listings/:id/reject {reason?}`. Auto-approved rows
show 無需處理 and have no action.

**Fields** `update_id`, `listing_id`, `product_sku`, `product_name`, `name_zh`, `size`, `source`,
`cost`, `previous_cost` [Gap 6], `approved_price`, `new_price`, `delta_percent`,
`delta_percent_exact`, `delta_direction`, `outcome`, `pending_since`, both thresholds at decision,
`engine`. Stats: `total_crawled`, `crawled_today`, `pending`, `confirmed`, `pass_rate`, `rejected`,
`rejection_rate`.

**States** First load shows card and row skeletons; a filter change dims the table but leaves the
filters live and refetches the cards separately, so typing in the search box doesn't blank the
metrics. Two distinct empty states — "no rows match this filter" and "nothing is waiting" — because
they call for different next actions.

**Row-action errors are toasts plus a row refetch, never a page error.** `not_pending` (409) is the
expected race: someone else approved it, or a newer update superseded it. It must read as
「此筆已被更新的價格取代」, not as a failure. Also `needs_margins`, `listing_inactive`, `not_found`,
`conflict`.

**Special rows** `pending_new` has a null `approved_price`, so Δ is undefined — render `—` and a
新產品 badge. `approved_price = 0` is the explicit division guard and also renders `—`. The design's
three-value status vocabulary cannot express either [Gap 9].

**Header tooltips (Screen 1 States)** The drawn copy is factually wrong under §5 and needs rewriting
[Gap 6]: the pricing base is `base_cost` — the most recent applied cost from *either* source — not
"the previous crawled market price".

## Screen 2 — 系統配置

**Reads** `GET /settings` · `GET /crawl-runs?limit=1` · `GET /system/health` for 爬蟲服務運行中.

**Writes** `PATCH /settings`, changed fields only.

**States** loading · dirty, with a navigation guard · saving · `validation_failed` inline per field ·
`conflict` on a concurrent edit. **And a long-running one that is easy to miss:** changing a
threshold, the default margin or the rounding toggle re-prices every listing resolving to the default
margin, which the plan makes a worker job. The endpoint must return a job [Gap 7] and this screen must
render the same `JobProgress` as Screen 4 — otherwise it shows a green tick while prices keep moving
for the next minute.

The crawl panel needs two *separate* degraded indicators: a stale last-run means the Apps Script
trigger stopped; a stale worker heartbeat means the background service died. They are different
outages with different fixes, and one indicator for both is useless.

## Screen 3 — 產品分組與定價策略

**Reads** `GET /groups` (list with `product_count`) · `GET /groups/:id` (header counts, rule, and the
Screen 4 scope counts [Gap 10]) · `GET /products?group_id=…` (the table) · `GET /products/:sku` on row
expand (per-size rows).

**Writes** `POST /groups` · `DELETE /groups/:id` (Screen 6) · `POST /groups/:id/apply` (Screen 4) ·
`POST /groups/:id/members` (Screen 5) · `PATCH /listings/:id/margins` for the inline per-size edit.
套用至所有尺寸 has no endpoint that fits [Gap 11].

**Fields** Per product: names, `sku`, primary image, cost range [Gap 12], margin and fixed ranges,
price range, the 尺寸差異 badge, and the 已覆寫 / 使用系統預設 badges from `margin_source` — most of
which the endpoint table does not currently promise [Gap 13].

**States** The group list is never empty — the default group cannot be deleted. Inline edit runs
editing → saving → saved (flash the new price) → error, optimistic with rollback. **While a group
apply is running, show a banner and disable 批次更新利潤**, or the submit will 409
`job_already_running`.

**Codes** `not_found`, `default_group_immutable`, `group_not_empty` [Gap 14], `validation_failed`,
`needs_margins`, `listing_inactive`, `listing_not_in_product`, `job_already_running`, `conflict`.

## Screen 4 — 編輯分組彈窗 · the most stateful screen

**Reads** `GET /groups/:id` for the current rule and the scope counts 96/78/18 [Gap 10] ·
a preview endpoint for the 預覽 block, which does not exist [Gap 15] · `GET /jobs/:id` polled for
states C–E · `GET /jobs?kind=group_apply&scope_key=…&status=queued,running` to rehydrate after a
reload.

**Writes** `POST /groups/:id/apply {scope, margin_percent?, margin_fixed?}` → **202** `{job_id, total}`.
Field presence *is* the checkbox: absent means "don't touch", exactly as on Screen 8's draft.
`POST /jobs/:id/retry` for 重試失敗項目.

**States, mapped to the design's boards — and three the design doesn't draw:**

| Board | State | Requirement |
|---|---|---|
| A | form | Scope radio with live counts; the submit disabled until at least one field is checked |
| B | scope = 僅分組規則 | Re-render of A with the "18 保持不變，僅更新 78" copy |
| — | **queued** | The worker may not claim instantly. Show 排隊中, **not** `0 / 96`, which reads as stalled |
| C | 套用中 42 / 96 | Poll ~1s while running, back off after 30s. Either non-dismissible, or dismissible with the job continuing behind a Screen 3 banner |
| D | 套用成功 | Needs `updated_count`, `overridden_cleared_count`, average price before/after — none derivable from `done`/`total` [Gap 16] |
| E | 部分項目失敗 | Needs SKU + size per failure, but `job_items` stores only `listing_id` [Gap 16] |
| — | **failed** | Whole-job failure with `last_error` — distinct from E |
| — | **stalled** | Running, no progress, stale worker heartbeat → 背景服務未運行 |
| — | **already running** | The submit 409s `job_already_running`; don't error, switch straight to state C on the existing job |

**Copy fix** State E's 以下尺寸的未套用變更 is a broken sentence → 以下尺寸未套用變更. The delta says
no reason badges, but the API does return `reason`; surface it in a tooltip anyway, because
`missing_cost` is the one failure a user can actually act on.

## Screen 5 — 新增產品彈窗

**Reads** `GET /products` with search and a group-scope filter that has no supported parameter
[Gap 17]. **Writes** `POST /groups/:id/members {product_skus}`.

**States** 300ms search debounce · loading · empty · selection count · **select-all is page-scoped
only, and the UI must say so** — an unbounded cross-page select-all silently moves the catalogue ·
the move-warning state, which is pure client logic from each row's `group` field.

**Unspecified by the design:** whether products already in 預設分組 get a move warning. Recommend no,
since it is a catch-all rather than a curated group.

## Screen 6 — 刪除分組確認彈窗

**Reads** `GET /groups/:id` for the name and product count — the design omits the number and is weaker
for it. **Writes** `DELETE /groups/:id`.

**States** confirm · deleting · success → navigate to the default group. Per §6.2 this reassigns every
product *and re-runs §5 for each affected listing*, which at 24 products × 8 sizes is a fan-out, not a
request — so it should be 202 + job [Gap 18], and this modal needs `JobProgress` too.

## Screen 7 — 產品列表

**Reads** `GET /products` with `q`, `status`, `group_id`, `sort`, paging. Tab counts from
`meta.counts`, which must respect `q` and `group_id` but **ignore** `status`.

**Writes** `GET /products/export` with the identical filters · `POST /products/bulk` [Gap 19].

**States** Tab switch refetches rows but **keeps the counts rendered** — they don't change. A sort
change must reset the cursor. Three distinct empty states: no products at all, no search results, an
empty tab. Export shows progress on the button and handles a slow or failed download.

**A gap in the design itself:** there is a 批次操作 button but no checkbox column. Add a leading
selection column and an "已選擇 N 項" bar, and make the action operate on the selection only — never
on the whole filter.

**Product-level status** is a derivation from listing-level `approval_status` and is unspecified
[Gap 4].

## Screen 8 — 產品詳情

Build the per-size surface as an **inline accordion**, matching the design and the 改版提案 board's
own naming. §8 of the brief calls it a drawer; the design draws an expander. Follow the design.

**Reads** `GET /products/:sku` for everything above the fold · `GET /listings/:id/history` twice, once
filtered to price changes for the six-bar chart [Gap 20] and once paged for the per-size table · a
product-level history endpoint for the bottom table, which does not exist [Gap 21].

**Writes** `PATCH /products/:sku` (the transactional draft) · `PATCH /listings/:id/margins` ·
approve/reject/deactivate/reactivate per size · the image endpoints · and `POST /listings/:id/price`,
which §5 defines but no screen surfaces [Gap 22].

**Fields** Product: names, `sku`, group, status, `updated_at`, images with `sort_order` and
`is_primary`, plus in-house-only stock aggregates [Gap 23]. Per listing: `size`, `approval_status`,
`base_cost` **and `base_cost_source`** — the 來自最新價格變動 label has to name which source won —
`margin_percent`, `margin_fixed`, `margin_source`, `approved_price`, previous price and timestamp,
`pending_price`, `pending_since`, `raw_price` [Gap 2], and both source sub-objects.

**States** The save is transactional, so there is **no partial-failure state for the save itself** —
but the §5 outcome differs per listing: some auto-approve, some land as `pending_price`, some become
`needs_margins`. The UI has to report that mix, which needs a per-listing response body [Gap 24].

Also: draft-dirty with a navigation guard, image upload progress, optimistic drag-reorder with
rollback, history paging, a chart with fewer than six points and with none, and the
publishing-disabled variants [Gap 25].

**Codes** `not_found`, `validation_failed`, **`source_read_only`** (the StockX fields must be
non-editable, but handle the code anyway — if you ever see it, it is a frontend bug rather than user
error), `listing_not_in_product` (a stale id in a long-open draft), `needs_margins`,
`listing_inactive`, `not_pending`, `conflict`, `payload_too_large`, and for images
`unsupported_media_type`, `image_too_large`, `image_limit_reached`.

**Three competing commit paths** — the draft bar, the per-size 套用新售價 button, and the popover's
確認 — need reconciling into one [Gap 26].

## Screen 9 — 編輯產品名稱彈窗

**Reads** nothing; hydrates from the already-loaded product. The two 唯讀參考 fields have no columns
anywhere [Gap 27].

**Writes** OK should **stage into the Screen 8 draft**, not PATCH immediately — otherwise the modal
and the save bar become two competing commit paths for the same record.

**States** Client-side character counts (26/120, 25/120) with `validation_failed` as the backstop.
Suppress 名稱變更後約需 5 分鐘同步 while publishing is disabled — nothing syncs.

## Screen 10 — 新增使用者帳號

**Reads** `GET /settings/allowed-users`. At six rows, filter client-side.

**Writes** `POST /settings/allowed-users {name, email}` · `DELETE /settings/allowed-users/{email}`
[Gap 28].

**States** A duplicate email is `conflict` — the design's 需有效且未被使用 is exactly that code.
`validation_failed` for a malformed address; normalise to lowercase client-side, since the column is
`check (email = lower(email))`. **Add a confirmation to 移除** — the design has none, and
移除後立即失去存取權限 is a warning, not a confirmation. The 移除 button must be disabled on your own
row [Gap 28], and removing the last remaining user must be refused [Gap 28].

**Delta** Delete 建立後將發送邀請信.
