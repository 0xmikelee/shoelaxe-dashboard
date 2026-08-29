export type ShopifyErrorCode =
  | "auth"
  | "http"
  | "graphql"
  | "user_errors"
  | "ambiguous_sku"
  | "not_found"
  | "currency"
  | "location"
  | "assertion";

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly code: ShopifyErrorCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}
