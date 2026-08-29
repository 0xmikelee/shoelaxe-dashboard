import { GroupNewModal } from "@/components/groups/group-new-modal";

export default function InterceptedNewGroupPage() {
  return <GroupNewModal fallbackHref="/groups" />;
}
