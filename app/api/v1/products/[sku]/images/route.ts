import { defineRoute } from "@/lib/http/handler";
import { uploadProductImageDoc } from "@/lib/api/contract/products";

export const POST = defineRoute(uploadProductImageDoc, async (ctx) => {
  const { parseImageUpload, uploadProductImageFromDb } = await import("@/lib/services/dashboard-db");
  const file = await parseImageUpload(ctx.req);
  return { data: await uploadProductImageFromDb(ctx.params.sku, file, ctx.actor) };
});
