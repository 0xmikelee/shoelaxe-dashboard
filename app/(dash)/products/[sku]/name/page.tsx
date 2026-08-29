import { ProductNameModal } from "@/components/products/product-name-modal";

export default async function NamePage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <ProductNameModal sku={decodeURIComponent(sku)} />;
}
