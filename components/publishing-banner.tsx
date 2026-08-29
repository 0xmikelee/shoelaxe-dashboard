import { Info } from "lucide-react";

import { zhHant } from "@/lib/i18n/zh-Hant";
import type { Publishing } from "@/lib/http/wire";
import { cn } from "@/lib/utils";

export interface PublishingBannerProps {
  /** `meta.publishing` off any list response. Undefined while it is still loading. */
  publishing?: Publishing;
  className?: string;
}

/**
 * Nothing is broken — external publishing simply is not configured yet (`PUBLISH_TARGET=none`), and
 * approvals still update the live price and queue the publish for replay. So this is `info`, never
 * `warning` or `error`, and the copy avoids the word 同步失敗 entirely. While `publishing` is
 * undefined the banner renders nothing rather than flashing on and off around the first response.
 */
export function PublishingBanner({ publishing, className }: PublishingBannerProps) {
  if (publishing?.enabled !== false) return null;

  return (
    <div
      data-slot="publishing-banner"
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border bg-info px-8 text-info-foreground",
        className,
      )}
    >
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span className="py-2 text-meta">{zhHant.publishingDisabled.banner}</span>
    </div>
  );
}
