# API gaps blocking Phase 2

Every place the design needs something `docs/PROMPT.md` §6.2 does not provide, found by walking each
screen's data needs against the endpoint table. Numbered for reference from
`docs/FRONTEND-SCREENS.md`.

Gaps 1–4 are **decisions**, not omissions — the answer changes what gets built, and guessing produces
a rule the implementation invented. The rest are additive and mostly uncontroversial.

---

## Decisions

### Gap 1 — Does a batch operation bypass the approval band?

Affects Screens 3, 4, 5, 6 and 7.

A group batch-apply changes margins, which changes the listing price. §5 says any price outside the
±band is *held* as `pending_price` rather than applied. Read literally, applying a new margin across
96 sizes changes nothing live and files 96 rows into the approval queue — while Screen 4's success
state reports 「平均售價變化 HK$1,416 → HK$1,420 · 完成」 as though it took effect, and Screen 5 says
「移入後改用新分組利潤率重新計算售價」.

§5's decision table describes *ingest-driven* deltas. It does not explicitly forbid a human-initiated
batch from bypassing the band, and it already grants exactly that to `POST /listings/:id/price` on the
grounds that a human doing it deliberately *is* the approval. §4 also already defines the actor label
分組批次更新, which is difficult to explain unless batch changes were meant to apply directly.

**Recommendation:** declare group apply, membership change, group-deletion reassignment and
`products/bulk assign_group` to be human approvals that bypass the band, writing `price_history` with
`actor_label='分組批次更新'`. **Write it into §5** either way. If the answer is the opposite, Screen 4
state D and Screen 5 both need a 「N 個尺寸待審核」 line and the preview's `would_hold_for_approval`
count becomes mandatory rather than informational.

### Gap 2 — Every formula preview in the design omits rounding

§5 is unambiguous: rounding to x49/x99 runs after the markup and before the threshold comparison. The
design's previews show the markup arithmetic correctly and then print the unrounded answer:

| Screen | Shows | Should be |
|---|---|---|
| 2 | 成本 HK$1,200 → HK$1,344 | **HK$1,349** |
| 3 | HK$1,200 × (1 + 15%) + HK$150 = HK$1,530 | **HK$1,549** |
| 8 | 售價 HK$1,530 | **HK$1,549** |

Previews must render both steps:
`HK$1,200 × (1 + 15%) + HK$150 = HK$1,530 → HK$1,549（尾數進位）`, omitting the arrow when rounding is
disabled or the raw figure already ends in 49/99.

**Add `raw_price` and `rounding_applied: boolean`** alongside `approved_price`/`pending_price` on every
listing payload, so three screens don't each re-implement the rule in JavaScript and drift from the
server.

### Gap 3 — Pagination is specified two ways

§6.2 mandates cursor pagination at 50. The design shows 顯示 1–6 筆，共 128 筆 with a 每頁 20 筆
selector (Screen 1), a numbered pager (Screen 7) and 分頁 1/4 · 18 筆 (Screen 8). Cursor pagination can
render none of those.

**Recommendation:** `/approvals` and the history endpoints use offset paging (`page`, `per_page`) with
`meta.{total, page, per_page, total_pages}` — both are bounded, filtered sets where offset is fine at
this data size. `/products` keeps its cursor and gains `meta.total`, with its pager becoming prev/next.
Either way **`meta.total` is required and is not currently in the `meta` contract**, and the default
page size should be 20 to match the design rather than 50.

### Gap 4 — `pending_price` has no home in the listing taxonomy

§2 partitions listings three ways: 未上架 = `pending_new`/`needs_margins`/`rejected`, 已上架 =
`approved`, 已下架 = `inactive`. But the §4 CHECK has six values, and the missing one is
`pending_price` — a listing that is **live at its old approved price** while a new one waits.

It belongs under 已上架 with a secondary indicator, not under 未上架. Getting this backwards mislabels
the most important rows in the product. Specify the mapping, and specify the product-level derivation
for Screen 7's tabs so the three counts partition all six values and sum to 全部 (recommended: 已下架
if every listing is inactive; else 已上架 if any is `approved` or `pending_price`; else 未上架).

---

## Missing endpoints

### Gap 5 — No identity endpoint
Nothing answers "who am I". Add `GET /api/v1/me` returning the user's id, email and display name, with
`meta` carrying `publishing.enabled`, `pending_count`, `default_group_id` and a settings snapshot.
Folding settings in removes a second round-trip on every screen that renders a price formula preview —
Screens 3, 4 and 8 all do.

### Gap 15 — Screen 4's preview has no endpoint
「以成本 HK$1,200 計算 … 目前售價 → 更新後」 needs the margin precedence chain, the rounding rule and
the per-scope selection — all server-side. Add `POST /groups/:id/apply/preview` (POST for the body, but
a pure read) returning scope counts, an ineligible breakdown, a worked sample, average price before and
after, an increase/decrease/unchanged split, and `would_hold_for_approval`. Default the sample cost to
the group's median `base_cost` so the illustrative figure is explainable rather than arbitrary.

### Gap 21 — No product-level history endpoint
§6.2 has only `GET /listings/:id/history`, scoped to one size. Screen 8's bottom table has a 全部尺寸
filter, a 尺寸 column and an 匯出 button — that is product-scoped. (Tellingly, §6.2 describes the
listing endpoint as supporting "filter by size/all", which is meaningless on an endpoint already scoped
to a single size — good evidence the intent was product-scoped throughout.) Add
`GET /products/:sku/history` with `size`, `change_type`, paging and `format=csv`.

### Gap 11 — 套用至所有尺寸 has no endpoint
`/groups/:id/apply` is group-scoped and `/listings/:id/margins` is one size. The nested product PATCH
works but forces the client to enumerate every listing id for a single user intent. Add
`POST /products/:sku/margins {margin_percent?, margin_fixed?, scope}` returning per-listing outcomes —
N is small enough to stay synchronous — reusing the group-apply scope vocabulary so both share a
component.

### Gap 22 — Manual price adjustment has no UI, and Gap 26 — Screen 8 has three commit paths
`POST /listings/:id/price` is the only way to set a price outside the band and §5 calls it out
explicitly, but no screen invokes it. Add a 手動指定售價 affordance in the 統一售價 panel with a
confirmation naming the bypass. Separately, Screen 8 currently has a draft save bar, a per-size
套用新售價 button *and* a popover 確認 — three writers of the same fields. Recommend everything stages
into the draft and commits through one `PATCH /products/:sku`; either remove 套用新售價 or redefine it
as a scoped commit.

---

## Missing fields and parameters

### Gap 6 — `/approvals` row shape
§6.2 promises "product, SKU, size, live price, new price, Δ%, pending_since". The design draws
最新爬取價格 and 上次爬取價 — which are *costs* — and no current-price column. Add `cost`,
`previous_cost` (+timestamp, same source), `approved_price`, `new_price`, `delta_percent`,
`delta_percent_exact`, `delta_direction`, both thresholds at decision, `outcome` and `engine`.
Relabel the columns: Δ% belongs on the price pair, not between two costs. And rewrite the header
tooltip, which currently describes the pricing base as the previous crawled price when it is
`base_cost` — the most recent applied cost from *either* source.

### Gap 7 — `PATCH /settings` must return a job
Changing a threshold, the default margin or the rounding toggle re-prices every default-margin
listing, which the plan makes a worker fan-out. Return 202 with `meta.job`, or 200 with no job when
nothing needed recomputing. Without it the UI shows a green tick while prices keep moving.

### Gap 10 — Screen 4's scope counts
96 / 78 / 18 must be known before submit and cannot be computed client-side — the product table is
paginated and per-size data only loads on expand. Add `scope_counts`, `product_count`,
`listing_count` and an `ineligible` breakdown to `GET /groups/:id`, with the invariant
`all = group_rule_only + overridden_only` stated, and say whether inactive listings are counted.

### Gap 16 — `GET /jobs/:id` needs more than done/total
State D needs a result summary; state E needs SKU and size per failure, but `job_items` stores only
`listing_id`. Add a `result` object (updated count, overrides cleared, average price before/after,
held count) — which needs somewhere to live, either a `jobs.result jsonb` column or `jobs.payload` —
an `items` array joined out to SKU and size with its `reason`, and `meta.worker.heartbeat_at`. That
last one is what lets state C tell "slow" from "the worker is dead", which otherwise look identical
from the browser.

### Gap 17 — Screen 5's group filter isn't expressible
And 未分組 **does not exist in the data model** — §2 guarantees every product is in exactly one group,
with 預設分組 as the catch-all. Add a repeatable `exclude_group_id` to `GET /products`, and **rename
the filter**: 未分組 is a lie, 預設分組 is accurate.

### Gap 19 — `POST /products/bulk` response is unspecified and inherently partial
Twelve SKUs, three with a deactivated listing. Specify `{ok_count, failed_count, results:[{sku, ok,
error_code?}]}` at 200 even on partial failure, plus a Screen 7 result panel. Also define the menu
itself, which §6.2 admits is undefined in the design: 指派分組 / 下架 / 重新上架, with a group picker
and a confirm step.

### Gap 20 — The six-bar chart needs history filtering
`GET /listings/:id/history` returns every change type. Add repeatable `change_type`, plus `limit` and
`order`.

### Gap 13 — Per-product aggregates
§6.2 promises "size count, margin summary, price range, primary image" but not the margin *ranges*
(10–20%), the fixed range (HK$100–200) or the variance flag behind the 尺寸差異 badge. Specify one
aggregate object shared by Screens 3, 5 and 7, including `margin_source_mix` and `override_count` to
drive the 已覆寫 / 使用系統預設 badges, and `margin_summary.kind` to drive Screen 7's 「—」.

### Gap 23 — 總庫存 must be named in-house-only
Screen 8 shows 總庫存 26 雙. StockX quantity is a constant 1 per size, so summing both sources
overstates stock by exactly the size count — a wrong number that looks entirely plausible. §2 and §7
both fix inventory to in-house only. Name the field `total_in_house_quantity` so the mistake cannot be
made silently.

### Gap 24 — `PATCH /products/:sku` response
The call is transactional so there is no partial failure, but the §5 *decision* differs per listing.
Return per-listing outcomes so Screen 8 can say 「3 個尺寸已更新，2 個尺寸的新售價需審核」.

### Gap 28 — Screen 10 under-specified
Return `added_at`, `added_by_name` and **`is_self`** so 移除 can be disabled on your own row. Specify
the DELETE path as `/settings/allowed-users/{email}` (lowercased, URL-encoded). **Add a guard: removing
the last allowed user must 409.** The seed is a single row, and one careless click locks everyone out
permanently.

### Gap 12 — Cost is per-listing, not per-product
Screens 3 and 5 show one 成本 per product. Specify `cost: {min, max}` and render a range, collapsing
when they match.

### Gap 27 — Screen 9's read-only reference fields have no columns
§4 adds `name_zh, title, body_html, vendor, product_type, tags` — no StockX name, no internal note.
Minimal fix: add `products.stockx_name`, stamped during ingest from the last `product_name` on a
stockx update, and cut 內部備註·別名 as out of scope unless it is genuinely wanted, in which case it
needs a write path too.

---

## Smaller specification holes

- **Gap 8** — whether `/approvals/stats` follows the table filters. Recommend lifetime totals with a
  今日 delta, independent of filters, and label them so; otherwise 通過率 changes as you type.
- **Gap 9** — Screen 1's three-value status vocabulary can't express `pending_new` (Δ undefined),
  `needs_margins` or `superseded`. Add badges, and decide whether superseded rows appear at all.
- **Gap 14** — `group_not_empty` (409) contradicts §6.2, which says deletion *reassigns* products. Either
  the code is dead — and per the `errors.ts` header comment a declared code nothing emits corrupts the
  contract — or deletion of a non-empty group is actually refused. The two answers give completely
  different Screen 6 modals.
- **Gap 18** — `DELETE /groups/:id` reassigns and re-runs §5 per listing; that is a fan-out, so 202 + job.
- **Gap 25** — what to suppress while publishing is disabled: the 上架平台 row, the image and name sync
  promises, 從所有平台移除, and every sync-status badge (M12's own test asserts those columns are NULL
  on every row, so a 最後同步：— badge on 2,700 listings is pure noise). A 立即同步 button should be
  visible and disabled with a reason rather than hidden. And consider that **已上架 itself asserts a
  live store that does not exist**.
- **Gap 29** — Screen 8's 市場最低價 HK$1,300 is not representable: the StockX cost *is* the lowest ask,
  so there is no second figure. Either delete it as a duplicate, or add `sources.stockx.previous_cost`
  and relabel it 較上次. Related: the mock shows 基準價 matching neither source cost — render
  `base_cost_source` beside the figure, and treat a base matching neither source as a data bug.
- **Gap 30** — 對自有成本毛利 +HK$330（27.5%）is a *markup on cost* (330/1200), not a gross margin
  (330/1530 = 21.6%). Pin the formula, handle a null or zero cost as 「—」, and note it can be negative.
- **Gap 31** — 套用於全部 2 個來源 must count actual `listing_sources` rows; a listing may have one.
- **Gap 32** — `GET /listings/:id`'s "inbound log (last 20)" has no consumer. Drop it, or point it at a
  debug expander.
- **Gap 33** — Screen 2's crawl cadence is not stored anywhere; §6.2 says it "lives in the Apps Script
  trigger", which the server cannot read. Add a `crawl_cadence_minutes` setting as a display mirror.
  Also: 今日爬取次數 counts *runs*, not items, and 下次爬取 is meaningless for the manual sheet source —
  derive it from the StockX cadence alone and break the two sources out.
- **Gap 34** — 主選單 is a nav item with no screen; redirect `/` to `/approvals`. 新增分組 is a button with
  no modal board; the frontend brief defines it.
- **Gap 35** — Screen 1's 來源 labels are a category error: the source is StockX, the *transport* is
  email. Recommend `StockX（郵件）` / `Google 試算表（手動）`, keeping the enum values as the wire format.
- **Gap 36** — Screen 7 has a 批次操作 button but no checkbox column in its column list.
- **Gap 37** — Screen 5: whether products already in 預設分組 get a move warning. Recommend not.
- **Gap 38** — Screen 8's 批次編輯 button is undefined, exactly like Screen 7's 批次操作.
