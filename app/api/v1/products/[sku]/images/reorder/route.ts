import { defineRoute } from "@/lib/http/handler";
import { reorderProductImagesDoc } from "@/lib/api/contract/products";

export const POST = defineRoute(reorderProductImagesDoc, async (ctx) => {
  const { reorderProductImagesFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await reorderProductImagesFromDb(ctx.params.sku, ctx.body.image_ids, ctx.actor) };
});
