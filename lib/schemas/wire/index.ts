import type { ZodType } from "zod";
import { MeWire, MeMetaWire, SettingsSnapshotWire } from "./me";
import { ListMeta } from "./common";
import { ApprovalRowWire, ApprovalStatsWire, ApprovalsListWire } from "./approvals";
import {
  BulkListingResultWire,
  HistoryListMetaWire,
  HistoryListWire,
  HistoryRowWire,
  ListingDetailWire,
  ListingOutcomeWire,
  ListingSourceWire,
  ListingWire,
  ListingsWire,
} from "./listings";
import {
  AggregatesWire,
  MarginSummaryWire,
  ProductBulkResultWire,
  ProductDetailWire,
  ProductImageWire,
  ProductImagesWire,
  ProductRowWire,
  ProductTabCountsWire,
  ProductWriteResultWire,
  ProductsListMetaWire,
  ProductsListWire,
} from "./products";
import {
  GroupApplyAcceptedWire,
  GroupApplyPreviewWire,
  GroupDeleteAcceptedWire,
  GroupDetailWire,
  GroupMembersResultWire,
  GroupRefWire,
  GroupSummaryWire,
  GroupsListWire,
  IneligibleWire,
  ScopeCountsWire,
} from "./groups";
import {
  JobItemWire,
  JobMetaWire,
  JobResultWire,
  JobSummaryWire,
  JobWire,
  JobsListWire,
} from "./jobs";
import { SettingsUpdateResultWire, SettingsWire, SystemHealthWire } from "./settings";
import { AllowedUserRemovedWire, AllowedUserWire, AllowedUsersListWire } from "./users";
import { CrawlRunWire, CrawlStatusWire } from "./crawl";
import { IngestBatchWire, IngestHealthWire, IngestItemResultWire } from "./ingest";

/**
 * Every response schema the API may return, by name.
 *
 * contract.identity.test.ts asserts that each implemented route's `response` is *reference*-identical
 * to a member of this map. That is what stops a backend author writing an inline z.object({…}) that
 * drifts from what the frontend was generated against — without it, the whole shared-contract design
 * is a convention rather than a mechanism.
 *
 * Meta schemas and shared sub-objects are registered here too. `RouteDoc` has no `meta` field, so
 * the generator types only `data`; naming the meta shapes here is what gives the client a schema to
 * validate `meta` against instead of casting it (see lib/api/client.ts `parseMeta`).
 */
export const WIRE_SCHEMAS = {
  MeWire,
  MeMetaWire,
  SettingsSnapshotWire,

  ListMeta,

  ApprovalRowWire,
  ApprovalsListWire,
  ApprovalStatsWire,

  ListingSourceWire,
  ListingWire,
  ListingsWire,
  ListingDetailWire,
  ListingOutcomeWire,
  HistoryRowWire,
  HistoryListWire,
  HistoryListMetaWire,
  BulkListingResultWire,

  AggregatesWire,
  MarginSummaryWire,
  ProductImageWire,
  ProductImagesWire,
  ProductRowWire,
  ProductsListWire,
  ProductTabCountsWire,
  ProductsListMetaWire,
  ProductDetailWire,
  ProductWriteResultWire,
  ProductBulkResultWire,

  GroupRefWire,
  GroupSummaryWire,
  GroupsListWire,
  ScopeCountsWire,
  IneligibleWire,
  GroupDetailWire,
  GroupApplyPreviewWire,
  GroupApplyAcceptedWire,
  GroupDeleteAcceptedWire,
  GroupMembersResultWire,

  JobItemWire,
  JobResultWire,
  JobSummaryWire,
  JobsListWire,
  JobWire,
  JobMetaWire,

  SettingsWire,
  SettingsUpdateResultWire,
  SystemHealthWire,

  AllowedUserWire,
  AllowedUsersListWire,
  AllowedUserRemovedWire,

  CrawlRunWire,
  CrawlStatusWire,

  IngestHealthWire,
  IngestItemResultWire,
  IngestBatchWire,
} satisfies Record<string, ZodType>;

export type WireSchemaName = keyof typeof WIRE_SCHEMAS;
