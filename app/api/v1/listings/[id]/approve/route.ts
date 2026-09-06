import { defineRoute } from "@/lib/http/handler";
import { approveListingDoc } from "@/lib/api/contract/listings";

export const POST = defineRoute(approveListingDoc, async (ctx) => {
  const { approveListingFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await approveListingFromDb(ctx.params.id, ctx.actor) };
});
