import type { z } from "zod";
import type { ApprovalStatus, ListingTab } from "@/lib/domain/types";
import { LISTING_TAB_BY_STATUS, productTab } from "@/lib/domain/types";
import type { ProductStatusTab as ProductStatusTabSchema } from "@/lib/schemas/wire/common";
import type { ApprovalRowStatus } from "@/lib/format/delta";
import { joinDot } from "@/lib/format/punct";
import type { Tone } from "@/lib/format/tone";

/**
 * The status vocabulary, mapped once. No screen may inline a Chinese status string: six enum values
 * feed three tabs, six row labels and four badge tones, and the mapping is the only place the
 * relationship between them is stated.
 */

/** `ListingTab` from the domain and `ProductStatusTab` on the wire are the same three values. */
export type ProductStatusTab = z.infer<typeof ProductStatusTabSchema>;

export const LISTING_TAB_LABEL = {
  listed: "已上架",
  unlisted: "未上架",
  delisted: "已下架",
} as const satisfies Record<ListingTab, string>;

/** Screen 7's tab order, after 全部, which is not a tab value. */
export const PRODUCT_STATUS_TABS = ["unlisted", "listed", "delisted"] as const;

export const ALL_TAB_LABEL = "全部";

export interface ApprovalStatusDisplay {
  /** Which of Screen 7's three tabs this listing counts towards. */
  tab: ListingTab;
  tabLabel: string;
  /** The primary word. */
  label: string;
  /** The 「· 有待審價格」 half, when the primary word does not tell the whole story. */
  secondary: string | null;
  /** label and secondary joined the way the design writes them, for a single-cell row label. */
  rowLabel: string;
  tone: Tone;
}

function display(
  status: ApprovalStatus,
  label: string,
  tone: Tone,
  secondary: string | null = null,
): ApprovalStatusDisplay {
  const tab = LISTING_TAB_BY_STATUS[status];
  return {
    tab,
    tabLabel: LISTING_TAB_LABEL[tab],
    label,
    secondary,
    rowLabel: joinDot(label, secondary),
    tone,
  };
}

/**
 * `pending_price` is the one that gets got backwards. The listing **is** live at its old approved
 * price — 已上架 — while a proposed new price waits in the queue; it is not a "not yet listed"
 * state, and filing it under 未上架 mislabels the most important rows in the product.
 *
 * The tab half of this comes from `LISTING_TAB_BY_STATUS` in lib/domain/types.ts, which is Gap 4's
 * single edit point. Reversing the decision is that one table entry, not seven screens.
 */
export const APPROVAL_STATUS_DISPLAY: Readonly<Record<ApprovalStatus, ApprovalStatusDisplay>> = {
  approved: display("approved", "已上架", "success"),
  pending_new: display("pending_new", "待審核（新產品）", "info"),
  pending_price: display("pending_price", "已上架", "warning", "有待審價格"),
  needs_margins: display("needs_margins", "未設定利潤", "warning"),
  rejected: display("rejected", "已拒絕", "error"),
  inactive: display("inactive", "已下架", "neutral"),
};

export const approvalStatusLabel = (status: ApprovalStatus): string =>
  APPROVAL_STATUS_DISPLAY[status].rowLabel;

/**
 * Gap 4's product-level derivation, re-exported rather than reimplemented: 已下架 when every size is
 * delisted, else 已上架 when any size is live (approved **or** pending_price), else 未上架. Screen
 * 7's three counts partition all six statuses and therefore sum to 全部.
 */
export const productStatusTab = productTab;

export const productStatusLabel = (statuses: readonly ApprovalStatus[]): string =>
  LISTING_TAB_LABEL[productStatusTab(statuses)];

export interface RowStatusDisplay {
  label: string;
  tone: Tone;
}

/**
 * Screen 1's 狀態 column. The design draws three values; Gap 9 adds the four it cannot express.
 * Always rendered from the server's stored decision — never from the Δ the client just formatted,
 * which was rounded after the band test ran.
 */
export const APPROVAL_ROW_STATUS_DISPLAY: Readonly<Record<ApprovalRowStatus, RowStatusDisplay>> = {
  above_threshold: { label: "超出閾值", tone: "warning" },
  below_threshold: { label: "低於閾值", tone: "warning" },
  within_band: { label: "正常範圍", tone: "success" },
  pending_new: { label: "新產品", tone: "info" },
  needs_margins: { label: "未設定利潤", tone: "warning" },
  rejected: { label: "已拒絕", tone: "error" },
  superseded: { label: "已被取代", tone: "neutral" },
};
