"use client";

import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { MswGate } from "@/components/msw-gate";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ERROR_CODES, type ErrorCode } from "@/lib/http/errors";

/**
 * Only these two are worth retrying. A 409 (`not_pending`, `job_already_running`, `conflict`) or a
 * 422 is the server's *decision* about the request, not a failure of it — retrying re-asks a
 * question that has already been answered, and in the approval queue it re-asks it about a row
 * another person has just acted on.
 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "internal_error",
  "service_unavailable",
]);

/**
 * Structural rather than `instanceof ApiError` alone: the typed client wraps openapi-fetch, and a
 * duck-typed rejection from anywhere else must still be classified by its code. Everything with no
 * recognisable code never reached the API at all — DNS, offline, aborted socket — and that is the
 * one case where a retry is the right answer.
 */
function errorCode(error: unknown): ErrorCode | undefined {
  if (error instanceof ApiError) return error.code;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && code in ERROR_CODES) return code as ErrorCode;
  }
  return undefined;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        // Three internal users on one desktop each; refetching every time a window regains focus
        // buys nothing and makes the approval queue reshuffle under the cursor.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          const code = errorCode(error);
          return code === undefined || RETRYABLE.has(code);
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * A fresh client per server render — a shared one would leak one user's data into another's
 * request — and a single client for the life of the tab, so a suspending render cannot discard a
 * cache that already has fetches in flight.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      // The design canvas is light and the dark palette has never been reviewed on a real screen.
      // Following the OS preference would ship an unreviewed build to whoever runs macOS in dark.
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {/* Required: this shadcn version throws "`Tooltip` must be used within `TooltipProvider`"
            rather than degrading, so a single provider at the root is not optional. */}
        <TooltipProvider>
          <MswGate>{children}</MswGate>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
