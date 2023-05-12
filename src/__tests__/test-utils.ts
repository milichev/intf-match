import * as _ from "lodash";
import type { DeepPartial, PropInfo, TypeInfo } from "../types";

export const findTypeInfo = (
  infos: readonly TypeInfo[],
  predicate: string | _.ListIterateeCustom<TypeInfo, boolean>
) =>
  _.find<TypeInfo>(
    infos,
    typeof predicate === "string"
      ? (ti) => ti.name === predicate || ti.typeName === predicate
      : predicate
  );

export const findPropInfo = (
  typeInfo: TypeInfo,
  predicate: string | _.ListIterateeCustom<PropInfo, boolean>
) =>
  _.find<PropInfo>(
    typeInfo.properties,
    typeof predicate === "string" ? { name: predicate } : predicate
  );

export function assertBool<T>(expression: T, expectedCondition: boolean) {
  const matchers = expect(expression);
  try {
    return expectedCondition ? matchers.toBeTruthy() : matchers.toBeFalsy();
  } catch (e) {
    throw recreateErrorWithoutStackTop(e);
  }
}

function recreateErrorWithoutStackTop(e: Error) {
  const rethrown = new (e.constructor as ErrorConstructor)(e.message);
  const lines = e.stack.split("\n");
  lines.splice(
    lines.findIndex((l) => l.startsWith("    at ")),
    1
  );
  Object.assign(rethrown, {
    ...e,
    stack: lines.join("\n"),
  });
  return rethrown;
}

export function expectDeepContaining<T>(obj: DeepPartial<T>): any {
  if (_.isPlainObject(obj)) {
    const shouldMap = _.some<any>(
      obj,
      (value) =>
        _.isPlainObject(value) || (_.isArray(value) && value.length > 0)
    );
    return expect.objectContaining(
      shouldMap ? _.mapValues<any>(obj, expectDeepContaining) : obj
    );
  }

  if (_.isArray(obj)) {
    return expect.arrayContaining(obj.map(expectDeepContaining));
  }

  return obj;
}
