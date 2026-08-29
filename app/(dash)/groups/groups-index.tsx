"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroups } from "@/hooks/use-groups";

export function GroupsIndexRedirect() {
  const groups = useGroups();
  const router = useRouter();

  useEffect(() => {
    const id = groups.data?.find((group) => group.is_default)?.id ?? groups.data?.[0]?.id;
    if (id) router.replace(`/groups/${id}`);
  }, [groups.data, router]);

  if (groups.isError) return <ErrorState onRetry={() => void groups.refetch()} />;
  return <Skeleton className="h-40 w-full" />;
}
