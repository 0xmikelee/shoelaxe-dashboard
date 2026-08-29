import type { Metadata } from "next";

import { GroupsClient } from "../groups-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.groups.title };

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupsClient groupId={groupId} />;
}
