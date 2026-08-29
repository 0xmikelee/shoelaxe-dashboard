import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/approvals" }));

import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { NavRail } from "@/components/nav-rail";
import { PublishingBanner } from "@/components/publishing-banner";
import { zhHant } from "@/lib/i18n/zh-Hant";

/**
 * The shell renders the dictionary, not its own copy of it. These started life as literals in five
 * component files while lib/i18n was still an empty directory, and 「Shoelaxe 管理後台」 in the
 * layout against 「Shoelaxe 價格管理後台」 in the dictionary is what that costs — the drift had
 * already happened before either string was ever reviewed.
 */
describe("shell copy comes from the dictionary", () => {
  it("labels every nav row and section from zhHant.nav", () => {
    render(<NavRail pendingCount={8} />);
    for (const label of [
      zhHant.nav.mainSection,
      zhHant.nav.systemSection,
      zhHant.nav.approvals,
      zhHant.nav.products,
      zhHant.nav.groups,
      zhHant.nav.settings,
      zhHant.nav.users,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("navigation", { name: zhHant.nav.railLabel })).toBeInTheDocument();
    expect(screen.getByLabelText(zhHant.nav.pendingBadgeLabel)).toHaveTextContent("8");
  });

  /** `undefined` is "still loading", and a `0` badge reads as "the queue is clear". */
  it("renders no pending badge until the count has arrived", () => {
    render(<NavRail />);
    expect(screen.queryByLabelText(zhHant.nav.pendingBadgeLabel)).toBeNull();
  });

  it("renders the disabled-publishing notice only when publishing is off", () => {
    const { rerender, container } = render(<PublishingBanner publishing={{ enabled: true }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PublishingBanner />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PublishingBanner publishing={{ enabled: false }} />);
    expect(screen.getByText(zhHant.publishingDisabled.banner)).toBeInTheDocument();
  });

  it("falls back to the dictionary's generic list states", () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(zhHant.errorState.title);
    expect(screen.getByText(zhHant.errorState.description)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: zhHant.common.retry })).toBeInTheDocument();

    render(<EmptyState />);
    expect(screen.getByText(zhHant.emptyState.title)).toBeInTheDocument();
  });
});
