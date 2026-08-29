"use client";

import { useQuery } from "@tanstack/react-query";

import { api, parseMeta } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { ProductsListMetaWire, ProductsListWire } from "@/lib/schemas/wire/products";
import type { ProductStatusTab } from "@/lib/i18n/status";

export type ProductsUiFilters = {
  q?: string;
  status?: ProductStatusTab;
  group_id?: string;
  exclude_group_id?: string[];
  sort?: "last_imported_at" | "name" | "sku" | "size_count" | "price" | "updated_at";
  order?: "asc" | "desc";
  page?: number;
  per_page?: number;
};

export function useProducts(filters: ProductsUiFilters) {
  return useQuery({
    queryKey: qk.products.list(filters),
    queryFn: async () => {
      const result = await api.GET("/api/v1/products", {
        params: {
          query: {
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.group_id ? { group_id: filters.group_id } : {}),
            ...(filters.exclude_group_id?.length
              ? { exclude_group_id: filters.exclude_group_id.join(",") }
              : {}),
            page: filters.page ?? 1,
            per_page: filters.per_page ?? 20,
            sort: filters.sort ?? "last_imported_at",
            order: filters.order ?? "desc",
          },
        },
      });
      return {
        rows: ProductsListWire.parse(result.data),
        // `counts` rides on meta and ignores the status filter, so the tabs never move under the
        // user as they switch between them.
        meta: parseMeta(ProductsListMetaWire, result),
      };
    },
    placeholderData: (previous) => previous,
  });
}
