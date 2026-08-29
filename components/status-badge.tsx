import { cn } from "@/lib/utils";
import { TONE_SURFACE, type Tone } from "@/lib/format/tone";

export interface StatusBadgeProps {
  label: string;
  tone: Tone;
  className?: string;
}

/**
 * `component/Status Badge` in the .pen file: a 10.5px semibold pill on the tone's tinted surface.
 *
 * Takes an already-resolved `{label, tone}` rather than a status value, because the three status
 * vocabularies in this app (listing `approval_status`, Screen 1's per-update row status, job status)
 * map to display differently. The maps live in `lib/i18n/status.ts`; this only paints.
 */
export function StatusBadge({ label, tone, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-full px-[7px] py-[3px] text-micro-lg font-semibold",
        TONE_SURFACE[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
