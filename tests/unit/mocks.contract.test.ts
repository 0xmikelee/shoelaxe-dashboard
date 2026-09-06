import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CONTRACT_DOCS } from "@/lib/api/contract";
import { WIRE_SCHEMAS, type WireSchemaName } from "@/lib/schemas/wire";
import { db, listingById } from "@/mocks/db";
import { FIXTURES } from "@/mocks/fixtures";
import { registeredOperations } from "@/mocks/handlers";
import { uuidFrom } from "@/mocks/random";
import { deepStrict, strictIssues } from "@/mocks/strict";
import { SEED } from "@/mocks/seed";
import { apiUrl, MOCK_ORIGIN } from "@/tests/setup/msw";
import "@/tests/setup/msw";

/**
 * The contract test.
 *
 * Two claims, and the second is the one that keeps working after this file is written: every committed
 * fixture satisfies its wire schema under deep-strict rules, and so does every live handler response.
 * Strictness is the whole point — the wire schemas strip unknown keys, so a mock that invents a field
 * parses cleanly, renders in the UI, and then vanishes the day the real backend answers.
 */

const schemaFor = (name: WireSchemaName) => WIRE_SCHEMAS[name];

const expectStrict = (name: WireSchemaName, value: unknown, label: string) => {
  const issues = strictIssues(schemaFor(name), value);
  expect(issues, `${label} does not satisfy ${name}: ${JSON.stringify(issues, null, 2)}`).toEqual([]);
};

describe("fixtures satisfy the wire contract", () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, entry) => {
    expectStrict(entry.schema, entry.body.data, `${entry.name} data`);
    if (entry.meta) {
      expectStrict(entry.meta, entry.body.meta, `${entry.name} meta`);
    } else {
      expect(entry.body.meta, `${entry.name} ships meta the manifest does not declare`).toBeUndefined();
    }
  });

  it("every fixture explains which rendering it guards", () => {
    for (const entry of FIXTURES) expect(entry.note.length).toBeGreaterThan(20);
  });
});

describe("deepStrict", () => {
  /** The guard on the guard: without this, every assertion above could be passing vacuously. */
  it("rejects a key the contract does not declare, however deeply nested", () => {
    const nested = { ...(FIXTURES[0].body.data as object[])[0], invented_field: 1 };
    expect(strictIssues(schemaFor("ApprovalsListWire"), [nested])).not.toEqual([]);

    const deep = z.object({ a: z.object({ b: z.array(z.object({ c: z.string() })) }) });
    expect(deep.safeParse({ a: { b: [{ c: "x", extra: 1 }] } }).success).toBe(true);
    expect(deepStrict(deep).safeParse({ a: { b: [{ c: "x", extra: 1 }] } }).success).toBe(false);
  });

  it("keeps the leaf checks the copy is derived from", () => {
    expect(deepStrict(schemaFor("ApprovalStatsWire")).safeParse({}).success).toBe(false);
    const money = z.object({ price: z.string().regex(/^\d+\.\d{2}$/) });
    expect(deepStrict(money).safeParse({ price: "12" }).success).toBe(false);
  });
});

interface Case {
  operationId: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: () => string;
  /** Mutate the seed before the request. Used when the happy path needs a second row. */
  setup?: () => void;
  body?: () => unknown;
  /** The meta schema this endpoint is documented to carry; absent means it must carry none. */
  meta?: WireSchemaName;
  /** exportProducts streams CSV and has no response schema. */
  raw?: (response: Response, text: string) => void | Promise<void>;
  status?: number;
}

const anyProduct = () => db.products[0].sku;

function plantGallery(sku: string, count: number): void {
  for (let n = 0; n < count; n += 1) {
    db.images.push({
      id: uuidFrom(`image:${sku}:${n}`),
      product_sku: sku,
      url: `https://cdn.shoelaxe.test/products/${sku}/${n + 1}.jpg`,
      sort_order: n,
      is_primary: n === 0,
      width: 1200,
      height: 1200,
      bytes: 180_000 + n * 12_000,
      created_at: "2026-08-01T00:00:00.000Z",
    });
  }
}
const pendingListing = () =>
  db.listings.find((l) => l.approval_status === "pending_price" && l.pending_price_cents !== null)!;
const otherPendingListing = () =>
  db.listings.filter((l) => l.approval_status === "pending_price" && l.pending_price_cents !== null)[1]!;
const activeListing = () => db.listings.find((l) => l.approval_status === "approved")!;
const inactiveListing = () => db.listings.find((l) => l.approval_status === "inactive")!;
const nonDefaultGroup = () => db.groups.find((g) => !g.is_default)!;

const CASES: Case[] = [
  { operationId: "getMe", path: () => "/api/v1/me", meta: "MeMetaWire" },

  { operationId: "listApprovals", path: () => "/api/v1/approvals?per_page=20", meta: "ListMeta" },
  { operationId: "getApprovalStats", path: () => "/api/v1/approvals/stats" },

  { operationId: "listProducts", path: () => "/api/v1/products", meta: "ProductsListMetaWire" },
  {
    operationId: "exportProducts",
    path: () => "/api/v1/products/export?status=listed",
    raw: (response, text) => {
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain("attachment");
      expect(text.split("\n")[0]).toContain("sku");
    },
  },
  { operationId: "getProduct", path: () => `/api/v1/products/${anyProduct()}` },
  {
    operationId: "updateProduct",
    method: "PATCH",
    path: () => `/api/v1/products/${anyProduct()}`,
    body: () => ({ name_zh: "改過的中文名" }),
  },
  {
    operationId: "updateProductMargins",
    method: "POST",
    path: () => `/api/v1/products/${anyProduct()}/margins`,
    body: () => ({ scope: "all", margin_percent: "18.0000" }),
  },
  { operationId: "getProductHistory", path: () => `/api/v1/products/${anyProduct()}/history`, meta: "HistoryListMetaWire" },
  {
    operationId: "bulkUpdateProducts",
    method: "POST",
    path: () => "/api/v1/products/bulk",
    body: () => ({ skus: [anyProduct()], action: "deactivate" }),
  },
  { operationId: "uploadProductImage", method: "POST", path: () => `/api/v1/products/${anyProduct()}/images` },
  {
    operationId: "updateProductImage",
    method: "PATCH",
    setup: () => plantGallery(anyProduct(), 2),
    path: () => {
      const sku = anyProduct();
      return `/api/v1/products/${sku}/images/${db.images.filter((i) => i.product_sku === sku)[1].id}`;
    },
    body: () => ({ is_primary: true }),
  },
  {
    operationId: "deleteProductImage",
    method: "DELETE",
    setup: () => plantGallery(anyProduct(), 2),
    path: () => {
      const sku = anyProduct();
      return `/api/v1/products/${sku}/images/${db.images.filter((i) => i.product_sku === sku)[0].id}`;
    },
  },
  {
    operationId: "reorderProductImages",
    method: "POST",
    setup: () => plantGallery(anyProduct(), 2),
    path: () => `/api/v1/products/${anyProduct()}/images/reorder`,
    body: () => ({
      image_ids: db.images
        .filter((i) => i.product_sku === anyProduct())
        .map((i) => i.id)
        .reverse(),
    }),
  },

  { operationId: "getListing", path: () => `/api/v1/listings/${activeListing().id}` },
  {
    operationId: "getListingHistory",
    path: () => `/api/v1/listings/${activeListing().id}/history`,
    meta: "HistoryListMetaWire",
  },
  {
    operationId: "updateListingMargins",
    method: "PATCH",
    path: () => `/api/v1/listings/${activeListing().id}/margins`,
    body: () => ({ margin_percent: "21.0000" }),
  },
  {
    operationId: "setListingPrice",
    method: "POST",
    path: () => `/api/v1/listings/${activeListing().id}/price`,
    body: () => ({ price: "1999.00", reason: "手動調整" }),
  },
  { operationId: "approveListing", method: "POST", path: () => `/api/v1/listings/${pendingListing().id}/approve` },
  {
    operationId: "rejectListing",
    method: "POST",
    path: () => `/api/v1/listings/${otherPendingListing().id}/reject`,
    body: () => ({ reason: "價格異常" }),
  },
  { operationId: "deactivateListing", method: "POST", path: () => `/api/v1/listings/${activeListing().id}/deactivate` },
  { operationId: "reactivateListing", method: "POST", path: () => `/api/v1/listings/${inactiveListing().id}/reactivate` },
  {
    operationId: "bulkApproveListings",
    method: "POST",
    path: () => "/api/v1/listings/bulk-approve",
    body: () => ({ product_sku: SEED.edgeSku }),
  },

  { operationId: "listGroups", path: () => "/api/v1/groups" },
  {
    operationId: "createGroup",
    method: "POST",
    path: () => "/api/v1/groups",
    body: () => ({ name: "測試分組", margin_percent: "16.0000" }),
    status: 201,
  },
  { operationId: "getGroup", path: () => `/api/v1/groups/${nonDefaultGroup().id}` },
  {
    operationId: "updateGroup",
    method: "PATCH",
    path: () => `/api/v1/groups/${nonDefaultGroup().id}`,
    body: () => ({ name: "改名後的分組" }),
  },
  {
    operationId: "deleteGroup",
    method: "DELETE",
    path: () => `/api/v1/groups/${nonDefaultGroup().id}`,
    status: 202,
  },
  {
    operationId: "addGroupMembers",
    method: "POST",
    path: () => `/api/v1/groups/${nonDefaultGroup().id}/members`,
    body: () => ({ product_skus: [SEED.singleSourceSku] }),
  },
  {
    operationId: "removeGroupMembers",
    method: "DELETE",
    path: () => {
      const group = db.products.find((p) => p.sku === SEED.edgeSku)!.group_id;
      return `/api/v1/groups/${group}/members`;
    },
    body: () => ({ product_skus: [SEED.edgeSku] }),
  },
  {
    operationId: "previewGroupApply",
    method: "POST",
    path: () => `/api/v1/groups/${nonDefaultGroup().id}/apply/preview`,
    body: () => ({ scope: "all", margin_percent: "17.0000" }),
  },
  {
    operationId: "applyGroupMargins",
    method: "POST",
    path: () => `/api/v1/groups/${nonDefaultGroup().id}/apply`,
    body: () => ({ scope: "group_rule_only", margin_percent: "17.0000" }),
    status: 202,
  },

  { operationId: "listJobs", path: () => "/api/v1/jobs", meta: "ListMeta" },
  { operationId: "getJob", path: () => `/api/v1/jobs/${SEED.jobIds.partial}`, meta: "JobMetaWire" },
  {
    operationId: "retryJob",
    method: "POST",
    path: () => `/api/v1/jobs/${SEED.jobIds.partial}/retry`,
    status: 202,
    meta: "JobMetaWire",
  },

  { operationId: "getSettings", path: () => "/api/v1/settings" },
  {
    operationId: "updateSettings",
    method: "PATCH",
    path: () => "/api/v1/settings",
    body: () => ({ crawl_cadence_minutes: 45 }),
  },
  { operationId: "getSystemHealth", path: () => "/api/v1/system/health" },

  { operationId: "listAllowedUsers", path: () => "/api/v1/settings/allowed-users" },
  {
    operationId: "createAllowedUser",
    method: "POST",
    path: () => "/api/v1/settings/allowed-users",
    body: () => ({ name: "新同事", email: "new@shoelaxe.test" }),
    status: 201,
  },
  {
    operationId: "deleteAllowedUser",
    method: "DELETE",
    setup: () => {
      db.allowedUsers.push({
        email: "new@shoelaxe.test",
        name: "新同事",
        added_at: db.allowedUsers[0].added_at,
        added_by_name: db.me.name,
        user_id: "00000000-0000-4000-8000-000000000099",
      });
    },
    path: () => `/api/v1/settings/allowed-users/${encodeURIComponent("new@shoelaxe.test")}`,
  },

  { operationId: "getCrawlStatus", path: () => "/api/v1/crawl-runs?limit=3" },
];

const docFor = (operationId: string) => {
  const doc = CONTRACT_DOCS.find((d) => d.operationId === operationId);
  if (!doc) throw new Error(`no contract for ${operationId}`);
  return doc;
};

describe("every mocked endpoint answers its own contract", () => {
  it("covers every operation the contract declares", () => {
    const cased = new Set(CASES.map((c) => c.operationId));
    const missing = CONTRACT_DOCS.filter((doc) => !cased.has(doc.operationId)).map((d) => d.operationId);
    expect(missing, "add a case for each new contract operation").toEqual([]);
    const unhandled = CONTRACT_DOCS.filter((doc) => !registeredOperations().has(doc.operationId));
    expect(unhandled.map((d) => d.operationId)).toEqual([]);
  });

  it.each(CASES.map((c) => [c.operationId, c] as const))("%s", async (_id, testCase) => {
    const doc = docFor(testCase.operationId);
    testCase.setup?.();
    const method = testCase.method ?? "GET";
    const body = testCase.body?.();

    const response = await fetch(apiUrl(testCase.path()), {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      ...(testCase.operationId === "uploadProductImage" ? { body: imageForm() } : {}),
    });

    const text = await response.text();
    expect(
      response.status,
      `${testCase.operationId} answered ${response.status}: ${text.slice(0, 400)}`,
    ).toBe(testCase.status ?? doc.successStatus ?? 200);

    if (testCase.raw) {
      await testCase.raw(response, text);
      return;
    }

    const parsed = JSON.parse(text) as { data: unknown; meta?: unknown };
    const responseSchema = doc.response;
    expect(responseSchema, `${testCase.operationId} declares no response schema`).toBeDefined();
    const issues = strictIssues(responseSchema!, parsed.data);
    expect(issues, `${testCase.operationId} data: ${JSON.stringify(issues, null, 2)}`).toEqual([]);

    if (testCase.meta) {
      expectStrict(testCase.meta, parsed.meta, `${testCase.operationId} meta`);
    } else {
      expect(parsed.meta, `${testCase.operationId} ships undeclared meta`).toBeUndefined();
    }
  });
});

function imageForm(): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(64)], { type: "image/jpeg" }), "new.jpg");
  return form;
}

describe("handlers are mounted on the contract's own paths", () => {
  it("mounts nothing the contract does not declare", () => {
    const declared = new Set(CONTRACT_DOCS.map((d) => d.operationId));
    for (const operationId of registeredOperations()) expect(declared.has(operationId)).toBe(true);
  });

  it("serves the same origin the app will call", async () => {
    const response = await fetch(`${MOCK_ORIGIN}/api/v1/me`);
    expect(response.status).toBe(200);
    expect(listingById(db.listings[0].id)).toBeDefined();
  });
});
