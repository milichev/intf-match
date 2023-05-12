import { describeTypeInfo, isTypeInfoNullable, isValidDate } from "./utils";
import type {
  PropPath,
  Severity,
  TypeInfo,
  ValidationError,
  ValidationErrorType,
  ValidationResult,
} from "./types";

export const errorKindSeverity: Record<ValidationErrorType, Severity> = {
  arrayExpected: "error",
  objectExpected: "error",
  unsupported: "error",
  missingProperty: "error",
  typeMismatch: "error",
  unknownProperty: "warning",
  stringToDate: "hint",
  stringToRegExp: "hint",
};

const isArrayRe = /\s*(\w+)\s*(\[\s*])?$/;

export function validateData(
  data: any,
  schema: readonly TypeInfo[],
  expectedType: string
): ValidationResult {
  const errors: ValidationError[] = [];

  const typeInfo = findMatchingType(expectedType);
  if (!typeInfo) {
    addError(
      `Schema for expected type ${expectedType} not found`,
      "unsupported",
      data,
      []
    );
  } else {
    tryCheckValue({
      value: data,
      isOptional: false,
      typeInfo,
      path: [],
    });
  }

  return errors.length ? { errors } : {};

  function findMatchingType(typeName: string): TypeInfo | undefined {
    const parts = typeName.split("/");
    const shortName = parts.pop()!.trim();

    switch (shortName) {
      case "undefined":
      case "number":
      case "boolean":
      case "string":
      case "Date":
      case "bigint":
      case "RegExp":
        return { typeName: shortName };
      case "null":
        return { typeName: "null", isNullable: true };
      // case "true":
      // case "false":
      //   return {typeName: shortName, allowedValues: [shortName === "true"]}
      default:
    }

    const path = parts.join("/");
    let result = schema.find(
      (info) => (!path || info.loc?.includes(path)) && info.name === shortName
    );

    if (result) {
      return result;
    }

    const [, normalizedTypeName, brackets] = typeName.match(isArrayRe) ?? [];
    if (!normalizedTypeName) {
      return;
    }
    if (brackets) {
      result = findMatchingType(normalizedTypeName);
      if (result) {
        return {
          typeName: `${normalizedTypeName}[]`,
          arrayOf: result,
        };
      }
    }
  }

  function addError(
    message: string,
    type: ValidationErrorType,
    value: any,
    path: PropPath,
    typeInfo?: TypeInfo
  ) {
    if (path.length > 0) {
      message += `: ${path.join(".")}`;
    }
    errors.push({
      path,
      message,
      errorType: type,
      value,
      typeInfo,
    });
  }

  function tryCheckValue({
    value,
    isOptional,
    typeInfo,
    path,
    strict = true,
  }: {
    value: any;
    isOptional?: boolean;
    typeInfo: TypeInfo;
    path: PropPath;
    strict?: boolean;
  }) {
    if (!typeInfo.unionOf) {
      return checkValue({
        value,
        isOptional,
        typeInfo,
        path,
        strict,
      });
    }

    if (
      checkValue({
        value,
        isOptional,
        typeInfo,
        path,
        strict: false,
      }) ||
      typeInfo.unionOf.some((ti) =>
        checkValue({
          value,
          isOptional,
          typeInfo: ti,
          path,
          strict: false,
        })
      )
    ) {
      return true;
    }

    addError(
      `Expected a value matching \`${describeTypeInfo(
        typeInfo
      )}\`, encountered ${typeof value}`,
      "typeMismatch",
      value,
      path,
      typeInfo
    );

    return false;
  }

  function checkValue({
    value,
    isOptional,
    typeInfo,
    path,
    strict,
  }: {
    value: any;
    isOptional?: boolean;
    typeInfo: TypeInfo;
    path: PropPath;
    strict: boolean;
  }): boolean {
    if (value === undefined) {
      if (!isOptional) {
        if (strict) {
          addError(
            `Required "${typeInfo.typeName}" expected`,
            "missingProperty",
            value,
            path,
            typeInfo
          );
        }
        return false;
      }
      return true;
    }

    if (value === null) {
      if (!isTypeInfoNullable(typeInfo)) {
        if (strict) {
          addError(
            `Required "${typeInfo.typeName}" expected`,
            "missingProperty",
            value,
            path,
            typeInfo
          );
        }
        return false;
      }
      return true;
    }

    if (typeInfo.arrayOf) {
      if (!Array.isArray(value)) {
        if (strict) {
          addError(
            `Array of ${
              typeInfo.arrayOf.typeName
            } expected, encountered scalar ${typeof value}`,
            "arrayExpected",
            value,
            path,
            typeInfo
          );
        }
        return false;
      }

      const itemResults = value.map((item, i) =>
        tryCheckValue({
          value: item,
          // typeName,
          isOptional,
          // isNullable,
          // isArray: false,
          typeInfo: typeInfo.arrayOf!,
          path: [...path, i],
        })
      );

      return itemResults.every(Boolean);
    }

    if (Array.isArray(value)) {
      if (strict) {
        addError(
          `A scalar ${typeInfo.typeName} expected, encountered an array`,
          "objectExpected",
          value,
          path,
          typeInfo
        );
      }
      return false;
    }

    function addTypeMismatchError(encountered: string = typeof value) {
      addError(
        `A ${typeInfo.typeName} value expected, encountered ${encountered}`,
        "typeMismatch",
        value,
        path,
        typeInfo
      );
    }

    if (typeInfo.allowedValues?.some((av) => value === av)) {
      return true;
    }

    switch (typeInfo.typeName) {
      case "boolean":
      case "string":
      case "number":
      case "bigint":
        if (typeof value !== typeInfo.typeName) {
          strict && addTypeMismatchError();
          return false;
        }
        return true;

      case "Date":
        if (!isValidDate(value)) {
          strict && addTypeMismatchError(`${value}`);
          return false;
        }
        if (typeof value === "string") {
          addError(
            `A Date expected but string "${value}" is encountered. Would be better to convert the string pattern to Date instance`,
            "stringToDate",
            value,
            path,
            typeInfo
          );
        }
        return true;

      case "RegExp":
        if (!(value instanceof RegExp)) {
          if (typeof value !== "string") {
            strict && addTypeMismatchError();
          } else {
            addError(
              `A RegExp expected but string "${value}" is encountered. Would be better to convert the string pattern to RegExp instance`,
              "stringToRegExp",
              value,
              path,
              typeInfo
            );
          }
          return false;
        }
        return true;
    }

    return !!typeInfo.properties && checkObject(value, typeInfo, path, strict);
  }

  function checkObject(
    obj: any,
    typeInfo: TypeInfo,
    path: PropPath,
    strict: boolean
  ): boolean {
    if (typeof obj !== "object") {
      strict &&
        addError(
          `Expected object, got ${typeof obj}`,
          "objectExpected",
          obj,
          path,
          typeInfo
        );
      return false;
    }

    const propResults = typeInfo.properties!.map((propInfo) => {
      const propPath = [...path, propInfo.name];
      const propValue = obj[propInfo.name];

      return tryCheckValue({
        value: propValue,
        typeInfo: propInfo.type,
        isOptional: propInfo.isOptional,
        path: propPath,
        strict,
      });
    });

    if (strict) {
      const extraProperties = Object.keys(obj).filter(
        (key) => !typeInfo.properties!.find((prop) => prop.name === key)
      );
      if (extraProperties.length > 0) {
        addError(
          `Unknown properties: ${extraProperties.join(", ")}`,
          "unknownProperty",
          obj,
          path,
          typeInfo
        );
      }
    }

    return propResults.every(Boolean);
  }
}
