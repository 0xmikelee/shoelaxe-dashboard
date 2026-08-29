"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { GroupDetailWire, GroupsListWire } from "@/lib/schemas/wire/groups";

export function useGroups() {
  return useQuery({
    queryKey: qk.groups.list(),
    queryFn: async () => {
      const result = await api.GET("/api/v1/groups", {});
      return GroupsListWire.parse(result.data);
    },
  });
}

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: qk.groups.detail(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await api.GET("/api/v1/groups/{id}", { params: { path: { id: id! } } });
      return GroupDetailWire.parse(result.data);
    },
  });
}
