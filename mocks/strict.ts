import { z, type ZodType } from "zod";

/**
 * A deep-strict copy of a wire schema: every nested object rejects unknown keys.
 *
 * `WIRE_SCHEMAS` members strip unknown keys rather than rejecting them, which is right for a server
 * parsing its own output and useless for checking a fixture — a mock that invents `total_stock`
 * alongside `total_in_house_quantity` would parse cleanly and then render nothing when the field
 * quietly disappears at the real backend. Strictifying turns that into a failure with a path.
 *
 * Only containers are rebuilt; leaves (string, enum, literal, the ISO and uuid formats) are returned
 * as they are, so every regex and format check survives the copy.
 */
const cache = new WeakMap<ZodType, ZodType>();

interface AnyDef {
  type: string;
  shape?: Record<string, ZodType>;
  element?: ZodType;
  innerType?: ZodType;
  options?: ZodType[];
  left?: ZodType;
  right?: ZodType;
  keyType?: ZodType;
  valueType?: ZodType;
  items?: ZodType[];
  rest?: ZodType | null;
  getter?: () => ZodType;
  defaultValue?: unknown;
  in?: ZodType;
  out?: ZodType;
}

export function deepStrict<T extends ZodType>(schema: T): ZodType {
  const cached = cache.get(schema);
  if (cached) return cached;

  const def = schema.def as unknown as AnyDef;
  let result: ZodType = schema;

  switch (def.type) {
    case "object": {
      const shape = def.shape ?? {};
      const next: Record<string, ZodType> = {};
      for (const [key, value] of Object.entries(shape)) next[key] = deepStrict(value);
      result = z.strictObject(next);
      break;
    }
    case "array":
      if (def.element) result = z.array(deepStrict(def.element));
      break;
    case "nullable":
      if (def.innerType) result = z.nullable(deepStrict(def.innerType));
      break;
    case "optional":
      if (def.innerType) result = z.optional(deepStrict(def.innerType));
      break;
    case "nonoptional":
      if (def.innerType) result = z.nonoptional(deepStrict(def.innerType));
      break;
    case "default":
      if (def.innerType) result = deepStrict(def.innerType).default(def.defaultValue as never);
      break;
    case "union":
      if (def.options) result = z.union(def.options.map(deepStrict));
      break;
    case "intersection":
      if (def.left && def.right) result = z.intersection(deepStrict(def.left), deepStrict(def.right));
      break;
    case "record":
      if (def.keyType && def.valueType) {
        result = z.record(def.keyType as z.core.$ZodRecordKey, deepStrict(def.valueType));
      }
      break;
    case "tuple":
      if (def.items) {
        result = def.rest
          ? z.tuple(def.items.map(deepStrict) as [ZodType, ...ZodType[]], deepStrict(def.rest))
          : z.tuple(def.items.map(deepStrict) as [ZodType, ...ZodType[]]);
      }
      break;
    case "lazy":
      if (def.getter) {
        const getter = def.getter;
        result = z.lazy(() => deepStrict(getter()));
      }
      break;
    default:
      // Leaves, and anything this build of zod adds later: returned untouched, which can only ever be
      // *less* strict — never wrong.
      result = schema;
  }

  cache.set(schema, result);
  return result;
}

export interface StrictParseFailure {
  path: string;
  message: string;
}

/** Parses under deep-strict rules and returns the issues rather than throwing, for readable tests. */
export function strictIssues(schema: ZodType, value: unknown): StrictParseFailure[] {
  const parsed = deepStrict(schema).safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
