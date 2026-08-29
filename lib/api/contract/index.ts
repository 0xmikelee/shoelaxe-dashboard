import type { RouteDoc } from "@/lib/openapi/registry";
import { meContract } from "./me";
import { approvalsContract } from "./approvals";
import { productsContract } from "./products";
import { listingsContract } from "./listings";
import { groupsContract } from "./groups";
import { jobsContract } from "./jobs";
import { settingsContract } from "./settings";
import { usersContract } from "./users";
import { crawlContract } from "./crawl";

/**
 * Frontend-authored contracts for endpoints the backend has not built yet.
 *
 * Registered by scripts/build-openapi.ts *after* the real route files, so a real route always wins.
 * Each entry is deleted in the same commit that lands its endpoint — contract.provisional.test.ts
 * fails while both exist, and FE-7 is done when this array is empty and docs/openapi.json contains
 * no `x-provisional` operation.
 *
 * Two endpoint families from §6.2 are deliberately absent. `/api/ingest` and `/api/ingest/health` are
 * machine routes with no design screen, so a frontend-authored shape for them would be invention with
 * no consumer; and the Shopify sync/drain routes stay out while publishing is deferred (Gap 25 —
 * 立即同步 ships visible and disabled, so nothing calls them until FE-6).
 */
export const PROVISIONAL: RouteDoc[] = [
  ...meContract,
  ...approvalsContract,
  ...productsContract,
  ...listingsContract,
  ...groupsContract,
  ...jobsContract,
  ...settingsContract,
  ...usersContract,
  ...crawlContract,
];
