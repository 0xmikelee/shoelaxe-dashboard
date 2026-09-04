import { describe, expect, it, vi } from "vitest";
import { fetchGoatCatalogBySku, KICKSDB_GOAT_PRODUCTS_URL, KicksdbError } from "@/lib/kicksdb/client";

const listHit = {
  id: 1381901,
  sku: "CT8012 104",
  name: "Air Jordan 11 Retro",
  brand: "Air Jordan",
  model: "Air Jordan 11",
  description: "The 2024 edition.",
  colorway: "White/Legend Blue/Black",
  season: " 2024",
  product_type: "sneakers",
  image_url: "https://image.goat.com/cover.png",
  images: null,
  release_date: "2024-12-14T23:59:59.999Z",
  release_date_year: "2024",
};

const detailImages = [
  "https://image.goat.com/1.jpg",
  "https://image.goat.com/2.jpg",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchGoatCatalogBySku", () => {
  it("searches by SKU then GETs the product so images[] is populated", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith(`${KICKSDB_GOAT_PRODUCTS_URL}?`)) {
        return jsonResponse({ data: [listHit] });
      }
      if (url === `${KICKSDB_GOAT_PRODUCTS_URL}/1381901`) {
        return jsonResponse({ data: { ...listHit, images: detailImages } });
      }
      return jsonResponse({ data: [] }, 404);
    });

    const catalog = await fetchGoatCatalogBySku("CT8012-104", {
      apiKey: "KICKS-test",
      fetch: fetchImpl,
    });

    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toContain("query=CT8012-104");
    expect(catalog?.image_urls).toEqual(detailImages);
    expect(catalog?.colorway).toBe("White/Legend Blue/Black");
    expect(catalog?.model).toBe("Air Jordan 11");
    expect(catalog?.release_date_year).toBe("2024");
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledWith(
      expect.stringContaining(`${KICKSDB_GOAT_PRODUCTS_URL}?`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer KICKS-test" }),
      }),
    );
  });

  it("does not follow a relevance hit for a different SKU", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ ...listHit, sku: "ZZZ-000", id: 1 }] }),
    );
    const catalog = await fetchGoatCatalogBySku("CT8012-104", {
      apiKey: "KICKS-test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(catalog).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-OK list response so the caller can retry later", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    await expect(
      fetchGoatCatalogBySku("CT8012-104", {
        apiKey: "bad",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(KicksdbError);
  });
});
