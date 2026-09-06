import { defineRoute } from "@/lib/http/handler";
import { bulkApproveListingsDoc } from "@/lib/api/contract/listings";

export const POST = defineRoute(bulkApproveListingsDoc, async (ctx) => {
  const { bulkApproveFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await bulkApproveFromDb(ctx.body, ctx.actor) };
});
