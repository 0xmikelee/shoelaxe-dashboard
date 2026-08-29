import type { Metadata } from "next";

import { ProductDetailClient } from "@/components/products/product-detail-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.products.viewDetail };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  return <ProductDetailClient sku={decodeURIComponent(sku)} />;
}
