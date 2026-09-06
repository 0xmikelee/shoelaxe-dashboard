import { pickBaseCost } from "@/lib/domain/baseCost";
import { resolveMargins } from "@/lib/domain/margins";
import { computeSellingPrice } from "@/lib/domain/pricing";
import { roundUpTo49Or99 } from "@/lib/domain/rounding";
import { STOCKX_QUANTITY } from "@/lib/domain/sources";
import type { ApprovalStatus, EventSource } from "@/lib/domain/types";
import { DAY, HOUR, MINUTE, SEED_NOW_MS, agoIso, iso } from "./clock";
import { chance, intBetween, pick, uuidFrom } from "./random";
import type {
  AllowedUserRow,
  ApprovalRowStatusValue,
  Cents,
  CrawlRunRow,
  DbState,
  GroupRow,
  HistoryRowStore,
  ImageRow,
  JobItemRow,
  JobRow,
  ListingRow,
  ProductRow,
  SettingsRow,
  SourceRow,
  UpdateRow,
} from "./types";

/**
 * The seeded dataset.
 *
 * Forty products, four groups, ~300 listings, a spread across all six `approval_status` values, and
 * every awkward state the screens are specified against. Static arrays would be quicker to write and
 * would fail to exercise the four behaviours that are actually easy to get wrong: offset pagination
 * past page 1, tab counts that ignore `status`, a sort change that must reset to page 1, and a group
 * apply that changes real prices. None of those are testable against a fixed six-row array.
 *
 * Prices are computed with lib/domain — the same `resolveMargins` → `computeSellingPrice` →
 * `roundUpTo49Or99` chain the server decides with — so the mock cannot disagree with the formula
 * preview the UI renders next to it.
 */

interface ModelTemplate {
  style: string;
  name: string;
  nameZh: string;
  brand: string;
  productType: string;
  family: "dunk" | "jordan" | "yeezy" | "default";
  cost: Cents;
  colours: readonly (readonly [string, string])[];
}

const MODELS: readonly ModelTemplate[] = [
  {
    style: "DD1391",
    name: "Dunk Low Retro",
    nameZh: "Dunk Low 復古",
    brand: "Nike",
    productType: "Sneakers",
    family: "dunk",
    cost: 88_000,
    colours: [
      ["Panda", "黑白熊貓"],
      ["Photon Dust", "光子灰"],
      ["Grey Fog", "霧灰"],
      ["Team Green", "隊伍綠"],
    ],
  },
  {
    style: "DV0833",
    name: "Dunk Low SE",
    nameZh: "Dunk Low 特別版",
    brand: "Nike",
    productType: "Sneakers",
    family: "dunk",
    cost: 96_000,
    colours: [
      ["Sail Multi", "帆布多色"],
      ["Lottery Pack", "彩券包"],
      ["Cacao Wow", "可可"],
      ["Rose Whisper", "玫瑰低語"],
    ],
  },
  {
    style: "FQ8080",
    name: "Dunk High Retro",
    nameZh: "Dunk High 復古",
    brand: "Nike",
    productType: "Sneakers",
    family: "dunk",
    cost: 104_000,
    colours: [
      ["Black White", "黑白"],
      ["Midnight Navy", "午夜海軍藍"],
      ["Championship Red", "冠軍紅"],
      ["Vast Grey", "淺灰"],
    ],
  },
  {
    style: "555088",
    name: "Air Jordan 1 Retro High OG",
    nameZh: "Air Jordan 1 高筒復古 OG",
    brand: "Jordan",
    productType: "Sneakers",
    family: "jordan",
    cost: 152_000,
    colours: [
      ["Chicago Lost and Found", "芝加哥失物招領"],
      ["Royal Reimagined", "皇家藍再現"],
      ["Black Toe", "黑腳趾"],
      ["Shadow 2.0", "影子 2.0"],
    ],
  },
  {
    style: "553558",
    name: "Air Jordan 1 Low",
    nameZh: "Air Jordan 1 低筒",
    brand: "Jordan",
    productType: "Sneakers",
    family: "jordan",
    cost: 108_000,
    colours: [
      ["Wolf Grey", "狼灰"],
      ["Mystic Navy", "神秘藍"],
      ["Gym Red", "健身紅"],
      ["Panda Emb", "熊貓刺繡"],
    ],
  },
  {
    style: "DZ5485",
    name: "Air Jordan 1 Retro High OG SP",
    nameZh: "Air Jordan 1 高筒復古 OG SP",
    brand: "Jordan",
    productType: "Sneakers",
    family: "jordan",
    cost: 178_000,
    colours: [
      ["University Blue", "大學藍"],
      ["Washed Heritage", "水洗傳承"],
      ["Palomino", "淺棕"],
      ["Satin Bred", "緞面黑紅"],
    ],
  },
  {
    style: "GW3774",
    name: "Yeezy Boost 350 V2",
    nameZh: "Yeezy Boost 350 V2",
    brand: "adidas",
    productType: "Sneakers",
    family: "yeezy",
    cost: 168_000,
    colours: [
      ["Onyx", "縞瑪瑙"],
      ["Bone", "骨白"],
      ["Slate Red", "板岩紅"],
      ["Beluga Reflective", "白鯨反光"],
    ],
  },
  {
    style: "HQ4540",
    name: "Yeezy Slide",
    nameZh: "Yeezy 拖鞋",
    brand: "adidas",
    productType: "Slides",
    family: "yeezy",
    cost: 72_000,
    colours: [
      ["Slate Grey", "板岩灰"],
      ["Granite", "花崗岩"],
      ["Flax", "亞麻"],
      ["Pure", "純色"],
    ],
  },
  {
    style: "M2002R",
    name: "New Balance 2002R",
    nameZh: "New Balance 2002R",
    brand: "New Balance",
    productType: "Sneakers",
    family: "default",
    cost: 84_000,
    colours: [
      ["Protection Pack Rain Cloud", "防護系列 雨雲"],
      ["Nightwatch Green", "夜巡綠"],
      ["Mirage Grey", "海市蜃樓灰"],
      ["Phantom", "幻影"],
    ],
  },
  {
    style: "U9060",
    name: "New Balance 9060",
    nameZh: "New Balance 9060",
    brand: "New Balance",
    productType: "Sneakers",
    family: "default",
    cost: 112_000,
    colours: [
      ["Sea Salt", "海鹽"],
      ["Rain Cloud", "雨雲"],
      ["Quartz Grey", "石英灰"],
      ["Joe Freshgoods", "Joe Freshgoods 聯名"],
    ],
  },
];

const US_SIZES = [
  "US 7",
  "US 7.5",
  "US 8",
  "US 8.5",
  "US 9",
  "US 9.5",
  "US 10",
  "US 10.5",
  "US 11",
  "US 12",
] as const;
const EU_SIZES = ["EU 40", "EU 41", "EU 42", "EU 43", "EU 44"] as const;
const YOUTH_SIZES = ["US 5.5Y", "US 6Y", "US 6.5Y", "US 7Y"] as const;

/**
 * Products the fixtures and tests name. Indexes into the generated catalogue are meaningless to a
 * reader; these are not, and a test that says `SEED.zeroApprovedSize` cannot silently start pointing
 * at a row that no longer has the property it was chosen for.
 */
const EDGE_INDEX = 0;
const HISTORY_FIVE_INDEX = 2;
const HISTORY_EMPTY_INDEX = 3;
const NEEDS_MARGINS_INDEX = 7;
const SINGLE_SOURCE_INDEX = 11;
const DELISTED_INDEX = 13;
const REJECTED_INDEX = 21;
const NO_IMAGES_INDEX = 22;
const PENDING_NEW_INDEX = 34;

const skuFor = (modelIndex: number, colourIndex: number): string =>
  `${MODELS[modelIndex].style}-${100 + colourIndex * 3}`;

const skuAt = (index: number): string => skuFor(Math.floor(index / 4), index % 4);

export const SEED = {
  /** Hosts one listing per ApprovalRowStatus, including the three the queue gets wrong. */
  edgeSku: skuAt(EDGE_INDEX),
  /** pending_new: no `approved_price` has ever existed, so Δ is undefined rather than zero. */
  pendingNewSize: "US 7",
  /** `approved_price = 0` — a real row, and the explicit division guard. */
  zeroApprovedSize: "US 7.5",
  /** Reads 10.0% and is held, because the figure the band was tested against was 10.0040%. */
  exactlyTenSize: "US 8",
  /** Two updates for one listing; the older is `superseded`. */
  supersededSize: "US 8.5",
  /** Auto-approved inside the band — 無需處理, no action column. */
  withinBandSize: "US 9",
  needsMarginsSize: "US 9.5",
  rejectedSize: "US 10",
  inactiveSize: "US 10.5",

  historyFiveSku: skuAt(HISTORY_FIVE_INDEX),
  historyEmptySku: skuAt(HISTORY_EMPTY_INDEX),
  needsMarginsSku: skuAt(NEEDS_MARGINS_INDEX),
  /** One source only: nothing may say 套用於全部 2 個來源 for this product (Gap 31). */
  singleSourceSku: skuAt(SINGLE_SOURCE_INDEX),
  delistedSku: skuAt(DELISTED_INDEX),
  rejectedSku: skuAt(REJECTED_INDEX),
  noImagesSku: skuAt(NO_IMAGES_INDEX),
  pendingNewSku: skuAt(PENDING_NEW_INDEX),

  groupIds: {
    default: uuidFrom("group:default"),
    dunk: uuidFrom("group:dunk"),
    jordan: uuidFrom("group:jordan"),
    yeezy: uuidFrom("group:yeezy"),
  },
  jobIds: {
    succeeded: uuidFrom("job:succeeded"),
    partial: uuidFrom("job:partial"),
    queued: uuidFrom("job:queued"),
    failed: uuidFrom("job:failed"),
    recompute: uuidFrom("job:recompute"),
  },
} as const;

const EDGE_EXACTLY_TEN_COST = 225_000;
const EDGE_PRICES = { approved: 249_900, pending: 274_900, deltaExact: 10.004 };

const GROUP_BY_FAMILY: Record<ModelTemplate["family"], keyof typeof SEED.groupIds> = {
  dunk: "dunk",
  jordan: "jordan",
  yeezy: "yeezy",
  default: "default",
};

function buildGroups(): GroupRow[] {
  return [
    {
      id: SEED.groupIds.default,
      name: "預設分組",
      is_default: true,
      // Null on purpose: the seeded default group is what lets the system default fire, which is the
      // only way the 使用系統預設 badge ever appears.
      margin_percent: null,
      margin_fixed_cents: null,
      updated_at: agoIso(30 * DAY),
    },
    {
      id: SEED.groupIds.dunk,
      name: "Nike Dunk 系列",
      is_default: false,
      margin_percent: 15,
      margin_fixed_cents: 15_000,
      updated_at: agoIso(6 * DAY),
    },
    {
      id: SEED.groupIds.jordan,
      name: "Jordan 1 系列",
      is_default: false,
      margin_percent: 12,
      margin_fixed_cents: 20_000,
      updated_at: agoIso(11 * DAY),
    },
    {
      id: SEED.groupIds.yeezy,
      name: "Yeezy 系列",
      is_default: false,
      margin_percent: 20,
      margin_fixed_cents: null,
      updated_at: agoIso(2 * DAY),
    },
  ];
}

function buildSettings(): SettingsRow {
  return {
    // Asymmetric, as the design draws it. The band is stamped on every decision, so a row held at
    // 10.004% keeps that pair even after someone widens the threshold.
    auto_approve_up_percent: 10,
    auto_approve_down_percent: 8,
    default_margin_enabled: true,
    default_margin_percent: 12,
    default_margin_fixed_cents: 10_000,
    rounding_enabled: true,
    crawl_cadence_minutes: 60,
    updated_at: agoIso(4 * DAY),
    updated_by_name: "Mike",
  };
}

const sizesForIndex = (index: number): string[] => {
  if (index === 6) return [...YOUTH_SIZES, "US 7.5", "US 8"];
  if (index === 26) return [...EU_SIZES];
  if (index % 7 === 3) return US_SIZES.slice(0, 5);
  return US_SIZES.slice(0, 8);
};

function buildProducts(): ProductRow[] {
  const products: ProductRow[] = [];
  for (let index = 0; index < MODELS.length * 4; index += 1) {
    const model = MODELS[Math.floor(index / 4)];
    const [colour, colourZh] = model.colours[index % 4];
    const sku = skuAt(index);
    const importedHoursAgo = intBetween(`imported:${sku}`, 1, 240);
    products.push({
      sku,
      name: `${model.name} ${colour}`,
      name_zh: `${model.nameZh} ${colourZh}`,
      brand: model.brand,
      title: `${model.name} ${colour}`,
      body_html: `<p>${model.name}「${colourZh}」。原廠公司貨，附原盒。</p>`,
      vendor: model.brand,
      product_type: model.productType,
      tags: [model.brand, model.productType, colour].map((t) => t.toLowerCase()),
      stockx_name: `${model.name} ${colour}`,
      group_id: SEED.groupIds[GROUP_BY_FAMILY[model.family]],
      last_imported_at: agoIso(importedHoursAgo * HOUR),
      created_at: agoIso((120 + index) * DAY),
      updated_at: agoIso(intBetween(`updated:${sku}`, 1, 96) * HOUR),
    });
  }
  return products;
}

function buildImages(): ImageRow[] {
  // Catalogue ships with empty galleries so Screen 8's upload zero state is the default, not a
  // one-SKU special case. Tests that replace / delete / reorder plant images in setup().
  return [];
}

const roundTo = (cents: number, step: number): number => Math.round(cents / step) * step;

function buildSources(product: ProductRow, size: string, index: number): SourceRow[] {
  const model = MODELS[Math.floor(index / 4)];
  const key = `${product.sku}:${size}`;
  /**
   * HK$2,250 under the Nike Dunk rule (15% + HK$150) is a raw HK$2,587.50 → HK$2,749.00 after the
   * x49/x99 tail, which is 10.0040% above the seeded approved HK$2,499.00. That row prints +10.0% and
   * is held, and it only works because the cost is chosen rather than rolled.
   */
  const stockxCost =
    index === EDGE_INDEX && size === SEED.exactlyTenSize
      ? EDGE_EXACTLY_TEN_COST
      : roundTo(model.cost + intBetween(`cost:${key}`, -9_000, 26_000), 100);
  const stockxAgoHours = intBetween(`stockxat:${key}`, 1, 40);
  const previousStockx = chance(`prevcost:${key}`, 0.75)
    ? roundTo(stockxCost - intBetween(`prevdelta:${key}`, -6_000, 9_000), 100)
    : null;

  const sources: SourceRow[] = [
    {
      source: "stockx",
      cost_cents: stockxCost,
      cost_at: agoIso(stockxAgoHours * HOUR),
      previous_cost_cents: previousStockx,
      previous_cost_at: previousStockx === null ? null : agoIso((stockxAgoHours + 24) * HOUR),
      // §2: a StockX ask is one pair. Never summed into 總庫存 (Gap 23).
      quantity: STOCKX_QUANTITY,
      last_source_ref: `stockx:${product.sku}:${size.replace(/\s+/g, "")}`,
      last_synced_at: agoIso(stockxAgoHours * HOUR),
    },
  ];

  const hasInHouse =
    index !== SINGLE_SOURCE_INDEX &&
    !(index === EDGE_INDEX && size === SEED.exactlyTenSize) &&
    chance(`inhouse:${key}`, 0.72);
  if (hasInHouse) {
    const inHouseAgoHours = stockxAgoHours + intBetween(`inhouseat:${key}`, 2, 96);
    const hasCost = chance(`inhousecost:${key}`, 0.85);
    sources.push({
      source: "in_house",
      cost_cents: hasCost ? roundTo(stockxCost - intBetween(`inhousedelta:${key}`, 1_000, 14_000), 100) : null,
      cost_at: hasCost ? agoIso(inHouseAgoHours * HOUR) : null,
      previous_cost_cents: null,
      previous_cost_at: null,
      quantity: intBetween(`qty:${key}`, 0, 6),
      last_source_ref: `sheet:row:${intBetween(`row:${key}`, 2, 400)}`,
      last_synced_at: agoIso(intBetween(`sheetsync:${key}`, 1, 20) * HOUR),
    });
  }
  return sources;
}

function statusFor(index: number, size: string, sku: string): ApprovalStatus {
  if (index === NEEDS_MARGINS_INDEX) return "needs_margins";
  if (index === DELISTED_INDEX || index === 29) return "inactive";
  if (index === REJECTED_INDEX) return "rejected";
  if (index === PENDING_NEW_INDEX) return "pending_new";
  if (index === EDGE_INDEX) {
    switch (size) {
      case SEED.pendingNewSize:
        return "pending_new";
      case SEED.zeroApprovedSize:
      case SEED.exactlyTenSize:
      case SEED.supersededSize:
        return "pending_price";
      case SEED.needsMarginsSize:
        return "needs_margins";
      case SEED.rejectedSize:
        return "rejected";
      case SEED.inactiveSize:
        return "inactive";
      default:
        return "approved";
    }
  }
  const roll = intBetween(`status:${sku}:${size}`, 0, 99);
  if (roll < 62) return "approved";
  if (roll < 80) return "pending_price";
  if (roll < 87) return "pending_new";
  if (roll < 92) return "needs_margins";
  if (roll < 96) return "rejected";
  return "inactive";
}

interface SeedContext {
  settings: SettingsRow;
  groups: GroupRow[];
}

/** The §5 chain, run exactly as the server runs it, so the mock's prices are the formula's prices. */
export function resolveForListing(
  ctx: SeedContext,
  listing: Pick<
    ListingRow,
    "margin_override_percent" | "margin_override_fixed_cents" | "margins_unresolved" | "sources"
  >,
  groupId: string,
) {
  const group = ctx.groups.find((g) => g.id === groupId) ?? null;
  const margins = listing.margins_unresolved
    ? null
    : resolveMargins(
        {
          percent: listing.margin_override_percent,
          fixedCents: listing.margin_override_fixed_cents,
        },
        group ? { percent: group.margin_percent, fixedCents: group.margin_fixed_cents } : null,
        {
          enabled: ctx.settings.default_margin_enabled,
          percent: ctx.settings.default_margin_percent,
          fixedCents: ctx.settings.default_margin_fixed_cents,
        },
      );
  const base = pickBaseCost(
    listing.sources.map((s) => ({ slot: s.source, costCents: s.cost_cents, costAt: s.cost_at })),
    null,
  );
  const price =
    margins && base ? computeSellingPrice(base.costCents, margins, ctx.settings.rounding_enabled) : null;
  return { margins, base, price };
}

function buildListings(ctx: SeedContext, products: readonly ProductRow[]): ListingRow[] {
  const listings: ListingRow[] = [];

  products.forEach((product, index) => {
    for (const size of sizesForIndex(index)) {
      const key = `${product.sku}:${size}`;
      const status = statusFor(index, size, product.sku);
      const overridden =
        index !== NEEDS_MARGINS_INDEX && index !== EDGE_INDEX && chance(`override:${key}`, 0.18);

      const listing: ListingRow = {
        id: uuidFrom(`listing:${key}`),
        product_sku: product.sku,
        size,
        approval_status: status,
        margin_override_percent: overridden ? pick(`ovp:${key}`, [10, 12, 15, 18, 22]) : null,
        margin_override_fixed_cents: overridden ? pick(`ovf:${key}`, [0, 5_000, 10_000, 20_000]) : null,
        margins_unresolved: status === "needs_margins",
        approved_price_cents: null,
        approved_at: null,
        previous_approved_price_cents: null,
        previous_approved_at: null,
        pending_price_cents: null,
        pending_since: null,
        pending_update_id: null,
        sources: buildSources(product, size, index),
        updated_at: agoIso(intBetween(`lupdated:${key}`, 1, 90) * HOUR),
      };

      const { price } = resolveForListing(ctx, listing, product.group_id);
      const computed = price?.priceCents ?? null;

      switch (status) {
        case "approved": {
          listing.approved_price_cents = computed;
          listing.approved_at = agoIso(intBetween(`approvedat:${key}`, 2, 300) * HOUR);
          if (chance(`prevapproved:${key}`, 0.7) && computed !== null) {
            listing.previous_approved_price_cents = roundUpTo49Or99(
              Math.round(computed / (1 + intBetween(`prevpct:${key}`, 2, 9) / 100)),
              true,
            );
            listing.previous_approved_at = agoIso(intBetween(`prevat:${key}`, 300, 900) * HOUR);
          }
          break;
        }
        case "pending_price": {
          const pendingHoursAgo = intBetween(`pending:${key}`, 1, 90);
          listing.pending_price_cents = computed;
          listing.pending_since = agoIso(pendingHoursAgo * HOUR);
          listing.pending_update_id = uuidFrom(`update:${key}:current`);
          listing.approved_at = agoIso((pendingHoursAgo + 200) * HOUR);
          if (index === EDGE_INDEX && size === SEED.zeroApprovedSize) {
            // HK$0 is a real approved price, not a missing one. Every relative move away from it is
            // infinite, so the row is held with no Δ at all and renders 「—」.
            listing.approved_price_cents = 0;
          } else if (index === EDGE_INDEX && size === SEED.exactlyTenSize) {
            listing.approved_price_cents = 249_900;
          } else if (computed !== null) {
            // Half the queue moved up out of the band and half moved down, so both badges appear.
            const down = chance(`dir:${key}`, 0.4);
            const factor = down ? 1 + intBetween(`downpct:${key}`, 9, 22) / 100 : 1 - intBetween(`uppct:${key}`, 11, 24) / 100;
            listing.approved_price_cents = roundUpTo49Or99(Math.round(computed * factor), true);
          }
          break;
        }
        case "pending_new": {
          listing.pending_price_cents = computed;
          listing.pending_since = agoIso(intBetween(`pendingnew:${key}`, 1, 60) * HOUR);
          listing.pending_update_id = uuidFrom(`update:${key}:current`);
          break;
        }
        case "needs_margins":
          break;
        case "rejected":
          listing.updated_at = agoIso(intBetween(`rejectedat:${key}`, 2, 200) * HOUR);
          break;
        case "inactive": {
          // A delisted listing keeps the price it was live at; that is what 重新上架 restores.
          listing.approved_price_cents = computed;
          listing.approved_at = agoIso(intBetween(`inactiveat:${key}`, 200, 800) * HOUR);
          break;
        }
      }

      listings.push(listing);
    }
  });

  return listings;
}

function buildUpdates(
  ctx: SeedContext,
  products: readonly ProductRow[],
  listings: readonly ListingRow[],
): UpdateRow[] {
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const updates: UpdateRow[] = [];

  for (const listing of listings) {
    const product = bySku.get(listing.product_sku);
    if (!product) continue;
    const key = `${listing.product_sku}:${listing.size}`;
    const { base, price } = resolveForListing(ctx, listing, product.group_id);
    const stockx = listing.sources.find((s) => s.source === "stockx");
    const costCents = base?.costCents ?? stockx?.cost_cents ?? 0;
    const source: EventSource = base?.slot === "in_house" ? "google_sheet" : "stockx";
    const observedAt = base?.costAt ?? agoIso(6 * HOUR);

    const common = {
      listing_id: listing.id,
      source,
      cost_cents: costCents,
      previous_cost_cents: stockx?.previous_cost_cents ?? null,
      previous_cost_at: stockx?.previous_cost_at ?? null,
      raw_price_cents: price?.rawCents ?? null,
      rounding_applied: price?.roundingApplied ?? false,
      engine: "v2" as const,
      threshold_up_percent: ctx.settings.auto_approve_up_percent,
      threshold_down_percent: ctx.settings.auto_approve_down_percent,
      observed_at: observedAt,
    };

    const isEdge = listing.product_sku === SEED.edgeSku;

    if (listing.approval_status === "pending_price") {
      const approved = listing.approved_price_cents;
      const newPrice =
        isEdge && listing.size === SEED.exactlyTenSize ? EDGE_PRICES.pending : listing.pending_price_cents;
      let deltaExact: number | null = null;
      let status: ApprovalRowStatusValue = "above_threshold";
      if (isEdge && listing.size === SEED.exactlyTenSize) {
        // 10.0040%, which prints as 10.0 and is nonetheless outside a 10% band. The badge must come
        // from this decision, never from the number the client just formatted.
        deltaExact = EDGE_PRICES.deltaExact;
        status = "above_threshold";
      } else if (approved !== null && approved !== 0 && newPrice !== null) {
        deltaExact = ((newPrice - approved) / approved) * 100;
        status = deltaExact >= 0 ? "above_threshold" : "below_threshold";
      } else if (approved === 0) {
        // No denominator, so no Δ — but the server still decided "held", and above_threshold is the
        // stored decision for a raise away from zero.
        status = "above_threshold";
      }
      updates.push({
        ...common,
        id: uuidFrom(`update:${key}:current`),
        approved_price_cents: approved,
        new_price_cents: newPrice,
        delta_percent_exact: deltaExact,
        status,
        outcome: "held_for_approval",
        pending_since: listing.pending_since,
        created_at: listing.pending_since ?? agoIso(HOUR),
      });

      if (isEdge ? listing.size === SEED.supersededSize : chance(`superseded:${key}`, 0.18)) {
        // Outside the band on its own terms: a row that would have auto-approved never sits in the
        // queue long enough for a newer update to supersede it.
        const olderPrice =
          approved !== null && approved > 0
            ? roundUpTo49Or99(Math.round(approved * 1.18), true)
            : newPrice === null
              ? null
              : roundUpTo49Or99(Math.round(newPrice * 0.94), true);
        // The raw figure that produced *this* row's price, not today's recomputation: 50 cents under
        // an x49/x99 price always rounds back to it, which keeps the pair internally consistent.
        const olderRaw = olderPrice === null ? null : olderPrice - 50;
        updates.push({
          ...common,
          id: uuidFrom(`update:${key}:superseded`),
          approved_price_cents: approved,
          new_price_cents: olderPrice,
          raw_price_cents: olderRaw,
          rounding_applied: true,
          delta_percent_exact:
            approved !== null && approved !== 0 && olderPrice !== null
              ? ((olderPrice - approved) / approved) * 100
              : null,
          // Latest wins (§5): one pending price per listing, and the older row is closed out rather
          // than deleted. It still renders in the queue and must carry no action.
          status: "superseded",
          outcome: "superseded",
          pending_since: listing.pending_since,
          created_at: agoIso(intBetween(`supat:${key}`, 100, 300) * HOUR),
        });
      }
      continue;
    }

    if (listing.approval_status === "pending_new") {
      updates.push({
        ...common,
        id: uuidFrom(`update:${key}:current`),
        approved_price_cents: null,
        new_price_cents: listing.pending_price_cents,
        delta_percent_exact: null,
        status: "pending_new",
        outcome: "new_listing",
        pending_since: listing.pending_since,
        created_at: listing.pending_since ?? agoIso(2 * HOUR),
      });
      continue;
    }

    if (listing.approval_status === "needs_margins") {
      updates.push({
        ...common,
        id: uuidFrom(`update:${key}:current`),
        approved_price_cents: null,
        new_price_cents: null,
        raw_price_cents: null,
        rounding_applied: false,
        delta_percent_exact: null,
        status: "needs_margins",
        outcome: "needs_margins",
        pending_since: null,
        created_at: agoIso(intBetween(`nmat:${key}`, 2, 120) * HOUR),
      });
      continue;
    }

    if (listing.approval_status === "rejected") {
      updates.push({
        ...common,
        id: uuidFrom(`update:${key}:current`),
        approved_price_cents: null,
        new_price_cents: price?.priceCents ?? null,
        delta_percent_exact: null,
        status: "rejected",
        outcome: "held_for_approval",
        pending_since: null,
        created_at: agoIso(intBetween(`rjat:${key}`, 4, 200) * HOUR),
      });
      continue;
    }

    if (listing.approval_status === "approved" && chance(`auto:${key}`, 0.45)) {
      const approved = listing.approved_price_cents;
      const previous =
        listing.previous_approved_price_cents ??
        (approved === null ? null : roundUpTo49Or99(Math.round(approved * 0.97), true));
      updates.push({
        ...common,
        id: uuidFrom(`update:${key}:auto`),
        approved_price_cents: previous,
        new_price_cents: approved,
        delta_percent_exact:
          previous !== null && previous !== 0 && approved !== null
            ? ((approved - previous) / previous) * 100
            : null,
        // Auto-approved rows stay in the queue and render 無需處理 with no action column.
        status: "within_band",
        outcome: "auto_approved",
        pending_since: null,
        created_at: listing.approved_at ?? agoIso(3 * HOUR),
      });
    }
  }

  return updates;
}

const ACTORS = ["系統自動", "爬取更新", "分組批次更新", "Mike"] as const;

function buildHistory(
  ctx: SeedContext,
  products: readonly ProductRow[],
  listings: readonly ListingRow[],
): HistoryRowStore[] {
  const rows: HistoryRowStore[] = [];
  const bySku = new Map(products.map((p) => [p.sku, p]));

  for (const listing of listings) {
    const product = bySku.get(listing.product_sku);
    if (!product) continue;
    if (product.sku === SEED.historyEmptySku) continue;

    const key = `${listing.product_sku}:${listing.size}`;
    const isFive = product.sku === SEED.historyFiveSku;
    const firstSize = sizesForIndex(HISTORY_FIVE_INDEX)[0];
    if (isFive && listing.size !== firstSize) continue;

    const count = isFive ? 5 : intBetween(`hcount:${key}`, 0, 4);
    const { price } = resolveForListing(ctx, listing, product.group_id);
    let priceCents = price?.priceCents ?? listing.approved_price_cents ?? 149_900;

    for (let n = 0; n < count; n += 1) {
      const changedAt = agoIso((n + 1) * intBetween(`hgap:${key}:${n}`, 30, 96) * HOUR);
      const changeType = isFive
        ? ("listing_price" as const)
        : pick(`htype:${key}:${n}`, [
            "listing_price",
            "listing_price",
            "cost",
            "margin_percent",
            "quantity",
            "listing_status",
          ] as const);
      const previousPrice = roundUpTo49Or99(
        Math.round(priceCents / (1 + intBetween(`hdelta:${key}:${n}`, -8, 12) / 100)),
        true,
      );
      const actor = isFive ? ACTORS[n % ACTORS.length] : pick(`hactor:${key}:${n}`, ACTORS);

      const base = {
        id: uuidFrom(`history:${key}:${n}`),
        listing_id: listing.id,
        product_sku: listing.product_sku,
        size: listing.size,
        changed_at: changedAt,
        source: actor === "爬取更新" ? ("stockx" as const) : ("dashboard" as const),
        actor_label: actor,
        actor_id: actor === "Mike" ? uuidFrom("user:me") : null,
        previous_quantity: null,
        quantity: null,
      };

      if (changeType === "listing_price") {
        rows.push({
          ...base,
          change_type: "listing_price",
          previous_value: (previousPrice / 100).toFixed(2),
          new_value: (priceCents / 100).toFixed(2),
          previous_price_cents: previousPrice,
          price_cents: priceCents,
          delta_cents: priceCents - previousPrice,
          delta_percent: previousPrice === 0 ? null : ((priceCents - previousPrice) / previousPrice) * 100,
        });
        priceCents = previousPrice;
      } else if (changeType === "quantity") {
        const before = intBetween(`hq:${key}:${n}`, 0, 8);
        rows.push({
          ...base,
          change_type: "quantity",
          previous_value: String(before),
          new_value: String(Math.max(0, before - 1)),
          previous_price_cents: priceCents,
          price_cents: priceCents,
          previous_quantity: before,
          quantity: Math.max(0, before - 1),
          delta_cents: null,
          delta_percent: null,
        });
      } else if (changeType === "cost") {
        const before = intBetween(`hc:${key}:${n}`, 60_000, 180_000);
        rows.push({
          ...base,
          change_type: "cost",
          previous_value: (before / 100).toFixed(2),
          new_value: ((before + 4_500) / 100).toFixed(2),
          previous_price_cents: priceCents,
          price_cents: priceCents,
          delta_cents: null,
          delta_percent: null,
        });
      } else if (changeType === "margin_percent") {
        rows.push({
          ...base,
          change_type: "margin_percent",
          previous_value: "12.0000",
          new_value: "15.0000",
          previous_price_cents: priceCents,
          price_cents: priceCents,
          delta_cents: null,
          delta_percent: null,
        });
      } else {
        rows.push({
          ...base,
          change_type: "listing_status",
          previous_value: "pending_price",
          new_value: "approved",
          previous_price_cents: priceCents,
          price_cents: priceCents,
          delta_cents: null,
          delta_percent: null,
        });
      }
    }
  }

  return rows.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
}

function buildJobs(listings: readonly ListingRow[]): { jobs: JobRow[]; jobItems: JobItemRow[] } {
  const dunkListings = listings.filter((l) => l.product_sku.startsWith("DD1391")).slice(0, 24);
  const jobs: JobRow[] = [
    {
      id: SEED.jobIds.succeeded,
      kind: "group_apply",
      scope_key: SEED.groupIds.jordan,
      status: "succeeded",
      total: 96,
      done: 96,
      ok_count: 96,
      failed_count: 0,
      created_at: agoIso(3 * DAY),
      started_at: agoIso(3 * DAY - 4 * MINUTE),
      finished_at: agoIso(3 * DAY - 9 * MINUTE),
      last_error: null,
      result: {
        updated_count: 96,
        overridden_cleared_count: 18,
        held_count: 0,
        average_price_before_cents: 141_600,
        average_price_after_cents: 142_000,
      },
      fail_every: null,
    },
    {
      id: SEED.jobIds.partial,
      kind: "group_apply",
      scope_key: SEED.groupIds.dunk,
      status: "succeeded",
      total: 24,
      done: 24,
      ok_count: 20,
      failed_count: 4,
      created_at: agoIso(2 * HOUR),
      started_at: agoIso(2 * HOUR - 3 * MINUTE),
      finished_at: agoIso(2 * HOUR - 7 * MINUTE),
      last_error: null,
      result: {
        updated_count: 20,
        overridden_cleared_count: 6,
        held_count: 0,
        average_price_before_cents: 118_400,
        average_price_after_cents: 121_900,
      },
      fail_every: null,
    },
    {
      id: SEED.jobIds.queued,
      kind: "group_rule_recompute",
      scope_key: SEED.groupIds.yeezy,
      status: "queued",
      total: 32,
      done: 0,
      ok_count: 0,
      failed_count: 0,
      created_at: agoIso(20 * 1000),
      started_at: null,
      finished_at: null,
      last_error: null,
      result: null,
      fail_every: null,
    },
    {
      id: SEED.jobIds.failed,
      kind: "group_apply",
      scope_key: SEED.groupIds.yeezy,
      status: "failed",
      total: 40,
      done: 12,
      ok_count: 12,
      failed_count: 0,
      created_at: agoIso(5 * DAY),
      started_at: agoIso(5 * DAY - MINUTE),
      finished_at: agoIso(5 * DAY - 3 * MINUTE),
      // Whole-job failure: distinct from state E, where the job finished and some items did not.
      last_error: "worker lost the database connection after 12 items",
      result: null,
      fail_every: null,
    },
    {
      id: SEED.jobIds.recompute,
      kind: "settings_recompute",
      scope_key: null,
      status: "succeeded",
      total: 218,
      done: 218,
      ok_count: 218,
      failed_count: 0,
      created_at: agoIso(4 * DAY),
      started_at: agoIso(4 * DAY - MINUTE),
      finished_at: agoIso(4 * DAY - 6 * MINUTE),
      last_error: null,
      result: {
        updated_count: 218,
        overridden_cleared_count: 0,
        held_count: 11,
        average_price_before_cents: 132_400,
        average_price_after_cents: 134_900,
      },
      fail_every: null,
    },
  ];

  const jobItems: JobItemRow[] = [];
  const failureReasons = ["missing_cost", "needs_margins", "listing_inactive", "shopify_error"] as const;
  dunkListings.forEach((listing, index) => {
    const failed = index % 6 === 5;
    jobItems.push({
      id: uuidFrom(`jobitem:${SEED.jobIds.partial}:${listing.id}`),
      job_id: SEED.jobIds.partial,
      listing_id: listing.id,
      product_sku: listing.product_sku,
      size: listing.size,
      status: failed ? "failed" : "succeeded",
      // Gap 16: the design's state E lists SKU and size, which `job_items` alone cannot name.
      reason: failed ? failureReasons[Math.floor(index / 6) % failureReasons.length] : null,
      attempts: failed ? 3 : 1,
      updated_at: agoIso(2 * HOUR - 4 * MINUTE),
    });
  });

  return { jobs, jobItems };
}

function buildCrawlRuns(): CrawlRunRow[] {
  const runs: CrawlRunRow[] = [];
  for (let n = 0; n < 10; n += 1) {
    const startedMs = SEED_NOW_MS - (n * 60 + 12) * MINUTE;
    runs.push({
      id: uuidFrom(`crawl:stockx:${n}`),
      run_id: `run-${iso(startedMs).slice(0, 19).replace(/[:T-]/g, "")}`,
      source: "stockx",
      trigger: "cron",
      started_at: iso(startedMs),
      finished_at: iso(startedMs + intBetween(`crawlms:${n}`, 40, 200) * 1000),
      item_count: intBetween(`crawlitems:${n}`, 180, 320),
      ok_count: 0,
      error_count: 0,
    });
  }
  for (const run of runs) {
    run.error_count = intBetween(`crawlerr:${run.id}`, 0, 4);
    run.ok_count = run.item_count - run.error_count;
  }
  const sheetStart = SEED_NOW_MS - 7 * HOUR;
  runs.push({
    id: uuidFrom("crawl:sheet:0"),
    run_id: "sheet-manual-0001",
    source: "google_sheet",
    trigger: "manual",
    started_at: iso(sheetStart),
    finished_at: iso(sheetStart + 22 * 1000),
    item_count: 64,
    ok_count: 63,
    error_count: 1,
  });
  return runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

function buildAllowedUsers(): AllowedUserRow[] {
  return [
    {
      email: "mike@empha.xyz",
      name: "Mike",
      added_at: agoIso(200 * DAY),
      added_by_name: null,
      user_id: uuidFrom("user:me"),
    },
  ];
}

export function buildSeed(): DbState {
  const groups = buildGroups();
  const settings = buildSettings();
  const ctx: SeedContext = { groups, settings };
  const products = buildProducts();
  const images = buildImages();
  const listings = buildListings(ctx, products);
  const updates = buildUpdates(ctx, products, listings).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const history = buildHistory(ctx, products, listings);
  const { jobs, jobItems } = buildJobs(listings);

  return {
    me: { user_id: uuidFrom("user:me"), email: "mike@empha.xyz", name: "Mike" },
    settings,
    groups,
    products,
    images,
    listings,
    updates,
    history,
    jobs,
    jobItems,
    crawlRuns: buildCrawlRuns(),
    allowedUsers: buildAllowedUsers(),
    shopifySyncJobs: [],
  };
}
