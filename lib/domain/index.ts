/**
 * The pure core's public surface. Client components import from here (API-GAPS Gap 2) so a price
 * preview on Screens 2, 3, 4 and 8 runs the same arithmetic the server decided with.
 */
export * from "@/lib/domain/approval";
export * from "@/lib/domain/baseCost";
export * from "@/lib/domain/margins";
export * from "@/lib/domain/money";
export * from "@/lib/domain/pricing";
export * from "@/lib/domain/rounding";
export * from "@/lib/domain/sources";
export * from "@/lib/domain/supersede";
export * from "@/lib/domain/time";
export * from "@/lib/domain/types";
