import ts from "typescript";
import type { DescribedTypeDeclaration } from "./ts-utils";

export type LiteralValue = ts.LiteralType["value"];

export interface TypeInfo {
  name?: string;
  loc?: string;

  /** When it's a union type, contains an array of type names */
  typeName: string; //  | string[];
  unionOf?: TypeInfo[];
  arrayOf?: TypeInfo;
  /** The union type includes `null` */
  isNullable?: boolean;
  isEnum?: boolean;
  /** All allowed values, if it's an enum or union type of literals */
  allowedValues?: readonly LiteralValue[] | undefined;

  type?: ts.Type;
  declaration?: DescribedTypeDeclaration;

  properties?: readonly PropInfo[];
  indexes?: readonly TypeIndexInfo[];
}

export interface TypeIndexInfo {
  keyType: TypeInfo;
  type: TypeInfo;
  declaration?: ts.IndexSignatureDeclaration;
}

export interface PropInfo {
  name: string;
  /** When the prop is declared with the question mark */
  isOptional?: boolean;
  type: TypeInfo;
}

export interface ValidationResult {
  errors?: ValidationError[];
}

export interface ValidationError {
  path: PropPath;
  message: string;
  errorType: ValidationErrorType;
  value: any;
  typeInfo?: TypeInfo;
}

export type ValidationErrorType =
  | "typeMismatch"
  | "missingProperty"
  | "unknownProperty"
  | "arrayExpected"
  | "objectExpected"
  | "unsupported"
  | "stringToRegExp"
  | "stringToDate";

export type Severity = "hint" | "warning" | "error";

export type PropPath = readonly (string | number)[];

declare module "typescript" {
  interface Type {
    intrinsicName?: string;
  }
}

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;
