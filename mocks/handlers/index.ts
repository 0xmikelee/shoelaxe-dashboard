import type { HttpHandler } from "msw";
import { CONTRACT_DOCS } from "@/lib/api/contract";
import { approvalsHandlers } from "./approvals";
import { crawlHandlers } from "./crawl";
import { groupsHandlers } from "./groups";
import { jobsHandlers } from "./jobs";
import { listingsHandlers } from "./listings";
import { meHandlers } from "./me";
import { productsHandlers } from "./products";
import { registeredOperations } from "./common";
import { settingsHandlers } from "./settings";
import { usersHandlers } from "./users";

/**
 * Order matters. MSW matches handlers in array order and `:sku` happily swallows a literal segment,
 * so `GET /products/export` has to be registered before `GET /products/{sku}` or the export downloads
 * a product called "export". Each tag file keeps its static paths above its dynamic ones.
 */
export const handlers: HttpHandler[] = [
  ...meHandlers,
  ...approvalsHandlers,
  ...productsHandlers,
  ...listingsHandlers,
  ...groupsHandlers,
  ...jobsHandlers,
  ...settingsHandlers,
  ...usersHandlers,
  ...crawlHandlers,
];

/**
 * Coverage, enforced at import rather than in a test that someone might not run: a screen that calls
 * an unmocked endpoint fails with `onUnhandledRequest: "error"` in tests and with a real 404 in dev,
 * and neither failure names the endpoint that is missing.
 */
const uncovered = CONTRACT_DOCS.filter((doc) => !registeredOperations().has(doc.operationId));
if (uncovered.length > 0) {
  throw new Error(
    `mocks/handlers is missing ${uncovered.length} operation(s) declared in lib/api/contract: ${uncovered
      .map((doc) => `${doc.method.toUpperCase()} ${doc.path}`)
      .join(", ")}`,
  );
}

export { registeredOperations } from "./common";
