import { ERROR_HANDLING, type ErrorHandling } from "@/lib/api/errors";
import { ApiError, type ErrorCode } from "@/lib/http/errors";

/**
 * Every error code, in Chinese, with the affordance it is presented through.
 *
 * Exhaustiveness is the point, not the coverage: `satisfies Record<ErrorCode, string>` means adding
 * a code to lib/http/errors.ts fails this file to compile until someone decides how it reads, and
 * deleting one — `invalid_cursor` and `cursor_sort_mismatch` are both dead under offset pagination —
 * fails it until the entry goes. That is the type system doing the cleanup nobody remembers to do.
 *
 * `handling` is not restated here. lib/api/errors.ts already owns code → affordance; duplicating it
 * would give two answers to "is this a toast?" and eventually two different ones.
 */
const MESSAGE = {
  // transport & envelope
  invalid_json: "請求格式錯誤，無法處理。",
  validation_failed: "輸入內容有誤，請檢查標示的欄位。",
  invalid_cursor: "分頁參數無效，請重新載入列表。",
  cursor_sort_mismatch: "分頁與排序條件不符，請重新載入列表。",
  not_found: "找不到這筆資料，可能已被刪除或移動。",
  method_not_allowed: "不支援此操作。",
  conflict: "資料已被其他人更新，請重新載入後再試。",
  payload_too_large: "內容過大，請減少項目後再試。",
  internal_error: "系統發生錯誤，請稍後再試。",
  service_unavailable: "服務暫時無法使用，請稍後再試。",

  // auth
  missing_key: "缺少 API 金鑰。",
  invalid_key: "API 金鑰無效。",
  unauthenticated: "尚未登入，請重新登入。",
  session_expired: "登入狀態已過期，請重新登入。",
  not_allowed: "此帳號沒有存取權限，請聯絡系統管理員。",

  // ingest — these surface as row-level outcomes inside a 200, never as an HTTP error
  run_mismatch: "爬取批次不符，此筆資料已被新的爬取取代。",
  batch_too_large: "單次匯入的項目過多。",
  unknown_sku: "系統中沒有這個 SKU。",
  invalid_currency: "幣別不是 HKD，此筆已略過。",
  invalid_size: "尺寸格式無法辨識。",
  missing_cost: "這筆資料沒有成本，無法計算售價。",

  // pricing & approval
  needs_margins: "尚未設定利潤，無法計算售價。",
  // The expected race on Screen 1: someone else approved it, or a newer update superseded it.
  // It is an outcome, not a failure, and must not read like one.
  not_pending: "此筆已被更新的價格取代。",
  listing_inactive: "此尺寸已下架，請先重新上架再操作。",
  source_read_only: "外部來源的成本由系統同步，無法修改。",
  listing_not_in_product: "此尺寸不屬於這個產品，請重新載入頁面。",

  // groups & jobs
  default_group_immutable: "預設分組無法修改或刪除。",
  group_not_empty: "此分組內仍有產品，無法刪除。",
  job_already_running: "已有一個批次作業正在執行，請等待完成後再試。",
  job_not_retryable: "此作業無法重試。",

  // images
  unsupported_media_type: "僅支援 JPG 或 PNG 圖片。",
  image_limit_reached: "圖片數量已達上限 8 張。",
  image_too_large: "單張圖片不可超過 2MB。",
} as const satisfies Record<ErrorCode, string>;

export interface ErrorCopy {
  code: ErrorCode;
  message: string;
  handling: ErrorHandling;
}

export const ERROR_COPY: Readonly<Record<ErrorCode, ErrorCopy>> = Object.fromEntries(
  (Object.keys(MESSAGE) as ErrorCode[]).map((code) => [
    code,
    { code, message: MESSAGE[code], handling: ERROR_HANDLING[code] },
  ]),
) as Record<ErrorCode, ErrorCopy>;

/**
 * Accepts a code or a thrown value. A non-`ApiError` throwable is a network or parse failure, which
 * the user experiences as the server being unreachable — `service_unavailable` says that, where
 * `internal_error` would blame a server that was never reached.
 */
export function errorCopy(value: ErrorCode | unknown): ErrorCopy {
  if (typeof value === "string" && value in ERROR_COPY) return ERROR_COPY[value as ErrorCode];
  if (value instanceof ApiError) return ERROR_COPY[value.code];
  return ERROR_COPY.service_unavailable;
}

export const errorMessage = (value: ErrorCode | unknown): string => errorCopy(value).message;
