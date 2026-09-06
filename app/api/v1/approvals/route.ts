import { defineRoute } from "@/lib/http/handler";
import { listApprovalsDoc } from "@/lib/api/contract/approvals";

export const GET = defineRoute(listApprovalsDoc, async (ctx) => {
  const { listApprovalsFromDb } = await import("@/lib/services/dashboard-db");
  return listApprovalsFromDb(ctx.query);
});
