/**
 * Admin GraphQL 2026-07 documents, validated with Shopify `validate_graphql_codeblocks`.
 * Required custom-app scopes: read_products, write_products, read_inventory, write_inventory,
 * read_locations, read_markets_home.
 */

export const API_VERSION = "2026-07";

export const SHOP_ENABLEMENT_QUERY = /* GraphQL */ `
  query ShopEnablement {
    shop {
      name
      currencyCode
      myshopifyDomain
    }
    locations(first: 20) {
      nodes {
        id
        name
        isActive
        fulfillsOnlineOrders
      }
    }
    productsCount {
      count
    }
    products(first: 10) {
      nodes {
        id
        title
        status
        variants(first: 20) {
          nodes {
            id
            sku
            title
          }
        }
      }
    }
  }
`;

export const VARIANTS_BY_SKU_QUERY = /* GraphQL */ `
  query VariantsBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      nodes {
        id
        sku
        price
        inventoryQuantity
        product {
          id
          title
          status
        }
        inventoryItem {
          id
          tracked
          sku
        }
      }
    }
  }
`;

export const PRODUCT_SET_MUTATION = /* GraphQL */ `
  mutation SetProduct($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
    productSet(identifier: $identifier, synchronous: true, input: $input) {
      product {
        id
        title
        status
        variants(first: 100) {
          nodes {
            id
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
              tracked
              sku
            }
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const INVENTORY_SET_MUTATION = /* GraphQL */ `
  mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        reason
        changes {
          name
          delta
        }
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;
