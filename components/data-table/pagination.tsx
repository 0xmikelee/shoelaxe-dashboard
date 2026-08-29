"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Num } from "@/components/format/num";
import { PER_PAGE_OPTIONS } from "@/lib/schemas/params/common";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { cn } from "@/lib/utils";
import type { Pagination as PaginationMeta } from "@/lib/http/wire";

export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: PerPage) => void;
  className?: string;
}

/**
 * One pager for every list. Offset pagination with a total is what makes the design's
 * 「顯示 1–6 筆，共 128 筆」 and 「第 1 / 4 頁」 renderable at all — cursor pagination can produce
 * neither, which is why §6.2 was amended (API-GAPS Gap 3).
 */
export function Pagination({ meta, onPageChange, onPerPageChange, className }: PaginationProps) {
  const { total, page, per_page: perPage } = meta;

  // An empty list has zero pages by arithmetic, but 「第 1 / 0 頁」 is not a thing a person can read.
  // Floor the denominator at one; the range line already says 共 0 筆.
  const totalPages = Math.max(meta.total_pages, 1);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className={cn("flex items-center justify-between gap-4 pt-3", className)}>
      <span className="text-meta text-muted-foreground">
        <Num>{zhHant.common.showingRange(from, to, total)}</Num>
      </span>

      <div className="flex items-center gap-2">
        {onPerPageChange ? (
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-meta"
            value={perPage}
            aria-label={zhHant.common.perPage(perPage)}
            onChange={(event) => onPerPageChange(Number(event.target.value) as PerPage)}
          >
            {PER_PAGE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {zhHant.common.perPage(size)}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-meta text-muted-foreground">
          <Num>{zhHant.common.page(page, totalPages)}</Num>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={zhHant.common.previousPage}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={zhHant.common.nextPage}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
