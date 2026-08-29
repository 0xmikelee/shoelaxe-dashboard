import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";

vi.mock("next/navigation", () => ({
  usePathname: () => "/approvals",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { getJson, server } from "@/tests/setup/msw";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApprovalsClient } from "@/app/(dash)/approvals/approvals-client";
import { ProductsClient } from "@/app/(dash)/products/products-client";
import { GroupsClient } from "@/app/(dash)/groups/groups-client";
import { SettingsClient } from "@/app/(dash)/settings/settings-client";
import { UsersClient } from "@/app/(dash)/users/users-client";
import { ApprovalsTable } from "@/components/approvals/approvals-table";
import { ProductDetailClient } from "@/components/products/product-detail-client";
import { db } from "@/mocks/db";
import { SEED } from "@/mocks/seed";
import { qk } from "@/lib/api/keys";
import { formatCents } from "@/lib/format/money";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { ApprovalRow } from "@/lib/schemas/wire/approvals";

/**
 * Every nav destination, rendered against the real MSW handlers.
 *
 * These exist because the browser pane cannot register a service worker, so the mocked app cannot
 * be checked by eye there — and because "the route builds" is not the same claim as "the screen
 * renders the data". Each test asserts a value that could only have come through the contract.
 */
function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("每個導覽頁都能載入資料", () => {
  it("價格監控 renders the queue with rows that need a human first", async () => {
    renderScreen(<ApprovalsClient />);

    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    const rows = within(table).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);

    // The default sort is pending_since desc, and resolved rows carry a null pending_since. If
    // nulls sorted first the queue would open on rows nobody has to act on.
    const firstDataRow = rows[1];
    expect(within(firstDataRow).queryByText(zhHant.approvals.actions.noActionNeeded)).toBeNull();

    // The metric cards are lifetime totals and load independently of the table.
    expect(await screen.findByText(zhHant.approvals.metrics.totalCrawled)).toBeInTheDocument();
  });

  it("產品列表 renders products with tab counts", async () => {
    renderScreen(<ProductsClient />);

    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.getByRole("tab", { name: /全部/ })).toBeInTheDocument();
  });

  it("產品分組 renders the group list and the selected group's products", async () => {
    renderScreen(<GroupsClient />);

    // The default group is undeletable, so there is always something to land on.
    expect(await screen.findByText(zhHant.groups.defaultBadge, {}, { timeout: 5000 })).toBeInTheDocument();
    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("系統配置 renders both thresholds and the crawl panel", async () => {
    renderScreen(<SettingsClient />);

    expect(await screen.findByText(zhHant.settings.thresholds.up, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(zhHant.settings.thresholds.down)).toBeInTheDocument();
    expect(screen.getByText(zhHant.settings.crawl.title)).toBeInTheDocument();
  });

  it("使用者 renders the allow-list", async () => {
    renderScreen(<UsersClient />);

    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.getByText(zhHant.users.existingTitle)).toBeInTheDocument();
  });

  it("產品詳情 renders the save-bar screen for a seeded SKU", async () => {
    renderScreen(<ProductDetailClient sku={SEED.historyFiveSku} />);
    expect(
      await screen.findByText(zhHant.productDetail.sizes.title, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.history.title)).toBeInTheDocument();
  });

  it.each([SEED.historyFiveSku, SEED.noImagesSku, SEED.singleSourceSku] as const)(
    "產品詳情 shows the image-upload zero state for %s",
    async (sku) => {
      renderScreen(<ProductDetailClient sku={sku} />);
      expect(
        await screen.findByText(zhHant.productDetail.images.emptyTitle, {}, { timeout: 5000 }),
      ).toBeInTheDocument();
      expect(screen.getByText(zhHant.productDetail.images.emptySubtitle)).toBeInTheDocument();
      expect(screen.getByText(zhHant.productDetail.images.emptyHint)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: zhHant.productDetail.images.chooseFile })).toBeInTheDocument();
      expect(screen.getByText("0 / 8 張")).toBeInTheDocument();
      expect(screen.getByText(zhHant.publishing.uploadSyncNotice)).toBeInTheDocument();
    },
  );

  it("產品詳情 售價 is the live approved price, not the formula preview", async () => {
    const listing = db.listings.find(
      (row) => row.product_sku === SEED.edgeSku && row.size === SEED.exactlyTenSize,
    )!;
    expect(listing.approved_price_cents).not.toBeNull();
    expect(listing.pending_price_cents).not.toBeNull();
    expect(listing.approved_price_cents).not.toBe(listing.pending_price_cents);

    renderScreen(<ProductDetailClient sku={SEED.edgeSku} />);
    expect(
      await screen.findByText(zhHant.productDetail.sizes.title, {}, { timeout: 5000 }),
    ).toBeInTheDocument();

    const sizesTable = screen.getAllByRole("table")[0];
    const row = within(sizesTable)
      .getAllByRole("row")
      .find((candidate) => within(candidate).queryByText(SEED.exactlyTenSize));
    expect(row).toBeDefined();
    expect(within(row!).getByText(formatCents(listing.approved_price_cents!))).toBeInTheDocument();
    expect(within(row!).queryByText(formatCents(listing.pending_price_cents!))).not.toBeInTheDocument();
  });

  it("產品詳情 expanded size follows Concept A Panel A", async () => {
    const user = userEvent.setup();
    const listing = db.listings.find((row) => row.product_sku === SEED.historyFiveSku)!;
    const other = db.listings.find(
      (row) => row.product_sku === SEED.historyFiveSku && row.id !== listing.id,
    )!;
    expect(other).toBeDefined();

    renderScreen(<ProductDetailClient sku={SEED.historyFiveSku} />);
    expect(
      await screen.findByText(zhHant.productDetail.sizes.title, {}, { timeout: 5000 }),
    ).toBeInTheDocument();

    const sizesTable = screen.getAllByRole("table")[0];
    await user.click(within(sizesTable).getByRole("button", { name: listing.size }));

    const heading = `${listing.size} · ${zhHant.productDetail.panel.title}`;
    expect(await screen.findByRole("button", { name: heading })).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.price.base)).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.price.marginPercent)).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.price.marginFixed)).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.panel.sharedPrice)).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.sources.legend)).toBeInTheDocument();
    expect(screen.getByText(zhHant.productDetail.history.sizeTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: zhHant.common.refresh })).toBeInTheDocument();

    if (listing.sources.some((source) => source.source === "stockx")) {
      expect(screen.getByText(zhHant.productDetail.sources.readOnly)).toBeInTheDocument();
    }
    if (listing.sources.some((source) => source.source === "in_house")) {
      expect(screen.getByText(zhHant.productDetail.sources.inHouseEditable)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: zhHant.productDetail.sources.increaseQty })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: heading }));
    await user.click(await screen.findByRole("menuitem", { name: other.size }));
    expect(
      await screen.findByRole("button", {
        name: `${other.size} · ${zhHant.productDetail.panel.title}`,
      }),
    ).toBeInTheDocument();
  });

  it("產品詳情 single-source listing does not assume two sources", async () => {
    const user = userEvent.setup();
    const listing = db.listings.find((row) => row.product_sku === SEED.singleSourceSku)!;

    renderScreen(<ProductDetailClient sku={SEED.singleSourceSku} />);
    expect(
      await screen.findByText(zhHant.productDetail.sizes.title, {}, { timeout: 5000 }),
    ).toBeInTheDocument();

    const sizesTable = screen.getAllByRole("table")[0];
    await user.click(within(sizesTable).getByRole("button", { name: listing.size }));

    expect(await screen.findByText(zhHant.productDetail.price.appliesToShort(1))).toBeInTheDocument();
    expect(screen.queryByText(zhHant.productDetail.price.appliesToShort(2))).not.toBeInTheDocument();
    expect(screen.queryByText(/套用於全部 2/)).not.toBeInTheDocument();
  });
});

describe("價格監控 row actions", () => {
  it("only the clicked 確認 button shows 確認中", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("*/api/v1/listings/:id/approve", async () => {
        await delay("infinite");
        return HttpResponse.json({ error: { code: "internal_error", message: "held" } }, { status: 500 });
      }),
    );

    renderScreen(<ApprovalsClient />);
    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    const idle = zhHant.approvals.actions.approve;
    const pending = zhHant.approvals.actions.approving;
    const buttons = within(table).getAllByRole("button", { name: idle });
    expect(buttons.length).toBeGreaterThan(1);

    await user.click(buttons[0]);

    expect(await screen.findByRole("button", { name: pending })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: pending })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: idle })).toHaveLength(buttons.length - 1);
  });

  it("確認 invalidates product queries so Screen 8 refetches the new listed price", async () => {
    const user = userEvent.setup();
    const listing = db.listings.find(
      (row) => row.approval_status === "pending_price" && row.pending_price_cents !== null,
    )!;
    const res = await getJson<{ data: ApprovalRow[] }>(
      `/api/v1/approvals?listing_id=${listing.id}&per_page=20`,
    );
    const row = res.body.data[0];
    expect(row).toBeDefined();

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <ApprovalsTable rows={[row]} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: zhHant.approvals.actions.approve }));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.products.root });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.listings.root });
  });
});
