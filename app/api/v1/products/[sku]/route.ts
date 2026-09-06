import { defineRoute } from "@/lib/http/handler";
import { getProductDoc, updateProductDoc } from "@/lib/api/contract/products";

export const GET = defineRoute(getProductDoc, async (ctx) => {
  const { getProductFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await getProductFromDb(ctx.params.sku) };
});

export const PATCH = defineRoute(updateProductDoc, async (ctx) => {
  const { updateProductFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await updateProductFromDb(ctx.params.sku, ctx.body, ctx.actor) };
});
