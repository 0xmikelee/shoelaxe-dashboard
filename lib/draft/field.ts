/**
 * The tri-state every overridable field in the Screen 8 draft uses.
 *
 * **untouched** — absent from the PATCH payload. The server leaves the column alone.
 * **set** — a value. The server writes it.
 * **cleared** — JSON `null`. The server resets to the group rule.
 *
 * The backend distinguishes these with `Object.hasOwn`. Modelling "cleared" as `undefined`
 * serialises the key away and the reset silently does not happen — which is why this type exists
 * and why a null/undefined sentinel is forbidden.
 */

export type FieldState<T> =
  | { readonly kind: "untouched" }
  | { readonly kind: "set"; readonly value: T }
  | { readonly kind: "cleared" };

export const untouched = <T>(): FieldState<T> => ({ kind: "untouched" });

export const setValue = <T>(value: T): FieldState<T> => ({ kind: "set", value });

export const cleared = <T>(): FieldState<T> => ({ kind: "cleared" });

export const isDirty = <T>(state: FieldState<T>): boolean => state.kind !== "untouched";

export const isCleared = <T>(state: FieldState<T>): boolean => state.kind === "cleared";

/**
 * What the UI should show. A cleared override has no draft value — the caller supplies the
 * fallback (the group rule) rather than this function inventing one.
 */
export function displayed<T>(state: FieldState<T>, snapshot: T): T {
  return state.kind === "set" ? state.value : snapshot;
}

/**
 * Typing the original value back is a no-op, not a write. Compared with `Object.is` unless a
 * caller needs structural equality (image order).
 */
export function setOrUntouched<T>(
  value: T,
  snapshot: T,
  equals: (left: T, right: T) => boolean = Object.is,
): FieldState<T> {
  return equals(value, snapshot) ? untouched() : setValue(value);
}
