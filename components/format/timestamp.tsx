"use client";

import { useSyncExternalStore } from "react";
import type * as React from "react";

import { formatAbsolute, formatRelative, formatSemiAbsolute } from "@/lib/format/date";
import { UNKNOWN } from "@/lib/format/punct";
import { cn } from "@/lib/utils";

/**
 * `absolute` — `2026-08-24 09:00`, for history tables where rows are scanned and compared.
 * `semi` — `今日 09:00`, for "last updated".
 * `relative` — `12 分鐘前`, for sync freshness.
 */
export type TimestampVariant = "absolute" | "semi" | "relative";

export interface TimestampProps
  extends Omit<React.ComponentProps<"time">, "dateTime" | "children"> {
  /** An RFC 3339 UTC string off the wire. `null` is unknown and renders `—`. */
  value: string | null | undefined;
  variant?: TimestampVariant;
}

/** Never subscribes: the only transition is server snapshot → client snapshot at hydration. */
const NEVER_CHANGES = () => () => {};

/**
 * The hydration gate is not optional. `relative` and `semi` both depend on "now", so a server render
 * and the client's hydrating render disagree by however long the response took, and React logs a
 * hydration mismatch on every page that shows a time — which is every page.
 *
 * So the server, and the client's hydrating pass, render the absolute form; React then re-renders
 * with the now-dependent one. `useSyncExternalStore` rather than a `useState` + effect pair because
 * this is exactly the hydration hand-off it exists for, and setState-in-an-effect is a cascading
 * render the compiler rightly complains about.
 *
 * The value does not tick afterwards: twenty rows would mean twenty timers, and every screen that
 * shows a relative time is already refetching on an interval.
 */
export function Timestamp({ value, variant = "absolute", className, ...props }: TimestampProps) {
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );

  if (value === null || value === undefined) {
    return (
      <span data-slot="timestamp" className={cn("num", className)}>
        {UNKNOWN}
      </span>
    );
  }

  const absolute = formatAbsolute(value);
  const text = !hydrated || variant === "absolute" ? absolute : render(variant, value);

  return (
    <time
      data-slot="timestamp"
      dateTime={value}
      title={text === absolute ? undefined : absolute}
      className={cn("num", className)}
      {...props}
    >
      {text}
    </time>
  );
}

function render(variant: Exclude<TimestampVariant, "absolute">, value: string): string {
  return variant === "semi" ? formatSemiAbsolute(value) : formatRelative(value);
}
