"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Delta } from "@/components/format/delta";
import { Money } from "@/components/format/money";
import { Num } from "@/components/format/num";
import { SizeLabel } from "@/components/format/size-label";
import { Timestamp } from "@/components/format/timestamp";
import { StatusBadge } from "@/components/status-badge";
import { ApiRequestError } from "@/lib/api/errors";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { errorCopy } from "@/lib/i18n/errors";
import { APPROVAL_ROW_STATUS_DISPLAY } from "@/lib/i18n/status";
import { EVENT_SOURCE_LABEL } from "@/lib/i18n/enums";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastNotice, toastSuccess } from "@/lib/toast";
import { ListingWire } from "@/lib/schemas/wire/listings";
import type { ApprovalRow } from "@/lib/schemas/wire/approvals";

const t = zhHant.approvals;

const isActionable = (row: ApprovalRow) =>
  row.status === "above_threshold" ||
  row.status === "below_threshold" ||
  row.status === "pending_new";

function HeaderWithTooltip({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="cursor-help underline decoration-dotted underline-offset-2" title={hint}>
      {label}
    </span>
  );
}

export function ApprovalsTable({ rows }: { rows: readonly ApprovalRow[] }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState("");

  const invalidateAfterDecision = () => {
    void queryClient.invalidateQueries({ queryKey: qk.approvals.root });
    // The live listed price lives on the product, not the queue. Skipping these leaves Screen 8
    // serving a 30s-stale `approved_price` after 確認.
    void queryClient.invalidateQueries({ queryKey: qk.products.root });
    void queryClient.invalidateQueries({ queryKey: qk.listings.root });
  };

  const onSettledOutcome = (error: unknown) => {
    if (error instanceof ApiRequestError && error.code === "not_pending") {
      toastNotice(errorCopy(error).message);
      invalidateAfterDecision();
      return true;
    }
    return false;
  };

  const approve = useMutation({
    mutationFn: async (listingId: string) => {
      const result = await api.POST("/api/v1/listings/{id}/approve", {
        params: { path: { id: listingId } },
      });
      return ListingWire.parse(result.data);
    },
    onSuccess: () => {
      invalidateAfterDecision();
      toastSuccess(t.actions.approved);
    },
    onError: (error) => {
      if (!onSettledOutcome(error)) toastApiError(error);
    },
  });

  const reject = useMutation({
    mutationFn: async ({ listingId, reason: rejectReason }: { listingId: string; reason?: string }) => {
      const result = await api.POST("/api/v1/listings/{id}/reject", {
        params: { path: { id: listingId } },
        body: rejectReason ? { reason: rejectReason } : {},
      });
      return ListingWire.parse(result.data);
    },
    onSuccess: () => {
      invalidateAfterDecision();
      toastSuccess(t.actions.rejected);
      setRejecting(null);
      setReason("");
    },
    onError: (error) => {
      if (!onSettledOutcome(error)) toastApiError(error);
    },
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[280px]">{t.columns.productName}</TableHead>
            <TableHead className="w-[88px]">{t.columns.size}</TableHead>
            <TableHead className="w-[120px]">{t.columns.source}</TableHead>
            <TableHead className="w-[120px] text-right">
              <HeaderWithTooltip label={t.columns.cost} hint={t.tooltips.cost} />
            </TableHead>
            <TableHead className="w-[120px] text-right">
              <HeaderWithTooltip label={t.columns.previousCost} hint={t.tooltips.previousCost} />
            </TableHead>
            <TableHead className="w-[120px] text-right">
              <HeaderWithTooltip label={t.columns.approvedPrice} hint={t.tooltips.baseCost} />
            </TableHead>
            <TableHead className="w-[120px] text-right">
              <HeaderWithTooltip label={t.columns.newPrice} hint={t.tooltips.newPrice} />
            </TableHead>
            <TableHead className="w-[100px] text-right">
              <HeaderWithTooltip label={t.columns.delta} hint={t.tooltips.delta} />
            </TableHead>
            <TableHead className="w-[110px]">{t.columns.status}</TableHead>
            <TableHead className="w-[140px]">{t.columns.pendingSince}</TableHead>
            <TableHead className="w-[150px] text-right">{t.columns.actions}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const status = APPROVAL_ROW_STATUS_DISPLAY[row.status];
            const isApprovingThis = approve.isPending && approve.variables === row.listing_id;
            return (
              <TableRow key={row.update_id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-cell font-medium text-foreground">{row.product_name}</span>
                    <Num className="text-meta text-muted-foreground">{row.product_sku}</Num>
                  </div>
                </TableCell>
                <TableCell>
                  <SizeLabel value={row.size} className="text-cell" />
                </TableCell>
                <TableCell className="text-meta text-muted-foreground">
                  {EVENT_SOURCE_LABEL[row.source]}
                </TableCell>
                <TableCell className="text-right">
                  <Money value={row.cost} className="text-cell" />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={row.previous_cost} className="text-cell text-muted-foreground" />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={row.approved_price} className="text-cell text-muted-foreground" />
                </TableCell>
                <TableCell className="text-right">
                  <Money value={row.new_price} className="text-num font-bold" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Delta
                      status={row.status}
                      percent={row.delta_percent}
                      direction={row.delta_direction}
                      className="text-meta-lg"
                    />
                    {row.status === "pending_new" ? (
                      <StatusBadge label={t.newProductBadge} tone="info" />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge label={status.label} tone={status.tone} />
                </TableCell>
                <TableCell>
                  {row.pending_since ? (
                    <Timestamp value={row.pending_since} variant="relative" className="text-meta" />
                  ) : (
                    <span className="text-meta text-muted-foreground">{zhHant.common.unknown}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isActionable(row) ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={isApprovingThis}
                        onClick={() => approve.mutate(row.listing_id)}
                      >
                        {isApprovingThis ? t.actions.approving : t.actions.approve}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(row)}>
                        {t.actions.reject}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-meta text-muted-foreground">{t.actions.noActionNeeded}</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={Boolean(rejecting)}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setReason("");
          }
        }}
        title={t.actions.reject}
        confirmLabel={reject.isPending ? t.actions.rejecting : t.actions.reject}
        pending={reject.isPending}
        onConfirm={() => {
          if (!rejecting) return;
          reject.mutate({ listingId: rejecting.listing_id, reason: reason.trim() || undefined });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-meta text-muted-foreground">{t.actions.rejectReasonLabel}</span>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </label>
      </ConfirmDialog>
    </>
  );
}
