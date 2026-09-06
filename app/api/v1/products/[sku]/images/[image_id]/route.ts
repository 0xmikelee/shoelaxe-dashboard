import { defineRoute } from "@/lib/http/handler";
import { deleteProductImageDoc, updateProductImageDoc } from "@/lib/api/contract/products";

export const PATCH = defineRoute(updateProductImageDoc, async (ctx) => {
  const { patchProductImageFromDb } = await import("@/lib/services/dashboard-db");
  return {
    data: await patchProductImageFromDb(ctx.params.sku, ctx.params.image_id, ctx.body, ctx.actor),
  };
});

export const DELETE = defineRoute(deleteProductImageDoc, async (ctx) => {
  const { deleteProductImageFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await deleteProductImageFromDb(ctx.params.sku, ctx.params.image_id, ctx.actor) };
});
