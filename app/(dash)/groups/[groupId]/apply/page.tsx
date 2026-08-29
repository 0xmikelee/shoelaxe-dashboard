import { GroupApplyModal } from "@/components/groups/group-apply-modal";

export default async function ApplyPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupApplyModal groupId={groupId} />;
}
