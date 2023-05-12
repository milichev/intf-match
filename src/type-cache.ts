import ts from "typescript";
import type { LiteralValue, TypeInfo } from "./types";
import { isPseudoBigInt, isSymbol, isTypeReference } from "./ts-utils";
import { isScalar } from "./utils";

type GenericTypeKey = { s: ts.Symbol; t: TypeKey };
type TypeKey =
  | LiteralValue
  | null
  | undefined
  | boolean
  | ts.Symbol
  | GenericTypeKey
  | readonly TypeKey[];
type CacheKey = TypeKey;

function isGenericTypeKey(key: unknown): key is GenericTypeKey {
  return !!key && typeof key === "object" && "s" in key && "t" in key;
}

export function createTypeInfoCache(checker: ts.TypeChecker) {
  const cache: Array<{ key: CacheKey; value: TypeInfo }> = [];

  function get(key: CacheKey): TypeInfo | undefined {
    return cache.find((entry) => isEqual(key, entry.key))?.value;
  }

  function set(key: CacheKey, value: TypeInfo) {
    cache.push({ key, value });
  }

  function getTypeKey(type: ts.Type): TypeKey {
    if (type.intrinsicName) {
      switch (type.intrinsicName) {
        case "null":
          return null;
        case "undefined":
          return undefined;
        case "true":
          return true;
        case "false":
          return false;
        default:
          return `intrinsic:${type.intrinsicName}`;
      }
    }

    if (type.isLiteral()) {
      return type.value;
    }

    if (type.isUnion()) {
      return type.types.map((t) => getTypeKey(t));
    }

    const self = type.aliasSymbol ?? type.getSymbol();

    if (isTypeReference(type)) {
      const generics = getKey(
        type.aliasTypeArguments?.length
          ? type.aliasTypeArguments
          : checker.getTypeArguments(type)
      );
      if (generics && (!Array.isArray(generics) || generics.length)) {
        return {
          s: self!,
          t: generics,
        } satisfies GenericTypeKey;
      }
    }

    return self;
  }

  function getKey(types: readonly ts.Type[]): TypeKey {
    if (types.length === 0) {
      return null;
    }
    const keys = types.map(getTypeKey);
    return keys.length === 1 ? keys[0] : keys;
  }

  function isEqual(a: CacheKey, b: CacheKey): boolean {
    // check for single intrinsic name
    if (isScalar(a)) {
      return a === b;
    }
    if (isScalar(b)) {
      return false;
    }

    // check for single type symbol
    if (isSymbol(a)) {
      return isSymbol(b) && a === b;
    }
    if (isSymbol(b)) {
      return false;
    }

    // check for generic type key
    if (isGenericTypeKey(a)) {
      return isGenericTypeKey(b) && a.s === b.s && isEqual(a.t, b.t);
    }
    if (isGenericTypeKey(b)) {
      return false;
    }

    // check for ts pseudo-bigint
    if (isPseudoBigInt(a)) {
      return (
        isPseudoBigInt(b) &&
        a.negative === b.negative &&
        a.base10Value === b.base10Value
      );
    }
    if (isPseudoBigInt(b)) {
      return false;
    }

    // check for union
    return (
      a.length === b.length && a.every((ak) => b.some((bk) => isEqual(ak, bk)))
    );
  }

  function values(): TypeInfo[] {
    return cache.map((entry) => entry.value);
  }

  return {
    get,
    set,
    getKey,
    values,
  };
}
