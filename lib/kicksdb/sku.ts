/** Collapse StockX/sheet SKUs (`555088-101`) and GOAT SKUs (`555088 101`) to one key. */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export function skusMatch(a: string, b: string): boolean {
  const left = normalizeSku(a);
  const right = normalizeSku(b);
  return left.length > 0 && left === right;
}
