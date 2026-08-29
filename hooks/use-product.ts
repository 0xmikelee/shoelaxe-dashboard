"use client";

import { useQuery } from "@tanstack/react-query";

import { api, parseMeta } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { HistoryListMetaWire, HistoryListWire } from "@/lib/schemas/wire/listings";
import { ProductDetailWire } from "@/lib/schemas/wire/products";
import type { HistoryFilters, ProductHistoryFilters } from "@/lib/schemas/params/listings";

export function useProduct(sku: string | undefined) {
  return useQuery({
    queryKey: qk.products.detail(sku ?? ""),
    enabled: Boolean(sku),
    queryFn: async () => {
      const result = await api.GET("/api/v1/products/{sku}", {
        params: { path: { sku: sku! } },
      });
      return ProductDetailWire.parse(result.data);
    },
  });
}

export type ProductHistoryUiFilters = Partial<
  Pick<ProductHistoryFilters, "size" | "change_type" | "page" | "per_page" | "limit" | "order">
>;

export function useProductHistory(sku: string | undefined, filters: ProductHistoryUiFilters = {}) {
  return useQuery({
    queryKey: qk.products.history(sku ?? "", filters),
    enabled: Boolean(sku),
    queryFn: async () => {
      const result = await api.GET("/api/v1/products/{sku}/history", {
        params: {
          path: { sku: sku! },
          query: {
            ...(filters.size ? { size: filters.size } : {}),
            ...(filters.change_type?.length ? { change_type: filters.change_type.join(",") } : {}),
            ...(filters.limit ? { limit: filters.limit } : {}),
            page: filters.page ?? 1,
            per_page: filters.per_page ?? 20,
            order: filters.order ?? "desc",
          },
        },
      });
      return {
        rows: HistoryListWire.parse(result.data),
        meta: parseMeta(HistoryListMetaWire, result),
      };
    },
    placeholderData: (previous) => previous,
  });
}

export type ListingHistoryUiFilters = Partial<
  Pick<HistoryFilters, "change_type" | "page" | "per_page" | "limit" | "order">
>;

export function useListingHistory(listingId: string | undefined, filters: ListingHistoryUiFilters = {}) {
  return useQuery({
    queryKey: qk.listings.history(listingId ?? "", filters),
    enabled: Boolean(listingId),
    queryFn: async () => {
      const result = await api.GET("/api/v1/listings/{id}/history", {
        params: {
          path: { id: listingId! },
          query: {
            ...(filters.change_type?.length ? { change_type: filters.change_type.join(",") } : {}),
            ...(filters.limit ? { limit: filters.limit } : {}),
            page: filters.page ?? 1,
            per_page: filters.per_page ?? 20,
            order: filters.order ?? "desc",
          },
        },
      });
      return {
        rows: HistoryListWire.parse(result.data),
        meta: parseMeta(HistoryListMetaWire, result),
      };
    },
    placeholderData: (previous) => previous,
  });
}
