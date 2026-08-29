import type { Metadata } from "next";

import { GroupsIndexRedirect } from "./groups-index";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.groups.title };

export default function GroupsPage() {
  return <GroupsIndexRedirect />;
}
