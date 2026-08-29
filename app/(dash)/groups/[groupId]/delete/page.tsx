import { GroupDeleteModal } from "@/components/groups/group-delete-modal";

export default async function DeletePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupDeleteModal groupId={groupId} />;
}
