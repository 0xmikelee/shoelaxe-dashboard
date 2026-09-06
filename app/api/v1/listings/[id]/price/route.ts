import { defineRoute } from "@/lib/http/handler";
import { setListingPriceDoc } from "@/lib/api/contract/listings";

export const POST = defineRoute(setListingPriceDoc, async (ctx) => {
  const { setListingPriceFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await setListingPriceFromDb(ctx.params.id, ctx.body.price, ctx.actor) };
});
