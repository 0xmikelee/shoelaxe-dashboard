import type { Metadata } from "next";

import { ProductsClient } from "./products-client";
import { zhHant } from "@/lib/i18n/zh-Hant";

export const metadata: Metadata = { title: zhHant.products.title };

export default function ProductsPage() {
  return <ProductsClient />;
}
