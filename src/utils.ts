import fs from "fs";
import path from "path";
import ts from "typescript";
import safeJsonStringify from "safe-json-stringify";
import type { TypeInfo } from "./types";

export const rootDir = (() => {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) {
      break;
    }
    dir = parent;
  }
  return dir;
})();

const MAX_CALL_LEVEL = 15;
const propsToSkip = ["parent", "checker", "statements"];

export function stripTsNoise(o: any, visited = new Set(), level = 0): any {
  if (level > MAX_CALL_LEVEL) {
    return "[MAX_CALL_LEVEL]";
  }

  if (!o || typeof o !== "object" || o instanceof Date || o instanceof RegExp) {
    return o;
  }

  visited.add(o);

  if (Array.isArray(o)) {
    let itemChanged = false;
    const mappedArray = o
      .filter((item) => !visited.has(item))
      .map((item) => {
        const mappedItem = stripTsNoise(item, visited, level + 1);
        if (mappedItem !== item) {
          itemChanged = true;
        }
        return mappedItem;
      });
    return itemChanged || mappedArray.length < o.length ? mappedArray : o;
  }

  const entries = Object.entries(o);
  let valueChanged = false;
  const mappedEntries = entries
    .filter(([key, value]) => !propsToSkip.includes(key) && !visited.has(value))
    .map(([key, valueValue]) => {
      const mapped = stripTsNoise(valueValue, visited, level + 1);
      if (mapped !== valueValue) {
        valueChanged = true;
      }
      return [key, mapped];
    });
  return valueChanged || entries.length > mappedEntries.length
    ? Object.fromEntries(mappedEntries)
    : o;
}

export function log(...args: any[]) {
  console.log(
    ...args.map((a) =>
      a && typeof a === "object"
        ? safeJsonStringify(stripTsNoise(a), null, 2)
        : a
    )
  );
}

export function assignTruthy<T>(target: T, values: Partial<T>) {
  (Object.keys(values) as (keyof T)[]).forEach((key) => {
    const value = values[key];
    if (value && (!Array.isArray(value) || value.length > 0)) {
      target[key] = value as T[typeof key];
    }
  });
  return target;
}

/**
 * Returns `true` if `input` is a valid `Date`, or contains `number` or `string` that represent a valid date.
 */
export function isValidDate(value: any) {
  if (!(value instanceof Date)) {
    const typ = typeof value;
    if (
      (typ !== "number" || !Number.isInteger(value) || value < 0) &&
      (typ !== "string" || value === "")
    ) {
      return false;
    }
    value = new Date(value);
  }

  return !Number.isNaN(+value);
}

export function isScalar(
  value: unknown
): value is string | number | boolean | undefined | null | bigint {
  if (
    value === null ||
    value === undefined ||
    value === true ||
    value === false
  ) {
    return true;
  }
  const to = typeof value;
  return to === "string" || to === "number" || to === "bigint";
}

export function isTypeInfoNullable(ti: TypeInfo) {
  return ti.isNullable || ti.unionOf?.some(isTypeInfoNullable);
}

export function describeTypeInfo(typeInfo: TypeInfo): string {
  let result: string;
  if (typeInfo.arrayOf) {
    result = describeTypeInfo(typeInfo.arrayOf);
    if (/^\w+(?:\[])*$/.test(result)) {
      result = `(${result})`;
    }
  } else {
    result = typeInfo.typeName;
    const unionOf = typeInfo.unionOf?.map(describeTypeInfo).join(" | ");
    if (unionOf) {
      result += ` | ${unionOf}`;
    }
  }
  return result;
}

export function getCompilerOptions(): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
  };
}
