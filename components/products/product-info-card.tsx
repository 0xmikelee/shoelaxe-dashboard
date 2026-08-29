"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Num } from "@/components/format/num";
import { Timestamp } from "@/components/format/timestamp";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LISTING_TAB_LABEL } from "@/lib/i18n/status";
import { zhHant } from "@/lib/i18n/zh-Hant";
import type { ProductDetail } from "@/lib/schemas/wire/products";
import type { ProductStatusTab } from "@/lib/i18n/status";

const t = zhHant.productDetail.info;
const TONE = { listed: "success", unlisted: "warning", delisted: "neutral" } as const;

export function ProductInfoCard({
  product,
  status,
  publishingEnabled,
  onStatus,
  onEditName,
}: {
  product: ProductDetail;
  status: "listed" | "delisted";
  publishingEnabled: boolean;
  onStatus: (value: "listed" | "delisted") => void;
  onEditName: () => void;
}) {
  const tab: ProductStatusTab = status;
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-2">
        <h2 className="text-section font-bold">{t.title}</h2>
        <Button variant="ghost" size="sm" onClick={onEditName}>
          {zhHant.productDetail.editName}
        </Button>
      </header>
      <div className="flex flex-col gap-1">
        <span className="text-cell font-medium">{product.name}</span>
        {product.name_zh ? (
          <span className="text-meta text-muted-foreground">{product.name_zh}</span>
        ) : null}
        <Num className="text-meta text-muted-foreground">{product.sku}</Num>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-meta text-muted-foreground">{t.status}</span>
        <Select value={status} onValueChange={(value) => onStatus(value as "listed" | "delisted")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="listed">{t.listedOption}</SelectItem>
            <SelectItem value="delisted">{t.delistedOption}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-meta text-muted-foreground">
          {status === "listed" ? t.listedHint : t.delistedHint}
        </span>
      </label>
      <StatusBadge label={LISTING_TAB_LABEL[tab]} tone={TONE[tab]} />
      <Row label={t.group}>
        <Link href={`/groups/${product.group.id}`} className="hover:underline">
          {product.group.name}
        </Link>
      </Row>
      <Row label={t.totalQuantity}>
        <Num>{zhHant.common.pairs(product.aggregates.total_in_house_quantity)}</Num>
      </Row>
      <Row label={t.lastUpdated}>
        <Timestamp value={product.updated_at} variant="semi" />
      </Row>
      {publishingEnabled ? (
        <Row label={zhHant.publishing.channels}>
          <span>Shopify</span>
        </Row>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-meta text-muted-foreground">{label}</span>
      <span className="text-cell">{children}</span>
    </div>
  );
}
