import { GroupMembersModal } from "@/components/groups/group-members-modal";

export default async function InterceptedMembersPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupMembersModal groupId={groupId} />;
}
