import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Proves the component harness itself works before anything depends on it: jsdom renders, the
 * jest-dom matchers are loaded, the @/ alias resolves, and — the part that actually breaks — a
 * Radix primitive that needs pointer-capture and ResizeObserver can open.
 */
describe("component test harness", () => {
  it("renders a shadcn primitive and applies jest-dom matchers", () => {
    render(<Button>確認</Button>);
    expect(screen.getByRole("button", { name: "確認" })).toBeInTheDocument();
  });

  it("opens a Radix tooltip, which needs the jsdom pointer-capture polyfills", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>差異%</Button>
          </TooltipTrigger>
          <TooltipContent>最新回報的市場價格</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole("button", { name: "差異%" }));
    expect(await screen.findAllByText("最新回報的市場價格")).not.toHaveLength(0);
  });
});
