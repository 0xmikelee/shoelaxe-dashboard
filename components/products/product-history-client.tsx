"use client";

import { useState } from "react";
import Link from "next/link";

import { ErrorState } from "@/components/error-state";
import { HistoryTable } from "@/components/products/history-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useProduct, useProductHistory } from "@/hooks/use-product";
import { zhHant } from "@/lib/i18n/zh-Hant";

export function ProductHistoryClient({ sku }: { sku: string }) {
  const product = useProduct(sku);
  const [page, setPage] = useState(1);
  const history = useProductHistory(sku, { page, per_page: 20 });

  if (product.isError) return <ErrorState onRetry={() => void product.refetch()} />;
  if (!product.data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <nav className="text-meta text-muted-foreground">
        <Link href="/products" className="hover:underline">
          {zhHant.productDetail.breadcrumbRoot}
        </Link>
        {" / "}
        <Link href={`/products/${sku}`} className="hover:underline">
          {product.data.name}
        </Link>
        {" / "}
        {zhHant.productDetail.history.title}
      </nav>
      <h1 className="text-section font-bold">{zhHant.productDetail.history.title}</h1>
      {history.isError ? (
        <ErrorState onRetry={() => void history.refetch()} />
      ) : history.data ? (
        <HistoryTable rows={history.data.rows} meta={history.data.meta} onPageChange={setPage} />
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </div>
  );
}
