"use client";

import { Button } from "@/components/ui/button";
import { formatMoneyOrDash } from "@/lib/format/money";
import { formatRateCompactOrDash } from "@/lib/format/percent";
import { joinDot } from "@/lib/format/punct";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { LISTING_TAB_LABEL } from "@/lib/i18n/status";
import type { DraftChange } from "@/lib/draft";

const t = zhHant.productDetail;

export function formatChange(change: DraftChange): string {
  switch (change.kind) {
    case "nameEn":
      return t.changeset.nameEn;
    case "nameZh":
      return t.changeset.nameZh;
    case "status":
      return t.changeset.status(LISTING_TAB_LABEL[change.from === "unlisted" ? "unlisted" : change.from], LISTING_TAB_LABEL[change.to]);
    case "imageOrder":
      return t.changeset.imageOrder;
    case "clearOverride":
      return t.changeset.clearOverride(change.size);
    case "marginPercent":
      return t.changeset.marginPercent(
        change.size,
        formatRateCompactOrDash(change.from),
        formatRateCompactOrDash(change.to),
      );
    case "marginFixed":
      return t.changeset.marginFixed(
        change.size,
        formatMoneyOrDash(change.from),
        formatMoneyOrDash(change.to),
      );
    case "cost":
      return t.changeset.cost(change.size, formatMoneyOrDash(change.from || null), formatMoneyOrDash(change.to));
    case "quantity":
      return t.changeset.quantity(change.size, change.from, change.to);
  }
}

export function ChangesetList({ changes }: { changes: readonly DraftChange[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {changes.map((change, index) => (
        <li key={`${change.kind}-${index}`} className="text-meta text-muted-foreground">
          {formatChange(change)}
        </li>
      ))}
    </ul>
  );
}

export function SaveBar({
  count,
  summary,
  changes,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  summary: string;
  changes: readonly DraftChange[];
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      data-slot="save-bar"
      className="sticky top-0 z-20 flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-cell font-bold">{t.saveBar.unsaved(count)}</p>
          <p className="text-meta text-muted-foreground">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>
            {t.saveBar.discard}
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? t.saveBar.saving : t.saveBar.save}
          </Button>
        </div>
      </div>
      <ChangesetList changes={changes} />
    </div>
  );
}

export function changesetSummary(changes: readonly DraftChange[]): string {
  return joinDot(...changes.map(formatChange));
}
