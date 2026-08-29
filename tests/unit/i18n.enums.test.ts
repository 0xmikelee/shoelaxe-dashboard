import { describe, expect, it } from "vitest";
import {
  ACTOR_LABEL,
  APPLY_SCOPE_HINT,
  APPLY_SCOPE_LABEL,
  APPROVALS_SORT_LABEL,
  CHANGE_TYPE_LABEL,
  CRAWL_SOURCE_LABEL,
  CRAWL_TRIGGER_LABEL,
  DATE_RANGE_PRESET_LABEL,
  DELTA_DIRECTION_LABEL,
  EVENT_SOURCE_LABEL,
  JOB_ITEM_REASON_LABEL,
  JOB_KIND_LABEL,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  LIVENESS_LABEL,
  LIVENESS_TONE,
  MARGIN_SOURCE_LABEL,
  MARGIN_SUMMARY_KIND_LABEL,
  PRODUCTS_SORT_LABEL,
  SOURCE_SLOT_KIND_LABEL,
  SOURCE_SLOT_LABEL,
  isSystemActor,
} from "@/lib/i18n/enums";
import {
  ApplyScope,
  ChangeType,
  CrawlSource,
  CrawlTrigger,
  DeltaDirection,
  EventSource,
  JobItemReason,
  JobKind,
  JobStatus,
  ListingSourceSlot,
  Liveness,
  MarginSource,
  MarginSummaryKind,
} from "@/lib/schemas/wire/common";
import { DateRangePreset } from "@/lib/schemas/params/common";
import { ProductsSort } from "@/lib/schemas/params/products";
import { ApprovalsSort } from "@/lib/schemas/params/approvals";

/**
 * Each map is `satisfies Record<Union, …>` at compile time; this walks the same enums at runtime so
 * a widened schema fails with the missing key named rather than as a type error 40 lines long.
 */
describe.each([
  ["EVENT_SOURCE_LABEL", EVENT_SOURCE_LABEL, EventSource.options],
  ["SOURCE_SLOT_LABEL", SOURCE_SLOT_LABEL, ListingSourceSlot.options],
  ["SOURCE_SLOT_KIND_LABEL", SOURCE_SLOT_KIND_LABEL, ListingSourceSlot.options],
  ["CHANGE_TYPE_LABEL", CHANGE_TYPE_LABEL, ChangeType.options],
  ["JOB_STATUS_LABEL", JOB_STATUS_LABEL, JobStatus.options],
  ["JOB_STATUS_TONE", JOB_STATUS_TONE, JobStatus.options],
  ["JOB_KIND_LABEL", JOB_KIND_LABEL, JobKind.options],
  ["JOB_ITEM_REASON_LABEL", JOB_ITEM_REASON_LABEL, JobItemReason.options],
  ["MARGIN_SOURCE_LABEL", MARGIN_SOURCE_LABEL, MarginSource.options],
  ["APPLY_SCOPE_LABEL", APPLY_SCOPE_LABEL, ApplyScope.options],
  ["APPLY_SCOPE_HINT", APPLY_SCOPE_HINT, ApplyScope.options],
  ["DELTA_DIRECTION_LABEL", DELTA_DIRECTION_LABEL, DeltaDirection.options],
  ["LIVENESS_LABEL", LIVENESS_LABEL, Liveness.options],
  ["LIVENESS_TONE", LIVENESS_TONE, Liveness.options],
  ["CRAWL_SOURCE_LABEL", CRAWL_SOURCE_LABEL, CrawlSource.options],
  ["CRAWL_TRIGGER_LABEL", CRAWL_TRIGGER_LABEL, CrawlTrigger.options],
  ["MARGIN_SUMMARY_KIND_LABEL", MARGIN_SUMMARY_KIND_LABEL, MarginSummaryKind.options],
  ["DATE_RANGE_PRESET_LABEL", DATE_RANGE_PRESET_LABEL, DateRangePreset.options],
  ["PRODUCTS_SORT_LABEL", PRODUCTS_SORT_LABEL, ProductsSort.unwrap().options],
  ["APPROVALS_SORT_LABEL", APPROVALS_SORT_LABEL, ApprovalsSort.unwrap().options],
] as const)("%s", (_name, map, options) => {
  it("has exactly one entry per enum value", () => {
    expect(Object.keys(map).sort()).toEqual([...options].sort());
  });

  it("has a non-empty value for each", () => {
    for (const value of Object.values(map)) expect(String(value).length).toBeGreaterThan(0);
  });
});

describe("source labels (Gap 35)", () => {
  /**
   * The design's 電子郵件 / 手動輸入 names the transport and drops the source. StockX is the source;
   * email is how it arrives.
   */
  it("names the source and puts the transport in parentheses", () => {
    expect(EVENT_SOURCE_LABEL.stockx).toBe("StockX（郵件）");
    expect(EVENT_SOURCE_LABEL.google_sheet).toBe("Google 試算表（手動）");
  });

  it("uses full-width parentheses inside the Chinese run", () => {
    expect(EVENT_SOURCE_LABEL.stockx).toContain("（");
    expect(EVENT_SOURCE_LABEL.stockx).not.toContain("(");
  });

  it("keeps the crawl-run labels identical to the ingest ones", () => {
    expect(CRAWL_SOURCE_LABEL.stockx).toBe(EVENT_SOURCE_LABEL.stockx);
    expect(CRAWL_SOURCE_LABEL.google_sheet).toBe(EVENT_SOURCE_LABEL.google_sheet);
  });
});

describe("actor labels", () => {
  it("names the three system actors and the human one", () => {
    expect(ACTOR_LABEL).toEqual({
      system: "系統自動",
      crawl: "爬取更新",
      groupBatch: "分組批次更新",
      manual: "手動編輯",
    });
  });

  /** 手動編輯 is a person; the history row carries their name beside it, so 系統 must not appear. */
  it("classifies 手動編輯 as a human actor", () => {
    expect(isSystemActor(ACTOR_LABEL.manual)).toBe(false);
    expect(isSystemActor("陳小明")).toBe(false);
  });

  it("classifies the other three as system actors", () => {
    expect(isSystemActor(ACTOR_LABEL.system)).toBe(true);
    expect(isSystemActor(ACTOR_LABEL.crawl)).toBe(true);
    expect(isSystemActor(ACTOR_LABEL.groupBatch)).toBe(true);
  });
});

describe("job status labels", () => {
  /** 排隊中 rather than `0 / 96`, which reads as a job that has stalled. */
  it("gives queued its own word", () => {
    expect(JOB_STATUS_LABEL.queued).toBe("排隊中");
    expect(JOB_STATUS_LABEL.running).toBe("套用中");
  });

  it("tones a failed job as an error and a finished one as a success", () => {
    expect(JOB_STATUS_TONE.failed).toBe("error");
    expect(JOB_STATUS_TONE.succeeded).toBe("success");
  });
});

describe("change types map 1:1 onto the history column", () => {
  it("names the five values the design's 變更項目 column shows", () => {
    expect(CHANGE_TYPE_LABEL.margin_percent).toBe("利潤率");
    expect(CHANGE_TYPE_LABEL.margin_fixed).toBe("固定加價");
    expect(CHANGE_TYPE_LABEL.cost).toBe("成本");
    expect(CHANGE_TYPE_LABEL.listing_status).toBe("上架狀態");
    expect(CHANGE_TYPE_LABEL.margin_source).toBe("利潤來源");
  });
});
