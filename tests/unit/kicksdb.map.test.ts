import { describe, expect, it } from "vitest";
import { imageUrlsOf, mapGoatProduct, pickGoatProduct, releaseDateOnly } from "@/lib/kicksdb/map";
import { normalizeSku, skusMatch } from "@/lib/kicksdb/sku";
import type { GoatProduct } from "@/lib/kicksdb/schema";

const hit = (over: Partial<GoatProduct> = {}): GoatProduct => ({
  id: 92101,
  sku: "555088 101",
  name: "Air Jordan 1 Retro High OG 'Chicago'",
  brand: "Jordan",
  model: "Air Jordan 1",
  description: "The Chicago colorway.",
  colorway: "White/Black-Varsity Red",
  season: " 2015",
  product_type: "sneakers",
  image_url: "https://image.goat.com/cover.png",
  images: null,
  release_date: "2015-05-30T23:59:59.999Z",
  release_date_year: "2015",
  ...over,
});

describe("normalizeSku", () => {
  it("treats hyphen, space, and underscore forms as the same SKU", () => {
    expect(normalizeSku("555088-101")).toBe("555088101");
    expect(skusMatch("555088-101", "555088 101")).toBe(true);
    expect(skusMatch("555088-101", "CT8012-104")).toBe(false);
  });
});

describe("pickGoatProduct", () => {
  it("ignores a more popular first hit that is a different SKU", () => {
    const picked = pickGoatProduct("555088-101", [
      hit({ id: 1, sku: "CT8012 104", name: "Wrong" }),
      hit({ id: 92101, sku: "555088 101" }),
    ]);
    expect(picked?.id).toBe(92101);
  });

  it("returns null when nothing matches", () => {
    expect(pickGoatProduct("555088-101", [hit({ sku: "CT8012 104" })])).toBeNull();
  });
});

describe("mapGoatProduct", () => {
  it("maps the GOAT fields the ingest catalog write persists", () => {
    const mapped = mapGoatProduct(
      hit({
        images: [
          "https://image.goat.com/1.jpg",
          "https://image.goat.com/2.jpg",
        ],
      }),
    );
    expect(mapped).toMatchObject({
      kicks_product_id: "92101",
      product_name: "Air Jordan 1 Retro High OG 'Chicago'",
      brand: "Jordan",
      model: "Air Jordan 1",
      description: "The Chicago colorway.",
      colorway: "White/Black-Varsity Red",
      season: "2015",
      release_date: "2015-05-30",
      release_date_year: "2015",
      vendor: "Jordan",
      title: "Air Jordan 1 Retro High OG 'Chicago'",
    });
    expect(mapped?.body_html).toBe("<p>The Chicago colorway.</p>");
    expect(mapped?.image_urls).toEqual([
      "https://image.goat.com/1.jpg",
      "https://image.goat.com/2.jpg",
    ]);
  });

  it("falls back to image_url when images is empty", () => {
    expect(imageUrlsOf(hit({ images: null }))).toEqual(["https://image.goat.com/cover.png"]);
  });

  it("parses the calendar date from a GOAT timestamp", () => {
    expect(releaseDateOnly("2016-12-13T23:59:59.999Z")).toBe("2016-12-13");
  });
});
