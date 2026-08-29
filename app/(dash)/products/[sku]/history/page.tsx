import { ProductHistoryClient } from "@/components/products/product-history-client";

export default async function ProductHistoryPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  return <ProductHistoryClient sku={decodeURIComponent(sku)} />;
}
