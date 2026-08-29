# Design screen text — shoelaxe-dashboard.pen

Extracted from https://app.pen.dev/s/obg-2MWJixf2f-U4wn0VaduWdQtKfTOuMQRaEFFEg_I (2026-08-23; Screen 4 States re-checked after floor-price removal).
Text-only dump per screen (` | ` separates text nodes). See docs/PROMPT.md "Design deltas"
for the parts that must NOT be built as drawn.

Shared nav: 主選單 | 價格監控 | 產品列表 | 系統配置 | 產品分組 | 使用者 | 系統 | 通知中心 | 幫助文檔

## Screen 0 — Google 登入
登入管理後台 | 使用公司 Google 帳號登入，無需另設密碼 | 使用 Google 帳號登入 | 僅限 @shoelaxe.com 網域且已授權的管理員帳號。 | 沒有存取權限？ | 聯絡系統管理員 | 登入即表示您同意服務條款與隱私政策
[DELTA: no domain guard — allow-list only]

## Screen 1 — 價格監控與審批
8 待處理 | 總爬取數量 3,847 (+156 今日) | 待審核 284 需要處理 | 已確認 3,412 (88.7% 通過率) | 已拒絕 151 (3.9% 拒絕率) | 搜尋產品名稱或 SKU… | 全部來源 | 全部狀態 | 最近 7 天 | 欄位: 產品名稱 | SKU | 尺寸 | 來源(電子郵件/手動輸入) | 最新爬取價格 | 上次爬取價 | 差異% | 更新上架價格 | 狀態(超出閾值/正常範圍/低於閾值) | 操作(確認/拒絕/無需處理) | 例: Air Jordan 1 Chicago 555088-101 US 9 HK$1,890 ← HK$1,750 +8.0% → HK$2,049 超出閾值 | 顯示 1–6 筆，共 128 筆 | 每頁 20 筆
[size column confirmed 2026-08-23; DELTA: Δ% computed on listing price vs approved price]

## Screen 1 States — 表頭資訊提示 (hover tooltips)
爬取價格: 最新回報的市場價格，尚未加上任何加價。 | 上次爬取價: 上次爬取到的市場價格，目前上架價格以此為基準加上分組加價。 | 上架價格: 已套用分組加價（及尾數進位）後的實際上架售價。

## Screen 2 — 系統配置
價格閾值設定: 上限閾值 10% | 下限閾值 8% | 超出範圍自動標記異常，需人工審核；範圍內自動確認 | 儲存設定
新產品預設利潤: 已啟用 | 預設利潤率 12% | 預設固定加價 HK$0/每雙 | 售價 = 成本 × (1 + 12%) + HK$0 | 範例 成本 HK$1,200 → HK$1,344 | 僅在產品沒有任何利潤設定時生效；分組頁標記「使用系統預設」；售價仍經尾數進位。
價格尾數進位: 尾數 ≤ 49 → 進位至 49 ($1,901→$1,949) | 尾數 ≤ 99 → 進位至 99 ($1,951→$1,999) | 於分組加價後執行；關閉時不調整。
爬取排程: 爬取頻率 每 60 分鐘 | 上次爬取 | 下次爬取 | 今日爬取次數 28 次 | 爬蟲服務運行中

## Screen 3 — 產品分組與定價策略
新增分組 | 6 組: 預設分組(預設) 24 產品 · 18% + HK$0 | Jordan 1 系列 12 產品 18%+0 | Yeezy Boost 22%+150 | Nike Dunk 15%+50 | New Balance 20%+0 | Air Force 1 12%+80
選中分組: 12 個產品 · 96 個尺寸 · 分組規則 18% + HK$0 | 批次更新利潤 | 刪除 | 新增產品
表格: 產品名稱/SKU | 成本 | 利潤率 | 固定加價 | 售價 | 尺寸差異 badge 顯示範圍 (10–20%, HK$100–200, HK$1,420–1,640)
展開尺寸明細 · 每個尺寸可設定獨立利潤 | 套用至所有尺寸 | 每列: 尺寸 庫存 利潤率 固定加價 售價 | 編輯中 inline: HK$1,200 × (1 + 15%) + HK$150 = HK$1,530 取消/儲存
badges: 已覆寫 | 使用系統預設

## Screen 4 — 編輯分組彈窗 (批次更新分組利潤)
套用範圍: 全部尺寸(覆寫所有個別設定, 96 項) | 僅使用分組規則的尺寸(保留個別覆寫, 78 項) | 僅已覆寫的尺寸(重設為新的分組規則, 18 項)
更新內容: 利潤率 / 固定加價 — 僅更新已勾選的欄位，取消勾選保持原值，可同時使用
預覽: 以成本 HK$1,200 計算 … 目前售價 → 更新後 | 受影響項目 | 套用至 N 個項目

## Screen 4 States
狀態 B: 範圍=僅分組規則 (18 個已覆寫尺寸保持不變，僅更新 78 個)
狀態 C: 套用中 進度 42 / 96
狀態 D: 套用成功 | 更新尺寸數 96 | 覆寫的個別設定 18 | 平均售價變化 HK$1,416 → HK$1,420 | 完成
狀態 E: 部分項目失敗 | 12 個尺寸更新失敗 | 84 個尺寸已成功更新。以下尺寸的未套用變更。[copy bug: clause missing] | 每列: SKU + 尺寸清單 (無原因標籤) | 重試失敗項目

## Screen 5 — 新增產品彈窗 (加入分組)
搜尋產品名稱或 SKU | 篩選: 全部 / 未分組 / 其他分組 | 全選 | 已選擇 N 個 | 每列: 名稱 SKU 成本 | 已屬於 X 系列 標記 | 新增後將套用分組利潤率 18% | 新增 N 個產品

## Screen 5 States
選取已屬於其他分組: 將移出 Nike Dunk 系列 / 將移出 Yeezy Boost 系列 | 每個 SKU 只能屬於一個分組，移入後改用新分組利潤率重新計算售價 | 移動並新增 N 個產品

## Screen 6 — 刪除分組確認彈窗
刪除「Jordan 1 系列」？ | 分組內的產品不會被刪除，將自動歸入「預設分組」 | 產品將改用預設分組的利潤率重新計算售價 | 此分組的定價規則將被永久刪除 | 此操作無法復原 | 取消 / 刪除分組

## Screen 7 — 產品列表
匯出清單 | 搜尋 SKU 編號 | tabs: 全部 342 / 未上架 28 / 已上架 296 / 已下架 18 | 分組：全部 | 排序：最新匯入 | 批次操作
欄位: 產品名稱/SKU | 分組 | 尺寸數 | 利潤 (18% + HK$100 或 —) | 售價 | 狀態 | 操作(查看詳情) | 分頁

## Screen 8 — 產品詳情
麵包屑 產品列表 / Jordan 1 系列 / Air Jordan 1 Retro High OG「Chicago」(名稱可編輯)
儲存列: 有變更尚未儲存 | 草稿 | 捨棄變更 | 儲存變更
尺寸價格走勢: 每個尺寸可有獨立利潤設定 | 近 6 次變更 bar chart | 尺寸 tabs 全部/US 7…US 11 | US 9 目前售價與庫存 HK$1,530 (+HK$110 · 7.7%) 庫存 2 雙 | 目前利潤設定 HK$1,200 × (1 + 15%) + HK$150
各尺寸庫存與定價: 7 個有庫存尺寸 · 總庫存 26 雙 | 批次編輯 | 每列展開:
  自有庫存(可編輯) 店內庫存 Google Sheet · 今日 09:00 更新 | 數量 stepper | 成本/雙 HK$1,200
  外部市場(唯讀同步) StockX 自動同步 · 12 分鐘前 | 成本 HK$1,380 | 市場最低價 HK$1,300 · 較昨日 -2.9% [DELTA: 掛單數/新增價格來源 removed]
  統一售價 套用於全部 2 個來源: 基準價 HK$1,300 (來自最新價格變動) | 百分比利潤 15.0% (=+HK$195) | 固定利潤 HK$35 | 售價 HK$1,530 | 對自有成本毛利 +HK$330（27.5%） | 套用新售價
  價格變動紀錄 (per size): 時間 | 來源(系統同步/手動調整+姓名) | 價格 | Δ | Δ% | 分頁 1/4 · 18 筆
  說明: 左欄成本與庫存只影響該來源；售價只有一個，由基準價與利潤設定計算後套用至所有來源。外部來源成本由系統同步，無法修改。
尺寸設定 popover (US 7.5): 利潤率 10% | 固定加價 HK$100 | 公式預覽 | 取消/確認
價格變更紀錄 (product level): 欄位 時間 | 尺寸 | 變更項目(利潤率/固定加價/成本/上架狀態/利潤來源) | 變更內容(10% → 15% 等) | 售價變化 | 來源(手動編輯+姓名/分組批次更新/爬取更新/系統自動) | 全部尺寸 filter | 匯出 | 查看全部紀錄
上架圖片: 5 / 8 張 | 主圖 badge | 拖曳排序，每張可替換或刪除 | 拖曳圖片至此或點擊上傳 | JPG/PNG · 建議 1200×1200 · 單張 ≤ 2MB | 圖片變更會同步至已上架平台
產品資訊 card: 上架狀態 已上架 | dropdown: 已上架(價格監控中，價格變更需經審批) / 已下架(從所有平台移除，保留價格與圖片設定) / 暫停銷售 [DELTA: removed] | 總庫存 26 雙 | 上架平台 StockX · 店內 [DELTA: Shopify only] | 最後更新

## Screen 9 — 編輯產品名稱彈窗
英文名稱 (EN) 26/120 | 中文名稱（繁體） 25/120 | 唯讀參考: StockX 上架名稱 / 內部備註·別名 | SKU 與尺寸不可修改，名稱變更後約需 5 分鐘同步 | 取消 / OK

## Screen 10 — 新增使用者帳號
帳號資料: 姓名* (顯示於系統操作紀錄) | 電子郵件 (將作為登入帳號，需有效且未被使用) | 建立後將發送邀請信 [DELTA: no invite email] | 取消 / 建立帳號
現有使用者: 共 6 位，移除後立即失去存取權限 | 搜尋姓名或電子郵件 | 每列: 姓名 email 移除

## 改版提案 boards (Accordion Improvement / Column Spacing / Listing Images Card)
Two alternative layouts (A 售價主軸·分層卡片 / B 定價側欄·雙欄) for the US 9 per-size drawer.
Same data model as Screen 8; concept A mentions 四捨五入至十位 — ignore, rounding rule is
the x49/x99 setting from Screen 2. Reference only; Screen 8 is the canonical layout.

## Screen 8 — detail recovered from the HTML+Tailwind export (2026-08-23)

Fuller than the text dump above; captured from the .pen export, so these are the exact strings.

**Save bar:** `有 2 項變更尚未儲存` · `草稿` · summary line
`US 9 利潤率 10% → 15%（售價 HK$1,420 → HK$1,530）· 上架圖片順序已調整。儲存後才會同步至已上架平台。`
· buttons `檢視變更` / `捨棄變更` / `儲存變更`. Note **檢視變更** was missing from the text dump — the
draft has to be renderable as an itemised changeset, not just counted.

**Per-size table rows:** 尺碼 · 庫存 (`6 雙`) · 成本 (`HK$1,200`) · 利潤 (`10% + HK$100`) · 售價
(`HK$1,420`). Margins vary per size in the mock: US 7–8 at 10%+100, US 9–9.5 at 15%+150,
US 10–11 at 20%+200.

**Expanded size drawer — `US 9 的價格來源`, `2 個來源`, `最後同步 12 分鐘前`, `重新整理`.**
Columns: 來源 | 類型 | 庫存 / 供應 | 價格 | 與售價差異 | 更新時間.
- StockX row: 類型 `最低要價` + `市場價` badge · `3 筆掛單` · `HK$1,485` · `-HK$45` `-2.9%` · `12 分鐘前`
  — [DELTA: 掛單數 removed; StockX quantity is constant 1]
- In-house row: `店內庫存` · `Google Sheet · 旺角店` · `自有庫存` badge · `2 雙` · `HK$1,530` · `持平`
  · `今日 09:00`
- Footer note: `售價由成本與利潤設定計算；來源價格僅供監控參考，不會自動覆寫售價。自有庫存可直接調整，儲存後寫回`

**價格變更紀錄 (per size):** `US 9 · 共 12 筆`, controls `全部尺寸` / `匯出`.
Columns: 時間 | 尺寸 | 變更項目 | 變更內容 | 售價變化 | 來源.
變更項目 values seen — `利潤率`, `固定加價`, `成本`, `上架狀態`, `利潤來源` — map 1:1 onto
`price_history.change_type`. 來源 values — `手動編輯` + a person's name (陳小明, 李美華),
`分組批次更新` + 系統, `爬取更新` + 系統, `系統自動` + 系統 — map onto `actor_label`.
售價變化 renders old → new with the new value coloured by direction (`#004D1A` up, `#8C1C00` down).
Footer: `顯示最近 6 筆變更，共 12 筆` · `查看全部紀錄`.

**上架圖片:** `5 / 8 張` · `主圖` badge on the first · numbered overlays 2–5 · a `順序已調整` warning
badge once reordered · dropzone `拖曳圖片至此或點擊上傳` with
`JPG / PNG · 建議 1200×1200 · 單張 ≤ 2MB` · note `圖片變更會同步至所有已上架平台，約需 5 分鐘生效。`

## App shell — measured from the export

- Canvas 1440px. Sidebar **240px, `#0F1117`, dark in both themes**, `p-4`; section labels 主選單 and
  系統; nav rows `p-3` with a 20px icon and label; active row filled `#1E293B` with white text.
- Nav: 價格監控 · 產品列表 · 系統配置 · 產品分組 · 使用者 ‖ 系統: 通知中心 · 幫助文檔
  [DELTA: the last two are out of scope for v1].
- White topbar `p-[0_32px]`; content area `p-5`; Screen 8 splits into a main column and a 400px rail.
- Modals 560px: header (title + subtitle + 18px close), `p-4` body, footer with ghost 取消 and a
  primary action. Scrim `#11111199`.
- Screen 9 modal body: two labelled inputs with helper text (`用於 StockX 上架與對外顯示`,
  `用於店內標籤與內部報表`), a `顯示預覽` block on `#F2F3F0`, and an info callout on `#DFDFE6`.
