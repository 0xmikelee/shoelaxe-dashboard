import "server-only";
import { getEnv } from "@/lib/env";
import { getSql } from "@/lib/db/sql";
import { PostgresDashboardRepo } from "@/lib/repo/dashboard";
import type { SessionActor } from "@/lib/http/session-auth";
import type { ApprovalsFilters } from "@/lib/schemas/params/approvals";
import type { ProductPatch } from "@/lib/schemas/params/products";
import { ApiError } from "@/lib/http/errors";
import { listApprovals, getApprovalStats } from "@/lib/services/approvals";
import {
  approveListing,
  rejectListing,
  setListingPrice,
  bulkApproveListings,
} from "@/lib/services/listings";
import {
  MAX_IMAGE_BYTES,
  getProduct,
  updateProduct,
  uploadProductImage,
  patchProductImage,
  deleteProductImage,
  reorderProductImages,
} from "@/lib/services/products";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { createClient } from "@supabase/supabase-js";
import type { ListingWriteDeps } from "@/lib/services/listings";

const BUCKET = "product-images";

async function inTx<T>(actor: SessionActor, fn: (deps: ListingWriteDeps) => Promise<T>): Promise<T> {
  const env = getEnv();
  const sql = getSql();
  return (await sql.begin((tx) =>
    fn({
      repo: new PostgresDashboardRepo(tx),
      publishTarget: env.PUBLISH_TARGET,
      now: new Date().toISOString(),
      actor,
    }),
  )) as T;
}

function publishingEnabled(): boolean {
  return getEnv().PUBLISH_TARGET === "shopify";
}

function storage() {
  const env = getEnv();
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    publicUrlFor: (path: string) =>
      `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`,
    uploadObject: async (path: string, bytes: Uint8Array, contentType: string) => {
      const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
        contentType,
        upsert: false,
      });
      if (error) throw error;
    },
    removeObject: async (path: string) => {
      await client.storage.from(BUCKET).remove([path]);
    },
  };
}

export async function listApprovalsFromDb(filters: ApprovalsFilters) {
  return listApprovals(filters, {
    repo: new PostgresDashboardRepo(getSql()),
    now: new Date().toISOString(),
    publishingEnabled: publishingEnabled(),
  });
}

export async function getApprovalStatsFromDb() {
  return getApprovalStats({
    repo: new PostgresDashboardRepo(getSql()),
    now: new Date().toISOString(),
    publishingEnabled: publishingEnabled(),
  });
}

export async function approveListingFromDb(id: string, actor: SessionActor) {
  return inTx(actor, (deps) => approveListing(id, deps));
}

export async function rejectListingFromDb(id: string, reason: string | undefined, actor: SessionActor) {
  return inTx(actor, (deps) => rejectListing(id, reason, deps));
}

export async function setListingPriceFromDb(id: string, price: string, actor: SessionActor) {
  return inTx(actor, (deps) => setListingPrice(id, price, deps));
}

export async function bulkApproveFromDb(
  body: { listing_ids?: string[]; product_sku?: string },
  actor: SessionActor,
) {
  return inTx(actor, (deps) => bulkApproveListings(body, deps));
}

export async function getProductFromDb(sku: string) {
  return getProduct(sku, { repo: new PostgresDashboardRepo(getSql()) });
}

export async function updateProductFromDb(sku: string, body: ProductPatch, actor: SessionActor) {
  return inTx(actor, (deps) => updateProduct(sku, body, { ...deps, ...storage() }));
}

export async function uploadProductImageFromDb(
  sku: string,
  file: { bytes: Uint8Array; contentType: string; filename: string },
  actor: SessionActor,
) {
  const env = getEnv();
  return uploadProductImage(sku, file, {
    repo: new PostgresDashboardRepo(getSql()),
    publishTarget: env.PUBLISH_TARGET,
    now: new Date().toISOString(),
    actor,
    ...storage(),
  });
}

export async function patchProductImageFromDb(
  sku: string,
  imageId: string,
  body: { is_primary?: true; sort_order?: number },
  actor: SessionActor,
) {
  return inTx(actor, (deps) => patchProductImage(sku, imageId, body, { ...deps, ...storage() }));
}

export async function deleteProductImageFromDb(sku: string, imageId: string, actor: SessionActor) {
  const env = getEnv();
  return deleteProductImage(sku, imageId, {
    repo: new PostgresDashboardRepo(getSql()),
    publishTarget: env.PUBLISH_TARGET,
    now: new Date().toISOString(),
    actor,
    ...storage(),
  });
}

export async function reorderProductImagesFromDb(
  sku: string,
  imageIds: readonly string[],
  actor: SessionActor,
) {
  return inTx(actor, (deps) => reorderProductImages(sku, imageIds, { ...deps, ...storage() }));
}

export async function parseImageUpload(req: Request): Promise<{
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("validation_failed", "expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    throw new ApiError("validation_failed", "file is required");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError("image_too_large", "images must be 2MB or smaller");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const filename = file instanceof File ? file.name : "upload";
  return { bytes, contentType, filename };
}

export async function getSettingsFromDb() {
  return getSettings(new PostgresDashboardRepo(getSql()));
}

export async function updateSettingsFromDb(
  body: Parameters<typeof updateSettings>[0],
  actor: SessionActor,
) {
  return inTx(actor, (deps) => updateSettings(body, deps));
}

export { drainSettingsRecomputeFromDb } from "@/lib/services/settings-db";
