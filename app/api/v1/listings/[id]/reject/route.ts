import { defineRoute } from "@/lib/http/handler";
import { rejectListingDoc } from "@/lib/api/contract/listings";

export const POST = defineRoute(rejectListingDoc, async (ctx) => {
  const { rejectListingFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await rejectListingFromDb(ctx.params.id, ctx.body.reason, ctx.actor) };
});
