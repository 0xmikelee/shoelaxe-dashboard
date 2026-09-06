import type { RouteDoc } from "@/lib/openapi/registry";
import { meContract } from "./me";
import { approvalsContract, approvalsLiveContract } from "./approvals";
import { productsContract, productsLiveContract } from "./products";
import { listingsContract, listingsLiveContract } from "./listings";
import { groupsContract } from "./groups";
import { jobsContract } from "./jobs";
import { settingsContract, settingsLiveContract } from "./settings";
import { usersContract } from "./users";
import { crawlContract } from "./crawl";

/**
 * RouteDocs for endpoints that already have a real `defineRoute` handler. MSW still looks these up
 * by operationId so the mock stays honest after the provisional entry is deleted.
 */
export const LIVE_CONTRACT: RouteDoc[] = [
  ...approvalsLiveContract,
  ...productsLiveContract,
  ...listingsLiveContract,
  ...settingsLiveContract,
];

/**
 * Frontend-authored contracts for endpoints the backend has not built yet.
 *
 * Registered by scripts/build-openapi.ts *after* the real route files, so a real route always wins.
 * Each entry is deleted in the same commit that lands its endpoint — contract.provisional.test.ts
 * fails while both exist, and FE-7 is done when this array is empty and docs/openapi.json contains
 * no `x-provisional` operation.
 *
 * Two endpoint families from §6.2 are machine routes, not design screens: `/api/ingest` and
 * `/api/ingest/health` were never provisional. Shopify drain/sync land as real routes in this
 * slice (Gap 25 still hides the dashboard 立即同步 button until FE-6).
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

/** Every dashboard `/api/v1` contract, landed or not — MSW `defineMock` looks up by operationId. */
export const CONTRACT_DOCS: RouteDoc[] = [...LIVE_CONTRACT, ...PROVISIONAL];
