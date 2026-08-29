import { GroupMembersModal } from "@/components/groups/group-members-modal";

export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupMembersModal groupId={groupId} />;
}
