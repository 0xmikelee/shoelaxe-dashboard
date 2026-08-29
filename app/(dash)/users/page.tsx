import type { Metadata } from "next";

import { UsersClient } from "./users-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.users.title };

export default function UsersPage() {
  return <UsersClient />;
}
