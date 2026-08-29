"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Timestamp } from "@/components/format/timestamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { AllowedUserRemovedWire, AllowedUsersListWire, type AllowedUser } from "@/lib/schemas/wire/users";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError, toastSuccess } from "@/lib/toast";

const t = zhHant.users;

function useAllowedUsers() {
  return useQuery({
    queryKey: qk.settings.allowedUsers(),
    queryFn: async () =>
      AllowedUsersListWire.parse((await api.GET("/api/v1/settings/allowed-users", {})).data),
  });
}

export function UsersClient() {
  const users = useAllowedUsers();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<AllowedUser | null>(null);

  const needle = search.trim().toLowerCase();
  const rows = (users.data ?? []).filter(
    (u) => !needle || u.name.toLowerCase().includes(needle) || u.email.includes(needle),
  );
  const lastUser = (users.data?.length ?? 0) <= 1;

  const remove = useMutation({
    mutationFn: async (email: string) => {
      const result = await api.DELETE("/api/v1/settings/allowed-users/{email}", {
        params: { path: { email } },
      });
      return AllowedUserRemovedWire.parse(result.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings.allowedUsers() });
      toastSuccess(zhHant.common.saveChanges);
      setRemoving(null);
    },
    onError: toastApiError,
  });

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-section font-bold text-foreground">{t.existingTitle}</h2>
          {users.data ? (
            <span className="text-meta text-muted-foreground">{t.existingCount(users.data.length)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-meta text-muted-foreground">{t.existingHint}</span>
          <Button asChild size="sm">
            <Link href="/users/new">{t.newUser}</Link>
          </Button>
        </div>
      </header>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t.searchPlaceholder}
        className="max-w-[360px]"
        aria-label={t.searchPlaceholder}
      />

      {users.isError ? (
        <ErrorState onRetry={() => void users.refetch()} />
      ) : users.isPending ? (
        <div className="flex flex-col gap-2 py-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={zhHant.products.empty.noResultsTitle} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">{t.columns.name}</TableHead>
              <TableHead className="w-[280px]">{t.columns.email}</TableHead>
              <TableHead className="w-[160px]">{t.columns.addedAt}</TableHead>
              <TableHead className="w-[160px]">{t.columns.addedBy}</TableHead>
              <TableHead className="w-[120px] text-right">{t.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((user) => {
              const blocked = user.is_self || lastUser;
              const reason = user.is_self ? t.cannotRemoveSelf : t.cannotRemoveLast;
              return (
                <TableRow key={user.email}>
                  <TableCell className="text-cell font-medium text-foreground">{user.name}</TableCell>
                  <TableCell className="text-cell text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Timestamp value={user.added_at} variant="absolute" className="text-meta" />
                  </TableCell>
                  <TableCell className="text-meta text-muted-foreground">
                    {user.added_by_name ?? zhHant.common.unknown}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={blocked}
                      title={blocked ? reason : undefined}
                      onClick={() => setRemoving(user)}
                    >
                      {t.remove}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? t.removeConfirmTitle(removing.email) : t.remove}
        confirmLabel={t.remove}
        variant="destructive"
        pending={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.email);
        }}
      >
        <p>{t.removeConfirmBody}</p>
      </ConfirmDialog>
    </section>
  );
}
