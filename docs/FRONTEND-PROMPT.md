# Shoelaxe Dashboard — Frontend Build Brief (Phase 2)

## Read these first

| Document | What it is |
|---|---|
| `docs/PROMPT.md` | The backend brief. §2 domain model, §5 pricing/approval, §6.1 auth, §6.2 the endpoint table. Authoritative for behaviour. |
| `docs/FRONTEND-SCREENS.md` | Per-screen endpoints, fields and states. The document you actually build from. |
| `docs/API-GAPS.md` | The 38 places the design needs something the API does not yet provide. |
| `docs/design-screens.md` | Text of every screen in the .pen file, with the design deltas marked, plus measurements recovered from the HTML export. |
| `docs/DESIGN-TOKENS.md` | Colour, type, radius, spacing and layout tokens read out of the .pen file. Authoritative for styling. |
| `docs/openapi.json` | Generated from the zod schemas the routes validate with. Authoritative for request/response shapes. Currently near-empty — it fills in as backend routes land. |
| `docs/api-examples.json` | Real captured responses — authoritative for what the data actually looks like. **Does not exist yet:** the backend emits the approvals endpoints at its M6 and the rest at M9. Until then, FE-0 works against hand-written fixtures. |
| `~/Documents/projects/shoelaxe/design/shoelaxe-dashboard.pen` | The visual source of truth. Open it; this brief does not replace looking at it. |

Where they disagree: **behaviour** follows `PROMPT.md`, **appearance** follows the `.pen` file, and the
exceptions are the "Design deltas" list at the top of `PROMPT.md` — those are things drawn in the
design that must **not** be built. Re-read that list before starting each screen; it is short and it
will save you building a feature that was cut.

## What you are building

An internal price-management dashboard for a sneaker reseller. Three people use it. It is a dense
data tool, not a marketing site: no SEO, no public pages, everything behind a Google sign-in restricted
to an allow-list of emails.

The one thing to understand before writing any code is the **approval loop**, because most of the UI
exists to serve it. Cost signals arrive hourly from StockX emails and a Google Sheet. The backend
recomputes a selling price from those costs plus a margin, and compares it to the **last human-approved
price**. Inside a ±10% band it auto-approves. Outside the band it is *held*: stored as a pending price,
shown in the approval queue, and **not** published anywhere until a person accepts it. Screen 1 is that
queue, and it is the product.

## Current state of the repo

The app is a `create-next-app` scaffold with the backend growing inside it. Next 16.3.1, React 19,
Tailwind 4, TypeScript strict, pnpm, path alias `@/*` → `./`.

Already there and reusable: `lib/http/errors.ts` (the closed `ERROR_CODES` map — every code and its
canonical HTTP status), `lib/http/envelope.ts` (`{data, meta}` / `{error}`), `lib/http/handler.ts`,
`lib/env.ts`, `lib/log.ts`, vitest with `unit` and `integration` projects, and an eslint rule keeping
`lib/domain/**` pure.

Still bare and yours to replace: `app/layout.tsx` (loads Geist Sans/Mono — the design wants **Inter**
plus **Geist Mono**), `app/page.tsx`, and `app/globals.css` (still the create-next-app placeholder).

**Tailwind 4 has no `tailwind.config.js`.** Tokens go into `@theme` inside `app/globals.css`. That file
is the first thing to write, generated from `docs/DESIGN-TOKENS.md`.

## Stack decisions

These are decided. Each has a reason; if you want to overturn one, overturn the reason.

**Data layer: TanStack Query against `/api/v1` over HTTP.** Not React Server Components calling the
service layer directly. The `/api/v1` endpoints exist *for this frontend*; if server components reached
past them into `lib/services`, those endpoints would have no consumer, `docs/openapi.json` would become
fiction, and the two paths would drift. Going over HTTP keeps one contract and one set of tests. Server
Components are used only for the authenticated shell and layout — everything that loads data is a
client component with a query.

This is also the right shape for the work: the UI polls a queue, tracks a running job's progress,
buffers a multi-field draft, and mutates constantly. That is a client-state problem.

**Typed client: `openapi-typescript` + `openapi-fetch`.** The backend already generates
`docs/openapi.json` and M13 emits `lib/api/schema.d.ts` from it. Wrap `openapi-fetch` once in
`lib/api/client.ts` so paths, params and response bodies are typed from the spec and a backend change
breaks the build rather than production.

**Components: shadcn/ui.** The design's variables are shadcn's vocabulary verbatim — `--background`,
`--card`, `--muted`, `--ring`, `--sidebar-*`. That is the design telling you how to build it. shadcn is
copy-in source rather than a dependency, which matters here because the design deviates from defaults
in ways you will need to edit: a 10–15px type scale, fixed-width table columns, permanently dark
sidebar. Primitives needed: Dialog, DropdownMenu, Popover, Tabs, Tooltip, Select, Checkbox, Switch,
Progress, Collapsible, Command, and Sonner for toasts.

**Tables: TanStack Table (headless) inside shadcn table markup.** Four screens have dense tables with
expandable rows, selection and sorting. Headless keeps the design's fixed column widths intact.

**Forms: react-hook-form + `@hookform/resolvers/zod`, reusing the backend's own schemas from
`lib/schemas/*`.** This is a real advantage of the frontend living in the same app as the API: client
validation and server validation are literally the same zod object, so they cannot disagree. Do not
write a parallel set of form schemas.

**Charts: hand-rolled.** The only chart is Screen 8's "近 6 次變更" — six bars. A charting library for
six bars is not worth the bundle or the theming fight. Plain divs or a small SVG.

**Drag and drop: `dnd-kit`.** Only for image reorder (max 8 items), and chosen over the HTML5 API
because it gives keyboard reordering for free, which the HTML5 API does not.

**Localisation: no i18n framework.** The UI is Traditional Chinese (zh-Hant-HK) and there is no second
locale planned. Put every string in one `lib/i18n/zh-Hant.ts` dictionary anyway — not for translation,
but so copy changes are one file and so the Chinese status vocabulary maps to enum values in exactly
one place. Dates and numbers go through shared formatters, never ad-hoc.

**No mobile.** The design is a 1440px desktop canvas. Target ≥1280 comfortably and stay usable to
1024. Do not invent a responsive breakdown of the Screen 8 drawer; if the viewport is too narrow, let
the content scroll horizontally. Say so in the README rather than half-doing it.

## Route map

Screens 4, 5, 6 and 9 are **intercepted routes**, not client-only state. Each one's state — which
group, which scope, which selection — is worth linking to and refreshing through, and Screen 4 in
particular drives a background job that must survive a page reload.

```
app/
  (auth)/login/page.tsx                                    Screen 0
  auth/callback/route.ts                                   OAuth exchange + allow-list check
  (dash)/layout.tsx                                        shell: nav, pending badge, publishing banner
  (dash)/page.tsx                                          → redirect to /approvals
  (dash)/approvals/page.tsx                                Screen 1 (+ header tooltips)
  (dash)/products/page.tsx                                 Screen 7
  (dash)/products/[sku]/page.tsx                           Screen 8
  (dash)/products/[sku]/@modal/(.)name/page.tsx            Screen 9
  (dash)/products/[sku]/history/page.tsx                   「查看全部紀錄」(no design board)
  (dash)/groups/[groupId]/page.tsx                         Screen 3
  (dash)/groups/[groupId]/@modal/(.)apply/page.tsx         Screen 4 + states B–E
  (dash)/groups/[groupId]/@modal/(.)add-products/page.tsx  Screen 5 + state board
  (dash)/groups/[groupId]/@modal/(.)delete/page.tsx        Screen 6
  (dash)/groups/@modal/(.)new/page.tsx                     「新增分組」(no design board)
  (dash)/settings/page.tsx                                 Screen 2
  (dash)/users/page.tsx  + @modal/(.)new/page.tsx          Screen 10
```

Nav, after the deltas remove 通知中心 and 幫助文檔: **主選單** = 價格監控 · 產品列表 · 產品分組;
**系統** = 系統配置 · 使用者.

`docs/FRONTEND-SCREENS.md` carries the per-screen breakdown: every endpoint each screen reads and
writes, the query parameters it needs, the fields it renders, and the loading / empty / error /
partial / long-running states it must handle. Build from that document, not from this one.

## Status vocabulary

The backend has six `approval_status` values; the UI shows three tabs plus per-row states. Map them in
one place and never inline a Chinese status string:

| `approval_status` | Tab | Row label |
|---|---|---|
| `approved` | 已上架 | 已上架 |
| `pending_new` | 未上架 | 待審核（新產品） |
| `pending_price` | 已上架 | 已上架 · 有待審價格 |
| `needs_margins` | 未上架 | 未設定利潤 |
| `rejected` | 未上架 | 已拒絕 |
| `inactive` | 已下架 | 已下架 |

`pending_price` is the subtle one: the listing **is** live at its old approved price and belongs under
已上架, while a proposed new price waits in the queue. It is not a "not yet listed" state, and treating
it as one is the most likely way to get this screen wrong.

## Formatting

Put every rule below in `lib/format/*` and never format inline. Three screens compute the same price
formula and two compute the same Δ; divergence there produces a support ticket, not a visible bug.

**Money.** HKD only, arriving as numeric **strings** (`"1530.00"`). Convert to integer cents at the
boundary and format only for display — never `parseFloat` into an arithmetic path. Render `HK$1,530`:
thousands separators, no decimals when cents are zero (which is nearly always, since prices land on
x49/x99 by construction), two decimals when a sheet-entered cost carries them. Negatives are
`-HK$110`, never `HK$-110`, and deltas always carry a sign: `+HK$110`. Check that your runtime's ICU
actually emits `HK$` and not a bare `$` — on a page entirely about money, an ambiguous symbol is worse
than a hard-coded prefix.

**`HK$0` and `—` are different things.** Zero renders as `HK$0`; the em dash is reserved exclusively
for unknown or not-applicable. This carries weight on Screen 1, where a null `approved_price` (a brand
new product) and a zero one are both real, both produce no Δ, and mean different things.

**Percentages.** Margin rates are stored `numeric(8,4)` and must never display four decimals — one
decimal in editable contexts (`15.0%`), trimmed in badges and cells (`18%`). Δ percentages always show
one decimal and an explicit sign: `+8.0%`, `-2.9%`.

**Never re-derive Δ from two rounded money strings.** The band decision was made at full precision, so
a row can legitimately read `+10.0%` and still be held, because the true figure was 10.04%. Take
`delta_percent` for display and `delta_percent_exact` for anything else, and **always take the status
badge from the server's stored decision rather than from the number you just rendered.**

Colour Δ by band membership, not by direction. A price moving up is not "good" — both directions are
worth a human's attention, which is the entire premise of the queue. Use a glyph for direction.

**Dates.** Three forms, used deliberately: relative for sync freshness (`剛剛`, `12 分鐘前`,
`3 小時前`), semi-absolute for "last updated" (`今日 09:00`, `昨日 09:00`, `8月12日 09:00`), and
absolute `YYYY-MM-DD HH:mm` in history tables where rows are scanned and compared. 24-hour clock
throughout. Always pass `timeZone: 'Asia/Hong_Kong'` explicitly — the server runs in Singapore and a
bare `toLocaleString()` will quietly be wrong.

**Relative times must not be server-rendered.** Render the absolute form on the server and swap after
mount, or SSR and the client will disagree and React will log a hydration mismatch on every page that
shows a timestamp — which is every page.

**Sizes.** Render verbatim, normalised to one space: `US 9`, `US 7.5`, `US 7Y`, `EU 41`. Never
`US 9.0`. Sorting is the trap: lexicographically `US 10` sorts before `US 7`. Write one collator keyed
on system rank, then numeric value, then the youth flag, and use it in **every** place sizes appear —
Screen 8's tabs and table, Screen 3's expanded rows, Screen 4's failure list, Screen 1's rows.

**Punctuation**, following the design: full-width `·` as the inline separator, `（）` inside Chinese
runs and `()` around pure Latin, `—` for unknown and nothing else.

**Every number is Geist Mono; everything else is Inter.** Prices, sizes, quantities, percentages,
dates, times, SKUs. This one rule carries most of the design's character.

## Component inventory

The .pen file already factors a small design system — `component/Nav Item`, `component/Metric Card`,
`component/Action Button`, `component/Status Badge`, `component/Info Tooltip`, plus `Product Info Card`
and `Listing Images Card` on Screen 8. Mirror those names in `components/` so a conversation about the
design and a conversation about the code use the same words.

**Primitives** (`components/ui/*`, shadcn, retuned to the tokens): Button, Input, Select, Checkbox,
Switch, Dialog, DropdownMenu, Popover, Tooltip, Tabs, Badge, Progress, Collapsible, Command, Table,
Skeleton, Sonner.

Retuning is not optional — shadcn's defaults are built around a 14–16px type scale and `rounded-md`,
and this design runs 10–15px with a 4/6/8/12/999 radius scale. Fix that once in the primitives rather
than overriding at every call site.

**Shared app components:**

| Component | Where it appears | Notes |
|---|---|---|
| `AppShell` / `NavRail` / `NavItem` | every authenticated screen | Fixed 240px, permanently dark, two labelled sections |
| `MetricCard` | Screen 1 | Value, label, and a secondary delta line (`+156 今日`, `88.7% 通過率`) |
| `StatusBadge` | Screens 1, 3, 7, 8 | Driven by the status map, never by an inline string |
| `Money`, `Percent`, `Delta`, `SizeLabel`, `Timestamp` | everywhere | Thin wrappers over `lib/format.ts`. Having these as components rather than function calls is what keeps the mono rule from being forgotten |
| `DataTable` | Screens 1, 3, 7, 8 | TanStack Table wrapper: fixed column widths, expandable rows, selection, empty and loading states in one place |
| `FilterBar` | Screens 1, 7 | Search, source/status selects, date range, group filter |
| `StatusTabs` | Screen 7 | Tabs with counts; note the counts ignore the status filter itself |
| `Pagination` | Screens 1, 7, 8 | Blocked on the pagination question — see Open questions |
| `SaveBar` | Screen 8 | Sticky, renders the draft changeset summary and the three actions |
| `ChangesetList` | Screen 8 (檢視變更) | Renders the same diff the save bar summarises |
| `SourceCard` | Screen 8 drawer | Two variants: StockX read-only, in-house editable. The read-only variant must have no editable control at all |
| `PricePanel` | Screen 8 drawer | Base cost, margin inputs, computed price, the formula preview line |
| `MarginPopover` | Screens 3, 8 | Rate, fixed, live formula preview, and the clear-override action |
| `HistoryTable` | Screen 8 | change_type and actor columns, CSV export |
| `ImageGallery` | Screen 8 | dnd-kit reorder, primary badge, numbered overlays, replace/delete, dropzone |
| `MiniBarChart` | Screen 8 | Six bars, hand-rolled |
| `JobProgress` | Screen 4 | Polling, progress, success summary, partial-failure list, retry |
| `ConfirmDialog` | Screen 6 and destructive actions | Consequence copy is per-use, not generic |
| `PublishingNotice` | wherever publishing copy is suppressed | One component so the disabled-mode wording is consistent |
| `EmptyState`, `ErrorState` | every list | Distinct from each other; "no results for this filter" is not "the request failed" |

## Cross-cutting behaviours

These are the four things that are genuinely hard in this UI. Everything else is layout.

### 1. The Screen 8 draft buffer

Screen 8 does not save on change. It accumulates edits across the whole product — English and Chinese
name, per-size margin overrides, in-house cost and quantity, image order, listing status — and shows a
bar reading **有 2 項變更尚未儲存** with 檢視變更 / 捨棄變更 / 儲存變更. One click then sends **one**
transactional `PATCH /products/:sku`, which either applies everything or nothing.

Build the draft as an explicit diff against the loaded server snapshot, in a reducer — not as a pile of
controlled inputs whose current values you diff at submit time. You need the diff as a first-class
object because 檢視變更 has to *render* it in the same human phrasing the bar summarises:
`US 9 利潤率 10% → 15%（售價 HK$1,420 → HK$1,530）· 上架圖片順序已調整`.

**The trap, and it is a real one.** Clearing a per-size margin override — the "reset to group rule"
action in the size popover — is `margin_override: null`. Leaving it untouched is *absent from the
payload entirely*. The backend distinguishes these with `Object.hasOwn`, and if your draft represents
"cleared" as `undefined` it will serialise away and the clear will silently not happen. So the draft
must model three states per overridable field: untouched, set-to-a-value, and explicitly-cleared. Unit
test this reducer; it is pure logic and it is where the bugs will be.

Also: the save is transactional, so a partial failure means **nothing** changed. Do not optimistically
apply the draft to the table and then try to unwind it. Show the bar as saving, and on failure keep the
draft intact with the error surfaced.

### 2. Publishing is switched off

There is no Shopify access yet, and Phase 1 ships with `PUBLISH_TARGET=none`. Every list response
carries `meta.publishing.enabled`, and the frontend must branch on it from the first screen rather than
having it retrofitted later.

When it is `false`: hide the 上架平台 chips on the product info card, suppress copy that promises
propagation (`圖片變更會同步至已上架平台`, `名稱變更會同步至所有上架通路`, `約需 5 分鐘同步`), disable
any "sync now" affordance, and show one neutral, non-alarming line explaining that external publishing
is not configured yet. It must not read as an error — nothing is broken, the feature is not enabled.

Approving a price still works, still updates the live price, and still queues the publish for later.
The queue is the backlog that will be replayed when Shopify is connected. So do **not** describe
approval as "publishing" in any copy that is visible while this flag is false.

### 3. Long-running jobs

Group batch-apply (Screen 4) returns **202** with a job id and is processed by a background worker.
Screen 4's states B–E are that job's lifecycle: scope preview, running with `42 / 96` progress, success
summary, and partial failure with a per-size list and a retry action.

Poll `GET /api/v1/jobs/:id` about once a second while the job is running and stop on a terminal status.
The endpoint is a **pure read** — polling it does not drive the work, so a closed tab does not stall the
job and reopening the modal must be able to pick up an already-running job rather than starting a second
one. Five rapid clicks on 套用 return the *same* job id by design; make the button idempotent-safe
rather than merely disabled.

Partial failure is a first-class state, not an error toast. Render the failed sizes, keep the successes,
and wire 重試失敗項目 to the retry endpoint, which seeds a new job from the failures only.

### 4. Auth

Supabase Google OAuth through `@supabase/ssr`. A session is valid **only** if its email is in
`allowed_users`; there is no domain rule and there are no roles — anyone who can sign in can approve.

Screen 0 currently reads 僅限 @shoelaxe.com 網域且已授權的管理員帳號. That is a **delta**: there is no
domain restriction. Change the copy to describe an allow-list.

Two failure modes to handle distinctly, because they look the same to a user and are not:
`unauthenticated` (401, no session) sends you to the login screen; `not_allowed` (403, signed in with a
Google account nobody added) must **sign the user out** and explain why, or they will sit on a redirect
loop being bounced between Google and a blank page.

## Errors

`lib/http/errors.ts` is a closed union with one canonical status per code, and every endpoint documents
the exact subset it can return. Use that: a switch over `ErrorCode` with a real message for each, not a
generic "something went wrong" toast.

| Class | Handling |
|---|---|
| `validation_failed` | Field-level, from `details.issues`. Never a toast — the user is looking at the field. |
| `unauthenticated`, `session_expired` | Attempt refresh once, then redirect to login. |
| `not_allowed` | Sign out, explain, do not retry. |
| `conflict`, `not_pending`, `job_already_running`, `default_group_immutable`, `listing_inactive` | Inline, next to the control. These mean the world moved under the user — refetch and re-render rather than just complaining. |
| `source_read_only` | Should be unreachable: the StockX source card must be non-editable in the UI. If you ever see it, that is a frontend bug, not a user error. |
| `not_found` | Usually a stale link; offer the way back to the list. |
| `internal_error`, `service_unavailable` | Toast with a retry, and surface `request_id` — it is in the error envelope precisely so a user can quote it. |

## Milestones

Ordered so the frontend is never waiting on an endpoint. Backend order is **M6** auth + approvals →
**M9** remaining reads → **M10** writes → **M11** the job runner → **M12** publishing.

| | Deliverable | Backend | Size |
|---|---|---|---|
| **FE-0** | Tokens into `globals.css`, Inter + Geist Mono, app shell and nav, the typed API client, the formatters, the size collator, the status maps, the `ErrorCode` → Chinese message map (all 33), skeleton/empty/error primitives, and `JobProgress` built against a fixture | none — starts immediately | M |
| **FE-1** | Screen 0, the OAuth callback, the allow-list gate, the nav pending badge | M6 | S |
| **FE-2** | **Screen 1 read-only.** The queue, filters, metric cards | M6 | M |
| **FE-3** | Screens 7, 8, 3, 5, 6 **read-only** — tables, size accordion, source cards, history, images, the bar chart. `meta.publishing.enabled` gating lands here | M9 | L |
| **FE-4** | All writes: Screen 1's actions, Screen 8's draft and images, Screens 9, 2, 10, 3 inline, 5 add-members, 6 delete, 7 bulk | M10 | L |
| **FE-5** | Screen 4 states A–E, and wiring `JobProgress` into the settings recompute, group delete, member move and bulk assign | M11 | M |
| **FE-6** | Publishing affordances, un-gated | M12 | S |

**The important sequencing point:** Screen 1 is fully *readable* at M6 but its 確認 / 拒絕 buttons are
M10 writes. Ship it read-only at FE-2 with the action column disabled rather than holding the screen
back — the whole reason M6 is deliberately thin is to make a held price visible early.

**Three asks for the backend, each of which buys a milestone of parallelism:**

1. **Pull `GET /settings` and `GET /settings/allowed-users` into M9.** They are currently only in
   M10's write half, which means Screens 2 and 10 cannot be built *at all* — not even their layout —
   until writes land. They are a one-row and a six-row read.
2. **Land `GET /jobs/:id` in M9**, alongside `GET /jobs`. The plan already describes it as a pure
   read. Screen 4 is the most stateful screen in the product and is currently scheduled last; with
   the read available early, states C/D/E can be built against seeded rows two milestones sooner.
3. **Give `GET /jobs` `kind`, `scope_key` and `status` filters**, or Screen 4 cannot rehydrate a
   running job after a reload and Screen 3 cannot show its "apply in progress" banner.

## Testing

Concentrated where the risk is, not spread for coverage.

- **Unit:** the draft reducer — especially cleared-versus-untouched — plus every formatter, the size
  collator, the status maps and the Δ colour rule. Pure logic, and where correctness actually lives.
- **Component:** the approval row, the save bar and the job progress panel, each driven from
  `docs/api-examples.json` rather than hand-written fixtures, so a backend shape change breaks a test.
- **End-to-end (Playwright), six flows:** a non-allow-listed user gets bounced and signed out; approve
  a held price and watch it leave the queue; reject one and confirm the old price survives; save a
  multi-field product draft in a single commit; run a group apply through to partial failure and
  retry; and load every screen with `publishing.enabled = false`, asserting no sync copy appears.

Do not chase coverage on layout components.

## Decisions needed before FE-3

`docs/API-GAPS.md` lists all 38 places where the design needs something the endpoint table does not
provide, with a proposed shape for each. Most are additive and uncontroversial. **Four are decisions,
not omissions**, and they should be settled before anyone builds against them:

1. **Does a group batch-apply bypass the approval band?** (Gap 1.) A margin change alters the listing
   price, and §5 says any price outside the band is *held*. Taken literally, applying a new margin to
   96 sizes changes nothing live and instead files 96 rows in the approval queue — while Screen 4's
   success state reports 「平均售價變化 HK$1,416 → HK$1,420 · 完成」 as though it took effect. §5
   already grants exactly this bypass to manual price entry, on the grounds that a human doing it *is*
   the approval, and §4 already defines the actor label 分組批次更新. The recommendation is that
   human-initiated batch operations bypass the band — but it must be written into §5 rather than
   assumed by whoever implements it first.
2. **Every formula preview in the design omits the rounding step.** (Gap 2.) Screen 2 says cost
   HK$1,200 → HK$1,344; under the x49/x99 rule declared on that same screen the answer is HK$1,349.
   Screen 3 and Screen 8 have the same error. The arithmetic shown is right and the result is wrong.
   Previews must render both steps, and the API should return `raw_price` so three screens don't each
   re-implement rounding in JavaScript and drift.
3. **Pagination is specified two ways.** (Gap 3.) The design shows totals and page numbers in three
   places; §6.2 specifies cursor pagination, which can produce neither.
4. **`pending_price` has no home in §2's three-way listing taxonomy** (Gap 4), yet it is one of the
   six enum values — and it is the state where a listing is *live at its old price* with a new one
   held. Getting this wrong mislabels the most important rows in the product.

Two smaller ones worth deciding early because they change copy on several screens: 總庫存 must be
named in-house-only or it silently overstates stock by exactly the size count, and while publishing is
disabled the label 已上架 asserts a live store that does not exist.
