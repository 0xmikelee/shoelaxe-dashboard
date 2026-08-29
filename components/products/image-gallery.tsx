"use client";

import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, ImageIcon, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ApiRequestError, handlingFor } from "@/lib/api/errors";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { errorCopy } from "@/lib/i18n/errors";
import { zhHant } from "@/lib/i18n/zh-Hant";
import { toastApiError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ProductImagesWire, type ProductDetail, type ProductImage } from "@/lib/schemas/wire/products";

const t = zhHant.productDetail.images;
const MAX = 8;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png";

export function ImageGallery({
  sku,
  images,
  dirty,
  onReorder,
  onDelete,
}: {
  sku: string;
  images: readonly ProductImage[];
  dirty: boolean;
  onReorder: (ids: readonly string[]) => void;
  onDelete?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const atCapacity = images.length >= MAX;
  const isEmpty = images.length === 0;

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const result = await api.upload(`/api/v1/products/${encodeURIComponent(sku)}/images`, file);
      return ProductImagesWire.parse(result.data);
    },
    onSuccess: (next) => {
      setInlineError(null);
      queryClient.setQueryData(qk.products.detail(sku), (current: ProductDetail | undefined) =>
        current ? { ...current, images: next } : current,
      );
      void queryClient.invalidateQueries({ queryKey: qk.products.root });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && handlingFor(error.code) === "inline") {
        setInlineError(errorCopy(error).message);
        return;
      }
      toastApiError(error);
    },
  });

  const openPicker = () => {
    if (atCapacity || upload.isPending) return;
    inputRef.current?.click();
  };

  const takeFile = (file: File | undefined) => {
    if (!file || atCapacity) return;
    const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
    if (type !== "image/jpeg" && type !== "image/png") {
      setInlineError(errorCopy("unsupported_media_type").message);
      return;
    }
    if (file.size > MAX_BYTES) {
      setInlineError(errorCopy("image_too_large").message);
      return;
    }
    setInlineError(null);
    upload.mutate(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    takeFile(event.dataTransfer.files[0]);
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onReorder(next.map((image) => image.id));
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: () => setIsDragging(false),
    onDrop,
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-bold">{t.title}</h2>
          <p className="text-body text-muted-foreground">{isEmpty ? t.emptySubtitle : t.subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-body font-medium text-muted-foreground">
            {t.count(images.length, MAX)}
          </span>
          {dirty ? <StatusBadge label={t.reordered} tone="warning" /> : null}
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={t.chooseFile}
        disabled={atCapacity || upload.isPending}
        onChange={(event) => {
          takeFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {isEmpty ? (
        <div
          className={cn(
            "flex h-[236px] flex-col items-center justify-center gap-2.5 rounded-lg bg-muted px-6 text-center",
            isDragging ? "ring-1 ring-primary" : null,
            atCapacity || upload.isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          onClick={openPicker}
          {...dropHandlers}
        >
          <span className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
            <ImageIcon className="size-[22px] text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-title font-semibold">{t.emptyTitle}</p>
          <p className="text-label text-muted-foreground">{upload.isPending ? t.uploading : t.emptyHint}</p>
          <Button
            type="button"
            className="h-auto gap-1.5 rounded-lg px-4 py-[9px] text-num font-semibold"
            disabled={upload.isPending}
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
          >
            <CloudUpload className="size-3.5" />
            {t.chooseFile}
          </Button>
          <p className="text-meta text-muted-foreground">{t.constraints}</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-4 gap-2">
            {images.map((image, index) => (
              <li key={image.id} className="relative overflow-hidden rounded-md border border-border">
                {/* Mock CDN URLs are not in next/image remotePatterns; a plain img is the honest path. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                {index === 0 ? (
                  <span className="absolute top-1 left-1">
                    <StatusBadge label={t.primary} tone="info" />
                  </span>
                ) : (
                  <span className="absolute top-1 left-1 rounded-full bg-card/90 px-1.5 text-micro font-semibold">
                    {index + 1}
                  </span>
                )}
                <div className="flex justify-between gap-1 p-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t.moveUp}
                  >
                    ↑
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1}
                    aria-label={t.moveDown}
                  >
                    ↓
                  </Button>
                  {onDelete ? (
                    <Button size="icon-xs" variant="ghost" onClick={() => onDelete(image.id)} aria-label={t.delete}>
                      ×
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {atCapacity ? null : (
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-lg bg-muted px-4 py-3.5 text-center",
                isDragging ? "ring-1 ring-primary" : null,
                upload.isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              )}
              onClick={openPicker}
              {...dropHandlers}
            >
              <div className="flex items-center gap-2">
                <CloudUpload className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-num font-medium">{upload.isPending ? t.uploading : t.dropzone}</span>
              </div>
              <p className="text-meta text-muted-foreground">{t.constraints}</p>
            </div>
          )}
        </>
      )}

      {inlineError ? <p className="text-meta text-error-foreground">{inlineError}</p> : null}

      <p className="flex items-start gap-2 text-label leading-[1.45] text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{isEmpty ? zhHant.publishing.uploadSyncNotice : zhHant.publishing.imageSyncNotice}</span>
      </p>
    </section>
  );
}
