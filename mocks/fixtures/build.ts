/**
 * Regenerates mocks/fixtures/*.json.
 *
 *   pnpm exec tsx mocks/fixtures/build.ts
 *
 * The fixtures are *real responses*: the script boots the same MSW handlers the app runs against and
 * writes what they answer. Hand-writing them would produce JSON that satisfies the schema and does not
 * match what the mock actually serves, which is the failure mode fixtures exist to prevent.
 *
 * Output is deterministic — the dataset is seeded from SEED_NOW and the stalled-worker fixture runs on
 * a fixed clock — so re-running this on an unchanged dataset produces no diff.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MINUTE, SEED_NOW_MS, fixedClock } from "../clock";
import { mockConfig } from "../config";
import { db } from "../db";
import { jobRunner } from "../job-runner";
import { server } from "../node";
import { uuidFrom } from "../random";
import { SEED } from "../seed";

const here = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "http://mock.shoelaxe.test";

const listingId = (sku: string, size: string): string => uuidFrom(`listing:${sku}:${size}`);

const write = async (name: string, path: string): Promise<void> => {
  const response = await fetch(`${ORIGIN}${path}`);
  const body = await response.json();
  if (response.status !== 200) {
    throw new Error(`${name}: ${path} answered ${response.status}: ${JSON.stringify(body)}`);
  }
  mkdirSync(here, { recursive: true });
  writeFileSync(join(here, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${name}.json\n`);
};

async function main(): Promise<void> {
  mockConfig.latencyMs = 0;
  mockConfig.validateResponses = true;
  // A fixed clock for the whole run: `meta.worker.heartbeat_at` is wall-clock time, and a fixture that
  // re-writes itself on every build is a diff nobody can review.
  const clock = fixedClock(SEED_NOW_MS);
  jobRunner.setClock(clock);
  server.listen({ onUnhandledRequest: "error" });

  const edge = SEED.edgeSku;
  const approvals = (size: string, status: string) =>
    `/api/v1/approvals?listing_id=${listingId(edge, size)}&status=${status}`;

  await write("approvals.pending-new", approvals(SEED.pendingNewSize, "pending_new"));
  await write("approvals.zero-approved", approvals(SEED.zeroApprovedSize, "above_threshold"));
  await write("approvals.exactly-ten-but-held", approvals(SEED.exactlyTenSize, "above_threshold"));
  await write("approvals.superseded", approvals(SEED.supersededSize, "superseded"));

  await write("product.single-source", `/api/v1/products/${SEED.singleSourceSku}`);
  await write("product.no-images", `/api/v1/products/${SEED.noImagesSku}`);
  await write("product.needs-margins", `/api/v1/products/${SEED.needsMarginsSku}`);

  await write(
    "history.five-points",
    `/api/v1/products/${SEED.historyFiveSku}/history?change_type=listing_price&limit=6`,
  );
  await write("history.empty", `/api/v1/products/${SEED.historyEmptySku}/history`);

  await write("job.queued", `/api/v1/jobs/${SEED.jobIds.queued}`);
  await write("job.partial-failure", `/api/v1/jobs/${SEED.jobIds.partial}`);

  // A running job whose worker died: progress frozen part-way and a heartbeat well past the stale
  // threshold. The pair is the point — either half alone is indistinguishable from a slow worker.
  const listings = db.listings
    .filter((l) => l.approval_status !== "inactive")
    .slice(0, 32)
    .map((l) => ({ id: l.id, product_sku: l.product_sku, size: l.size }));
  const stalled = jobRunner.enqueue({ kind: "group_apply", scopeKey: SEED.groupIds.dunk, listings });
  jobRunner.tick();
  jobRunner.tick();
  jobRunner.tick();
  jobRunner.stallWorker();
  clock.advance(5 * MINUTE);
  await write("job.stalled-heartbeat", `/api/v1/jobs/${stalled.id}?items=all`);

  await write("group.default", `/api/v1/groups/${SEED.groupIds.default}`);

  server.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
