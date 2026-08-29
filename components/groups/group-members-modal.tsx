"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/empty-state";
import { ModalShell } from "@/components/modal-shell";
import { Pagination } from "@/components/data-table/pagination";
import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCloseModal } from "@/hooks/use-close-modal";
import { useGroup, useGroups } from "@/hooks/use-groups";
import { useProducts } from "@/hooks/use-products";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { formatRate } from "@/lib/format/percent";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";
import { GroupMembersResultWire } from "@/lib/schemas/wire/groups";

const t = zhHant.groupMembers;

type FilterTab = "all" | "default" | "other";

export function GroupMembersModal({ groupId }: { groupId: string }) {
  const close = useCloseModal(`/groups/${groupId}`);
  const queryClient = useQueryClient();
  const group = useGroup(groupId);
  const groups = useGroups();
  const defaultId = groups.data?.find((row) => row.is_default)?.id;

  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = search.trim() || undefined;
  const list = useProducts({
    q,
    page,
    per_page: 20,
    ...(tab === "default" && defaultId ? { group_id: defaultId } : {}),
    ...(tab === "all" ? { exclude_group_id: [groupId] } : {}),
    ...(tab === "other" && defaultId ? { exclude_group_id: [groupId, defaultId] } : {}),
  });

  const rows = useMemo(() => list.data?.rows ?? [], [list.data?.rows]);
  const pageSkus = rows.map((row) => row.sku);
  const allOnPageSelected = pageSkus.length > 0 && pageSkus.every((sku) => selected.has(sku));

  const movingFromCurated = useMemo(
    () =>
      rows.filter(
        (row) => selected.has(row.sku) && !row.group.is_default && row.group.id !== groupId,
      ),
    [rows, selected, groupId],
  );

  const submit = useMutation({
    mutationFn: async () => {
      const result = await api.POST("/api/v1/groups/{id}/members", {
        params: { path: { id: groupId } },
        body: { product_skus: [...selected] },
      });
      return GroupMembersResultWire.parse(result.data);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.root });
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
      toastSuccess(zhHant.products.bulkResult(data.added_count, 0));
      close();
    },
    onError: toastApiError,
  });

  const rate = group.data?.margin_percent ? formatRate(group.data.margin_percent) : zhHant.common.unknown;

  return (
    <ModalShell
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t.title}
      className="w-[720px]"
      action={
        <Button disabled={selected.size === 0 || submit.isPending} onClick={() => submit.mutate()}>
          {movingFromCurated.length > 0
            ? t.submitWithMove(selected.size)
            : t.submit(selected.size)}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
        />
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as FilterTab);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">{t.filterAll}</TabsTrigger>
            <TabsTrigger value="default">{t.filterDefaultGroup}</TabsTrigger>
            <TabsTrigger value="other">{t.filterOtherGroups}</TabsTrigger>
          </TabsList>
        </Tabs>
        {group.data?.margin_percent ? (
          <p className="text-meta text-muted-foreground">{t.willApplyRule(rate)}</p>
        ) : null}

        {list.data && list.data.rows.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(value) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (value === true) pageSkus.forEach((sku) => next.add(sku));
                        else pageSkus.forEach((sku) => next.delete(sku));
                        return next;
                      });
                    }}
                    aria-label={zhHant.common.selectAll}
                  />
                </TableHead>
                <TableHead>{t.columns.product}</TableHead>
                <TableHead>{t.columns.sku}</TableHead>
                <TableHead className="text-right">{t.columns.cost}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const willMove = !row.group.is_default && row.group.id !== groupId;
                return (
                  <TableRow key={row.sku}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.sku)}
                        onCheckedChange={(value) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (value === true) next.add(row.sku);
                            else next.delete(row.sku);
                            return next;
                          });
                        }}
                        aria-label={row.sku}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProductThumb src={row.primary_image_url} alt="" />
                        <div className="flex flex-col">
                          <span className="text-cell font-medium">{row.name}</span>
                          {willMove ? (
                            <span className="text-meta text-warning-foreground">
                              {t.willMoveFrom(row.group.name)}
                            </span>
                          ) : (
                            <span className="text-meta text-muted-foreground">
                              {t.belongsTo(row.group.name)}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Num className="text-meta">{row.sku}</Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={row.aggregates.cost?.min ?? null} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-meta text-muted-foreground">{t.selectAllHint}</p>
        {movingFromCurated.length > 0 ? (
          <p className="text-meta text-warning-foreground">{t.moveWarning}</p>
        ) : null}
        {list.data ? <Pagination meta={list.data.meta} onPageChange={setPage} /> : null}
      </div>
    </ModalShell>
  );
}
