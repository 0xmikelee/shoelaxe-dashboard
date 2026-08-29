"use client";

import { useQuery } from "@tanstack/react-query";

import { api, parseMeta } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { MeMetaWire, MeWire } from "@/lib/schemas/wire/me";

/**
 * Identity, publishing flag and the settings snapshot. Read once in the dash shell so formula
 * previews on Screens 3, 4 and 8 do not each wait on a second round trip, and so the publishing
 * banner cannot flash the sync copy for 200ms first.
 */
export function useMe() {
  return useQuery({
    queryKey: qk.me(),
    queryFn: async () => {
      const result = await api.GET("/api/v1/me", {});
      return {
        user: MeWire.parse(result.data),
        meta: parseMeta(MeMetaWire, result),
      };
    },
    staleTime: 60_000,
  });
}
