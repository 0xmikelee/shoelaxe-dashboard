import { defineRoute } from "@/lib/http/handler";
import { getApprovalStatsDoc } from "@/lib/api/contract/approvals";

export const GET = defineRoute(getApprovalStatsDoc, async () => {
  const { getApprovalStatsFromDb } = await import("@/lib/services/dashboard-db");
  return { data: await getApprovalStatsFromDb() };
});
