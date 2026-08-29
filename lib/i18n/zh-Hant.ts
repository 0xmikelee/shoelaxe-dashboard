import { RELATIVE_TIME } from "@/lib/format/date";
import { EM_DASH } from "@/lib/format/punct";

/**
 * Every UI string, in one file. There is no i18n framework and no second locale planned — this
 * exists so a copy change is one file, and so the Chinese status vocabulary maps to enum values in
 * exactly one place. zh-Hant (Traditional), Hong Kong.
 *
 * Two rules for anyone adding to it:
 *
 *  1. **Everything that promises external propagation goes under `publishing`, and nothing else
 *     does.** A Playwright flow loads every screen with `meta.publishing.enabled === false` and
 *     asserts that no string in that namespace appears anywhere on the page. Copy shown *because*
 *     publishing is off lives under `publishingDisabled`, which is the opposite assertion.
 *  2. `publishing.*` values are plain strings, never functions, so that test can iterate them. The
 *     rest of the dictionary may use functions for parameterised copy.
 */
export const zhHant = {
  app: {
    name: "Shoelaxe",
    title: "Shoelaxe 價格管理後台",
    /** <meta name="description">. Never indexed — the tool is behind an allow-list. */
    description: "球鞋價格監控、審批與上架管理後台。",
    /** Only ever visible when the app runs with NEXT_PUBLIC_API_MOCKS=1. */
    mocksStarting: "正在啟動模擬資料…",
    mocksFailed: "模擬資料未能啟動，以下內容將直接呼叫後端 API。",
  },

  common: {
    save: "儲存",
    saveChanges: "儲存變更",
    cancel: "取消",
    confirm: "確認",
    ok: "確定",
    close: "關閉",
    delete: "刪除",
    remove: "移除",
    edit: "編輯",
    add: "新增",
    apply: "套用",
    retry: "重試",
    reload: "重新載入",
    refresh: "重新整理",
    export: "匯出",
    search: "搜尋",
    selectAll: "全選",
    all: "全部",
    loading: "載入中…",
    saving: "儲存中…",
    unknown: EM_DASH,
    /** 顯示 1–6 筆，共 128 筆 */
    showingRange: (from: number, to: number, total: number) =>
      `顯示 ${from}–${to} 筆，共 ${total} 筆`,
    total: (n: number) => `共 ${n} 筆`,
    perPage: (n: number) => `每頁 ${n} 筆`,
    selectedCount: (n: number) => `已選擇 ${n} 個`,
    pairs: (n: number) => `${n} 雙`,
    sizes: (n: number) => `${n} 個尺寸`,
    products: (n: number) => `${n} 個產品`,
    page: (current: number, totalPages: number) => `第 ${current} / ${totalPages} 頁`,
    previousPage: "上一頁",
    nextPage: "下一頁",
    /** Shown on a control that exists but whose endpoint has not shipped yet. */
    notYetAvailable: "此操作尚未開放",
    disabled: "已停用",
    /** The 錯誤代碼 line under a toast. The envelope carries it so a user can quote it. */
    requestId: (id: string) => `錯誤代碼 ${id}`,
  },

  nav: {
    mainSection: "主選單",
    systemSection: "系統",
    approvals: "價格監控",
    products: "產品列表",
    groups: "產品分組",
    settings: "系統配置",
    users: "使用者",
    pendingBadgeLabel: "待處理筆數",
    /** The rail's accessible name. Screen-reader only; there is no visible 「主要導覽」 heading. */
    railLabel: "主要導覽",
  },

  shell: {
    signOut: "登出",
    account: "帳號",
    /** 403 on a signed-in account that nobody added. Distinct from an expired session. */
    notAllowedTitle: "沒有存取權限",
    notAllowedBody: "此 Google 帳號不在允許名單內，已為您登出。請聯絡系統管理員加入名單。",
    sessionExpired: "登入狀態已過期，請重新登入。",
  },

  /**
   * The two generic list states, shared by every screen that renders a table. Deliberately worded
   * apart: "nothing matched" and "we could not load this" are different facts and must not borrow
   * each other's language. A screen with something better to say passes its own copy instead.
   */
  errorState: {
    title: "載入失敗",
    description: "無法載入資料，請重試。若持續發生，請聯絡系統管理員。",
  },

  emptyState: {
    title: "沒有資料",
  },

  auth: {
    title: "登入管理後台",
    subtitle: "使用公司 Google 帳號登入，無需另設密碼",
    signInWithGoogle: "使用 Google 帳號登入",
    /** Delta: there is no domain rule. The guard is an allow-list of individual addresses. */
    allowList: "僅限已加入允許名單的 Google 帳號。",
    noAccess: "沒有存取權限？",
    contactAdmin: "聯絡系統管理員",
    terms: "登入即表示您同意服務條款與隱私政策",
    signingIn: "登入中…",
    continueAsDev: "以模擬資料進入後台",
    providerError: "Google 登入未完成，請再試一次。",
    invalidApiKey: "無法完成登入：Supabase API 金鑰無效。請確認 .env.local 的 anon key 與此專案相符，然後重啟開發伺服器。",
    providerDisabled: "Google 登入尚未在此專案啟用。請在 Supabase Authentication → Providers 開啟 Google。",
    /** "We cannot verify you right now" is not "you do not have access". */
    guardUnavailable: "目前無法確認您的存取權限，請稍後再試。",
  },

  approvals: {
    title: "價格監控與審批",
    pendingChip: (n: number) => `${n} 待處理`,
    metrics: {
      totalCrawled: "總爬取數量",
      crawledToday: (n: number) => `+${n} 今日`,
      pending: "待審核",
      pendingHint: "需要處理",
      confirmed: "已確認",
      passRate: (rate: string) => `${rate} 通過率`,
      rejected: "已拒絕",
      rejectionRate: (rate: string) => `${rate} 拒絕率`,
      /** Gap 8: lifetime totals with a 今日 delta. They do not follow the table filters. */
      scopeNote: "累計數字，不受下方篩選影響",
    },
    filters: {
      searchPlaceholder: "搜尋產品名稱或 SKU…",
      allSources: "全部來源",
      allStatuses: "全部狀態",
      dateRange: "時間範圍",
      clear: "清除篩選",
    },
    columns: {
      productName: "產品名稱",
      sku: "SKU",
      size: "尺寸",
      source: "來源",
      cost: "最新爬取價格",
      previousCost: "上次爬取價",
      delta: "差異%",
      newPrice: "更新上架價格",
      approvedPrice: "目前上架價格",
      status: "狀態",
      actions: "操作",
      pendingSince: "待審時間",
    },
    /**
     * Gap 6: the drawn tooltips are factually wrong under §5. The pricing base is `base_cost` — the
     * most recent applied cost from *either* source — not "the previous crawled market price", and
     * Δ is measured on the price pair, not between two costs.
     */
    tooltips: {
      cost: "最新回報的市場價格或成本，尚未加上任何利潤。",
      previousCost: "同一來源上次回報的成本，僅供比較，不是定價基準。",
      newPrice: "以基準成本套用利潤設定（及尾數進位）後計算的上架售價。",
      delta: "新售價與目前上架價格的差異，超出閾值時需人工審核。",
      baseCost: "基準成本為兩個來源中最近一次套用的成本。",
    },
    actions: {
      approve: "確認",
      reject: "拒絕",
      /** Auto-approved rows have no action; the row still shows why. */
      noActionNeeded: "無需處理",
      approving: "確認中…",
      rejecting: "拒絕中…",
      approved: "已確認",
      rejected: "已拒絕",
      rejectReasonLabel: "拒絕原因（選填）",
    },
    empty: {
      /** Two distinct empty states: they call for different next actions. */
      noResultsTitle: "沒有符合篩選條件的項目",
      noResultsBody: "調整搜尋字詞或篩選條件後再試。",
      nothingPendingTitle: "目前沒有待審核的價格",
      nothingPendingBody: "價格在閾值範圍內時會自動確認，超出範圍才會出現在這裡。",
    },
    newProductBadge: "新產品",
    supersededBadge: "已被取代",
  },

  settings: {
    title: "系統配置",
    thresholds: {
      title: "價格閾值設定",
      up: "上限閾值",
      down: "下限閾值",
      hint: "超出範圍自動標記異常，需人工審核；範圍內自動確認。",
    },
    defaultMargin: {
      title: "新產品預設利潤",
      enabled: "已啟用",
      rate: "預設利潤率",
      fixed: "預設固定加價",
      fixedUnit: "每雙",
      hint: "僅在產品沒有任何利潤設定時生效；分組頁標記「使用系統預設」。",
      /**
       * Gap 2: every formula preview in the design omits the rounding step and therefore shows the
       * wrong answer. Both steps are rendered, always.
       */
      formula: (rate: string, fixed: string) => `售價 = 成本 × (1 + ${rate}) + ${fixed}`,
      example: (cost: string, raw: string, rounded: string) =>
        `範例 成本 ${cost} → ${raw} → 尾數進位 ${rounded}`,
      exampleNoRounding: (cost: string, raw: string) => `範例 成本 ${cost} → ${raw}`,
    },
    rounding: {
      title: "價格尾數進位",
      low: "尾數 ≤ 49 → 進位至 49（$1,901 → $1,949）",
      high: "尾數 50–99 → 進位至 99（$1,951 → $1,999）",
      hint: "於利潤計算後執行；關閉時不調整。",
    },
    crawl: {
      title: "爬取排程",
      cadence: "爬取頻率",
      cadenceValue: (minutes: number) => `每 ${minutes} 分鐘`,
      /** Gap 33: the cadence lives in the Apps Script trigger; this is a display mirror. */
      cadenceHint: "此為顯示用設定，實際排程由 Google Apps Script 觸發器控制。",
      lastRun: "上次爬取",
      nextRun: "下次爬取",
      runsToday: "今日爬取次數",
      runsTodayValue: (n: number) => `${n} 次`,
      /** Two separate degraded indicators: the trigger stopped versus the worker died. */
      crawlerHealthy: "爬蟲服務運行中",
      crawlerStale: "爬蟲已停止回報，請檢查 Apps Script 觸發器。",
      workerHealthy: "背景服務運行中",
      workerStale: "背景服務未運行，批次作業不會被處理。",
      manualOnly: "手動來源，無排程",
    },
    saveButton: "儲存設定",
    saved: "設定已儲存",
    /** Gap 7: changing a threshold, the default margin or rounding re-prices every default listing. */
    recomputeNotice: "變更後需要重新計算所有使用系統預設利潤的售價。",
    unsavedGuard: "有尚未儲存的變更，確定要離開嗎？",
  },

  groups: {
    title: "產品分組與定價策略",
    newGroup: "新增分組",
    groupCount: (n: number) => `${n} 組`,
    defaultBadge: "預設",
    productCount: (n: number) => `${n} 產品`,
    rule: (rate: string, fixed: string) => `${rate} + ${fixed}`,
    header: {
      summary: (products: number, sizes: number) => `${products} 個產品 · ${sizes} 個尺寸`,
      rule: (rule: string) => `分組規則 ${rule}`,
      batchUpdate: "批次更新利潤",
      delete: "刪除",
      addProducts: "新增產品",
    },
    columns: {
      product: "產品名稱 / SKU",
      cost: "成本",
      marginPercent: "利潤率",
      marginFixed: "固定加價",
      price: "售價",
    },
    variesBadge: "尺寸差異",
    overriddenBadge: "已覆寫",
    defaultMarginBadge: "使用系統預設",
    expandHint: "展開尺寸明細 · 每個尺寸可設定獨立利潤",
    applyToAllSizes: "套用至所有尺寸",
    sizeColumns: {
      size: "尺寸",
      quantity: "庫存",
      marginPercent: "利潤率",
      marginFixed: "固定加價",
      price: "售價",
    },
    /** Both steps, per Gap 2. The design's inline preview stops at the un-rounded figure. */
    inlineFormula: (cost: string, rate: string, fixed: string, price: string) =>
      `${cost} × (1 + ${rate}) + ${fixed} = ${price}`,
    clearOverride: "重設為分組規則",
    applyRunning: "此分組正在執行批次更新，完成前無法再次套用。",
    newGroupModal: {
      title: "新增分組",
      nameLabel: "分組名稱",
      namePlaceholder: "例如 Jordan 1 系列",
      marginPercentLabel: "利潤率",
      marginFixedLabel: "固定加價",
      submit: "建立分組",
    },
  },

  groupApply: {
    title: "批次更新分組利潤",
    scopeTitle: "套用範圍",
    scopeCount: (n: number) => `${n} 項`,
    updateTitle: "更新內容",
    updateHint: "僅更新已勾選的欄位，取消勾選保持原值，可同時使用。",
    marginPercent: "利潤率",
    marginFixed: "固定加價",
    previewTitle: "預覽",
    previewBasis: (cost: string) => `以成本 ${cost} 計算`,
    previewCurrent: "目前售價",
    previewNext: "更新後",
    affected: "受影響項目",
    submit: (n: number) => `套用至 ${n} 個項目`,
    submitDisabledHint: "請至少勾選一個要更新的欄位。",
    /** State B's copy: the two counts have to be named or the radio reads as destructive. */
    keepsOverrides: (kept: number, updated: number) =>
      `${kept} 個已覆寫尺寸保持不變，僅更新 ${updated} 個。`,
    queued: "排隊中，等待背景服務接手…",
    running: "套用中",
    progress: (done: number, total: number) => `${done} / ${total}`,
    successTitle: "套用成功",
    updatedCount: "更新尺寸數",
    clearedCount: "覆寫的個別設定",
    averagePrice: "平均售價變化",
    done: "完成",
    /** Partial failure is a first-class state, not an error toast. */
    partialTitle: "部分項目失敗",
    partialCount: (n: number) => `${n} 個尺寸更新失敗`,
    /** The design reads 以下尺寸的未套用變更, which is a broken sentence. */
    partialBody: (ok: number) => `${ok} 個尺寸已成功更新。以下尺寸未套用變更。`,
    retryFailed: "重試失敗項目",
    failedTitle: "作業失敗",
    failedBody: "整個批次未執行，沒有任何尺寸被更新。",
    stalled: "背景服務未運行，作業已停止進度。",
    dismissKeepsRunning: "關閉視窗不會中斷作業，可在分組頁查看進度。",
  },

  groupMembers: {
    title: "新增產品",
    searchPlaceholder: "搜尋產品名稱或 SKU",
    filterAll: "全部",
    /** Gap 17: 未分組 does not exist — every product is in exactly one group. */
    filterDefaultGroup: "預設分組",
    filterOtherGroups: "其他分組",
    columns: { product: "產品名稱", sku: "SKU", cost: "成本" },
    belongsTo: (group: string) => `已屬於 ${group}`,
    willMoveFrom: (group: string) => `將移出 ${group}`,
    moveWarning: "每個 SKU 只能屬於一個分組，移入後改用新分組利潤率重新計算售價。",
    willApplyRule: (rate: string) => `新增後將套用分組利潤率 ${rate}`,
    /** Select-all is page-scoped only; an unbounded one silently moves the catalogue. */
    selectAllHint: "全選僅套用於目前這一頁。",
    submit: (n: number) => `新增 ${n} 個產品`,
    submitWithMove: (n: number) => `移動並新增 ${n} 個產品`,
    empty: "沒有符合條件的產品。",
  },

  groupDelete: {
    title: (name: string) => `刪除「${name}」？`,
    productsSafe: "分組內的產品不會被刪除，將自動歸入「預設分組」。",
    productsCount: (n: number) => `${n} 個產品將改用預設分組的利潤率重新計算售價。`,
    ruleLost: "此分組的定價規則將被永久刪除。",
    irreversible: "此操作無法復原。",
    submit: "刪除分組",
    deleting: "刪除中…",
    /** Per §6.2 deletion reassigns and re-runs §5 per listing, which is a fan-out. */
    recomputeNotice: "重新計算售價需要一些時間，可在此查看進度。",
  },

  products: {
    title: "產品列表",
    export: "匯出清單",
    exporting: "匯出中…",
    searchPlaceholder: "搜尋產品名稱或 SKU",
    groupFilter: "分組",
    sortLabel: "排序",
    bulkActions: "批次操作",
    bulkAssignGroup: "指派分組",
    bulkDeactivate: "下架",
    bulkReactivate: "重新上架",
    bulkSelected: (n: number) => `已選擇 ${n} 項`,
    bulkScopeHint: "批次操作僅套用於已勾選的項目。",
    bulkResult: (ok: number, failed: number) => `${ok} 項成功，${failed} 項失敗`,
    columns: {
      product: "產品名稱 / SKU",
      group: "分組",
      sizeCount: "尺寸數",
      margin: "利潤",
      price: "售價",
      status: "狀態",
      actions: "操作",
    },
    viewDetail: "查看詳情",
    /** Tab counts respect q and group_id but ignore the status filter itself. */
    tabCountsHint: "分頁數字不受狀態篩選影響。",
    empty: {
      noProductsTitle: "尚未匯入任何產品",
      noProductsBody: "產品會在第一次爬取後自動建立。",
      noResultsTitle: "沒有符合條件的產品",
      noResultsBody: "調整搜尋字詞或篩選條件後再試。",
      emptyTabTitle: "這個狀態下沒有產品",
    },
  },

  productDetail: {
    breadcrumbRoot: "產品列表",
    editName: "編輯名稱",
    saveBar: {
      unsaved: (n: number) => `有 ${n} 項變更尚未儲存`,
      draftBadge: "草稿",
      view: "檢視變更",
      discard: "捨棄變更",
      save: "儲存變更",
      saving: "儲存中…",
      /** The save is transactional: a failure means nothing changed and the draft is intact. */
      failed: "儲存失敗，變更未套用，草稿已保留。",
      guard: "有尚未儲存的變更，確定要離開嗎？",
    },
    changeset: {
      title: "變更內容",
      marginPercent: (size: string, from: string, to: string) => `${size} 利潤率 ${from} → ${to}`,
      marginFixed: (size: string, from: string, to: string) => `${size} 固定加價 ${from} → ${to}`,
      priceEffect: (from: string, to: string) => `（售價 ${from} → ${to}）`,
      clearOverride: (size: string) => `${size} 重設為分組規則`,
      quantity: (size: string, from: number, to: number) => `${size} 庫存 ${from} → ${to} 雙`,
      cost: (size: string, from: string, to: string) => `${size} 自有成本 ${from} → ${to}`,
      imageOrder: "上架圖片順序已調整",
      nameEn: "英文名稱已修改",
      nameZh: "中文名稱已修改",
      status: (from: string, to: string) => `上架狀態 ${from} → ${to}`,
    },
    trend: {
      title: "尺寸價格走勢",
      hint: "每個尺寸可有獨立利潤設定",
      recentChanges: "近 6 次變更",
      empty: "尚無價格變動紀錄",
      allSizes: "全部",
    },
    currentPrice: "目前售價",
    quantity: "庫存",
    currentMargin: "目前利潤設定",
    sizes: {
      title: "各尺寸庫存與定價",
      /** Gap 23: StockX quantity is a constant 1 per size, so a combined total overstates stock. */
      summary: (sizesInStock: number, quantity: number) =>
        `${sizesInStock} 個有庫存尺寸 · 自有總庫存 ${quantity} 雙`,
      bulkEdit: "批次編輯",
      columns: {
        size: "尺碼",
        quantity: "庫存",
        cost: "成本",
        margin: "利潤",
        price: "售價",
        status: "狀態",
      },
    },
    sources: {
      title: (size: string) => `${size} 的價格來源`,
      count: (n: number) => `${n} 個來源`,
      columns: {
        source: "來源",
        kind: "類型",
        supply: "庫存 / 供應",
        price: "價格",
        deltaToPrice: "與售價差異",
        updatedAt: "更新時間",
      },
      inHouseTitle: "自有庫存",
      inHouseEditable: "可編輯",
      stockxTitle: "外部市場",
      stockxReadOnly: "唯讀同步",
      readOnly: "唯讀",
      stockxHeading: "StockX / 外部市場 · 自動同步",
      inHouseHeading: "店內庫存 / Google Sheet · 自有庫存",
      heading: (n: number) => `價格來源 ${n}`,
      lowestAsk: "最低要價",
      marketBadge: "市場價",
      marketLow: "市場最低價",
      /** Gap 29: there is no yesterday series; previous_cost is 較上次. */
      vsPrevious: "較上次",
      costPerPair: "成本／雙",
      cost: "成本",
      quantityLabel: "數量",
      inventory: "庫存",
      asksLabel: "供應 / 掛單",
      asks: (n: number) => `${n} 筆掛單`,
      decreaseQty: "減少庫存",
      increaseQty: "增加庫存",
      legend: "灰底 = 唯讀同步 · 白底 = 可編輯",
      flat: "持平",
      footnote:
        "左欄成本與庫存只影響該來源；售價只有一個，由基準成本與利潤設定計算後套用至所有來源。外部來源成本由系統同步，無法修改。",
    },
    panel: {
      title: "價格來源與定價",
      /** Crawl freshness, not publishing sync — that string lives under `publishing.lastSynced`. */
      lastSourceSync: "來源更新",
      sharedPrice: "所有來源共用同一售價",
      perPair: "/ 雙",
    },
    price: {
      title: "統一售價",
      appliesTo: (n: number) => `套用於全部 ${n} 個來源`,
      appliesToShort: (n: number) => `套用於 ${n} 個來源`,
      baseCost: "基準成本",
      base: "基準價",
      latestChange: "最新變動",
      fixedHint: "每雙固定加價",
      /** The 來自最新價格變動 label has to name which source actually won. */
      baseCostFrom: (source: string) => `來自 ${source}`,
      marginPercent: "百分比利潤",
      marginPercentValue: (amount: string) => `= ${amount}`,
      marginFixed: "固定利潤",
      price: "售價",
      rawPrice: "進位前",
      roundingApplied: "已套用尾數進位",
      /** Gap 30: this is a markup on cost (330 / 1200), not a gross margin, and it can be negative. */
      markupOnCost: "對自有成本毛利",
      markupUnavailable: "沒有自有成本，無法計算毛利",
      applyPrice: "套用新售價",
      manualPrice: "手動指定售價",
      manualPriceHint: "此操作會略過閾值審批，新售價立即生效。",
      stagesIntoDraft: "會加入草稿，需按「儲存變更」才會生效。",
    },
    marginPopover: {
      title: (size: string) => `${size} 利潤設定`,
      marginPercent: "利潤率",
      marginFixed: "固定加價",
      preview: "公式預覽",
      clear: "重設為分組規則",
      clearHint: "重設後改用分組規則計算售價。",
    },
    history: {
      title: "價格變更紀錄",
      sizeTitle: "價格變動紀錄",
      sizePreview: (shown: number, total: number) => `最新 ${shown} 筆 / 共 ${total} 筆`,
      sizeScoped: (size: string, total: number) => `${size} · 共 ${total} 筆`,
      sourceOp: "來源 / 操作",
      magnitude: "幅度",
      systemSync: "系統同步",
      manualAdjust: "手動調整",
      compactPage: (page: number, totalPages: number) => `${page} / ${totalPages}`,
      allSizes: "全部尺寸",
      columns: {
        changedAt: "時間",
        size: "尺寸",
        changeType: "變更項目",
        change: "變更內容",
        priceChange: "售價變化",
        actor: "來源",
      },
      showingRecent: (shown: number, total: number) => `顯示最近 ${shown} 筆變更，共 ${total} 筆`,
      viewAll: "查看全部紀錄",
      empty: "尚無變更紀錄",
      systemActor: "系統",
    },
    images: {
      title: "上架圖片",
      count: (used: number, max: number) => `${used} / ${max} 張`,
      primary: "主圖",
      reordered: "順序已調整",
      subtitle: "拖曳排序，每張可替換或刪除",
      emptySubtitle: "尚未上傳圖片，第一張將設為主圖",
      emptyTitle: "尚無上架圖片",
      emptyHint: "拖曳圖片至此，或點擊下方按鈕上傳",
      chooseFile: "選擇圖片",
      dropzone: "拖曳圖片至此或點擊上傳",
      constraints: "JPG / PNG · 建議 1200×1200 · 單張 ≤ 2MB",
      replace: "替換",
      delete: "刪除",
      moveUp: "上移",
      moveDown: "下移",
      uploading: "上傳中…",
    },
    info: {
      title: "產品資訊",
      status: "上架狀態",
      listedOption: "已上架",
      listedHint: "價格監控中，價格變更需經審批",
      delistedOption: "已下架",
      delistedHint: "保留價格與圖片設定",
      /** Gap 23 again: named in-house-only so the number cannot silently overstate stock. */
      totalQuantity: "自有總庫存",
      group: "分組",
      lastUpdated: "最後更新",
      sku: "SKU",
    },
    outcome: {
      /** Gap 24: the save is transactional but the §5 decision differs per listing. */
      mixed: (updated: number, held: number) =>
        `${updated} 個尺寸已更新，${held} 個尺寸的新售價需審核。`,
      allUpdated: (updated: number) => `${updated} 個尺寸已更新。`,
      needsMargins: (n: number) => `${n} 個尺寸尚未設定利潤，未計算售價。`,
    },
  },

  productName: {
    title: "編輯產品名稱",
    nameEn: "英文名稱 (EN)",
    nameEnHint: "用於 StockX 上架與對外顯示",
    nameZh: "中文名稱（繁體）",
    nameZhHint: "用於店內標籤與內部報表",
    counter: (used: number, max: number) => `${used}/${max}`,
    preview: "顯示預覽",
    readOnlyTitle: "唯讀參考",
    stockxName: "StockX 上架名稱",
    immutable: "SKU 與尺寸不可修改。",
    /** OK stages into the Screen 8 draft rather than saving, so there is one commit path. */
    stagesIntoDraft: "確定後會加入草稿，需按「儲存變更」才會生效。",
  },

  users: {
    title: "使用者",
    newUser: "新增使用者帳號",
    accountSection: "帳號資料",
    name: "姓名",
    nameHint: "顯示於系統操作紀錄",
    email: "電子郵件",
    emailHint: "將作為登入帳號，需有效且未被使用",
    submit: "建立帳號",
    existingTitle: "現有使用者",
    existingCount: (n: number) => `共 ${n} 位`,
    existingHint: "移除後立即失去存取權限。",
    searchPlaceholder: "搜尋姓名或電子郵件",
    columns: { name: "姓名", email: "電子郵件", addedAt: "加入時間", addedBy: "加入者", actions: "操作" },
    remove: "移除",
    removeConfirmTitle: (email: string) => `移除「${email}」？`,
    removeConfirmBody: "此帳號將立即失去後台存取權限，可再次新增。",
    /** Gap 28: the seed is a single row and one careless click locks everyone out permanently. */
    cannotRemoveSelf: "無法移除自己的帳號。",
    cannotRemoveLast: "至少需要保留一位使用者。",
    duplicateEmail: "此電子郵件已在名單內。",
  },

  jobs: {
    progressLabel: "進度",
    queued: "排隊中",
    waitingForWorker: "等待背景服務接手…",
    cancel: "取消作業",
    viewProgress: "查看進度",
    startedAt: "開始時間",
    finishedAt: "完成時間",
    /** Gap 16: a stale heartbeat is what separates 背景服務未運行 from merely slow. */
    workerStale: "背景服務未回報心跳，作業可能已停止。",
  },

  /**
   * Everything suppressed while `meta.publishing.enabled === false`. Strings only — a Playwright
   * flow iterates this namespace and asserts none of it renders. Do not add copy here that should
   * be visible while publishing is off; that belongs in `publishingDisabled`.
   */
  publishing: {
    channels: "上架平台",
    syncNow: "立即同步",
    lastSynced: "最後同步",
    syncStatus: "同步狀態",
    removeFromChannels: "從所有平台移除",
    imageSyncNotice: "圖片變更會同步至所有已上架平台，約需 5 分鐘生效。",
    uploadSyncNotice: "上傳後會同步至所有已上架平台，約需 5 分鐘生效。",
    nameSyncNotice: "名稱變更後約需 5 分鐘同步至所有上架通路。",
    saveSyncNotice: "儲存後才會同步至已上架平台。",
    priceSyncNotice: "確認後將同步至已上架平台。",
    syncDelay: "約需 5 分鐘同步",
  },

  /** Shown *because* publishing is off. Neutral: nothing is broken, the feature is not enabled. */
  publishingDisabled: {
    banner: "尚未連接外部上架通路，變更只會儲存在系統內，待通路連接後再一併套用。",
    inline: "尚未連接外部上架通路。",
    syncDisabledReason: "尚未連接外部上架通路，暫時無法同步。",
    /** Approving still updates the live price and queues the publish for replay. */
    approvalStillWorks: "確認價格仍會立即更新系統內的上架價格。",
  },

  /** Re-exported from lib/format/date.ts so copy review is still one file. */
  time: RELATIVE_TIME,
} as const;

export type Dictionary = typeof zhHant;

/**
 * The flattened `publishing` namespace, for the Playwright flow that loads every screen with
 * publishing disabled and asserts none of these strings appear. Exported rather than re-derived in
 * the test so a new key is covered the moment it is added.
 */
export const PUBLISHING_STRINGS: readonly string[] = Object.values(zhHant.publishing);
