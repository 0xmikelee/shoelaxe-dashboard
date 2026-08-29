import type { Metadata } from "next";

import { ApprovalsClient } from "./approvals-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.approvals.title };

export default function ApprovalsPage() {
  return <ApprovalsClient />;
}
