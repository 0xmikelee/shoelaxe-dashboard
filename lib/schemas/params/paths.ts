import { z } from "zod";
import { Sku } from "@/lib/schemas/wire/common";

/**
 * Path parameters. OpenAPI style — `{sku}`, never `:sku`; the generator marks every one required.
 */

export const SkuPath = z.object({ sku: Sku });

export const ListingIdPath = z.object({ id: z.uuid() });

export const GroupIdPath = z.object({ id: z.uuid() });

export const JobIdPath = z.object({ id: z.uuid() });

export const ProductImagePath = z.object({ sku: Sku, image_id: z.uuid() });

/** Gap 28: lowercased and URL-encoded. The column is `check (email = lower(email))`. */
export const AllowedUserEmailPath = z.object({ email: z.email() });
