import { z } from "zod";

export const GoatProduct = z.object({
  id: z.union([z.number(), z.string()]),
  sku: z.string().optional(),
  name: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  colorway: z.string().nullable().optional(),
  season: z.string().nullable().optional(),
  product_type: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  release_date: z.string().nullable().optional(),
  release_date_year: z.string().nullable().optional(),
});

export const GoatProductListBody = z.object({
  data: z.array(GoatProduct).nullable().optional(),
});

export const GoatProductBody = z.object({
  data: GoatProduct.nullable().optional(),
});

export type GoatProduct = z.infer<typeof GoatProduct>;
