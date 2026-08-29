"use client";

import { useState } from "react";

import { ModalShell } from "@/components/modal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCloseModal } from "@/hooks/use-close-modal";
import { useMe } from "@/hooks/use-me";
import { useProduct } from "@/hooks/use-product";
import { zhHant } from "@/lib/i18n/zh-Hant";

const t = zhHant.productName;
const MAX = 120;

export function ProductNameModal({ sku }: { sku: string }) {
  const close = useCloseModal(`/products/${sku}`);
  const product = useProduct(sku);
  const me = useMe();
  const publishing = me.data?.meta.publishing.enabled === true;
  const [name, setName] = useState<string | null>(null);
  const [nameZh, setNameZh] = useState<string | null>(null);

  if (!product.data) {
    return (
      <ModalShell open onOpenChange={() => close()} title={t.title}>
        <Skeleton className="h-32 w-full" />
      </ModalShell>
    );
  }

  const en = name ?? product.data.name;
  const zh = nameZh ?? product.data.name_zh ?? "";

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t.title}
      action={
        <Button
          onClick={() => {
            sessionStorage.setItem(
              `shoelaxe:name:${sku}`,
              JSON.stringify({ name: en, nameZh: zh }),
            );
            close();
          }}
        >
          {zhHant.common.ok}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.nameEn}</span>
          <span className="text-meta text-muted-foreground">{t.nameEnHint}</span>
          <Input value={en} maxLength={MAX} onChange={(event) => setName(event.target.value)} />
          <span className="text-meta text-muted-foreground">{t.counter(en.length, MAX)}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-cell font-medium">{t.nameZh}</span>
          <span className="text-meta text-muted-foreground">{t.nameZhHint}</span>
          <Input value={zh} maxLength={MAX} onChange={(event) => setNameZh(event.target.value)} />
          <span className="text-meta text-muted-foreground">{t.counter(zh.length, MAX)}</span>
        </label>
        <div className="rounded-md bg-muted p-3">
          <p className="text-meta text-muted-foreground">{t.preview}</p>
          <p className="text-cell font-medium">{en}</p>
          {zh ? <p className="text-meta">{zh}</p> : null}
        </div>
        {product.data.stockx_name ? (
          <p className="text-meta text-muted-foreground">
            {t.readOnlyTitle}: {t.stockxName} · {product.data.stockx_name}
          </p>
        ) : null}
        <p className="text-meta text-muted-foreground">{t.immutable}</p>
        <p className="text-meta text-muted-foreground">{t.stagesIntoDraft}</p>
        {publishing ? (
          <p className="text-meta text-muted-foreground">{zhHant.publishing.nameSyncNotice}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}
