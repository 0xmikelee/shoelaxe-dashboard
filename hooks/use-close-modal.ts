"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Intercepted routes `router.back()` onto the parent; a refresh lands on the standalone page and
 * has nothing to go back to, so it pushes the fallback instead.
 */
export function useCloseModal(fallbackHref: string) {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, router]);
}
