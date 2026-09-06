import { defineRoute } from "@/lib/http/handler";
import { getSettingsDoc, updateSettingsDoc } from "@/lib/api/contract/settings";

export const GET = defineRoute(getSettingsDoc, async () => {
  const { getSettingsFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await getSettingsFromDb() };
});

export const PATCH = defineRoute(updateSettingsDoc, async (ctx) => {
  const { updateSettingsFromDb } = await import("@/lib/services/dashboard-db");
  const { result, status } = await updateSettingsFromDb(ctx.body, ctx.actor);
  return { data: result, status };
});
