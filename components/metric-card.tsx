import { cn } from "@/lib/utils";
import { Num } from "@/components/format/num";
import { Skeleton } from "@/components/ui/skeleton";

export interface MetricCardProps {
  label: string;
  value: number | null | undefined;
  /** The secondary line: 「+156 今日」, 「88.7% 通過率」, 「需要處理」. */
  hint?: string;
  loading?: boolean;
  className?: string;
}

/**
 * `component/Metric Card` in the .pen file. Screen 1's four cards.
 *
 * Loading renders a skeleton rather than `0` — a zero is a real, meaningful count in this queue
 * (「目前沒有待審核的價格」), so showing one before the number arrives states something false.
 */
export function MetricCard({ label, value, hint, loading, className }: MetricCardProps) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border border-border bg-card p-5", className)}>
      <span className="text-meta text-muted-foreground">{label}</span>
      {loading || value === null || value === undefined ? (
        <Skeleton className="h-[26px] w-20" />
      ) : (
        <Num className="text-[22px] font-bold text-card-foreground">{value.toLocaleString("en-US")}</Num>
      )}
      {hint ? <span className="text-meta text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
