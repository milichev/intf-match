import ts from "typescript";
import path from "path";
import { assignTruthy } from "./utils";
import {
  areTypeSame,
  DescribedTypeDeclaration,
  getDeclarationAtSymbol,
  getDescribedDeclarationByType,
  getEnumValues,
  getParent,
  isArrayType,
  isDescribedTypeDeclaration,
  isLiteralType,
  isNodeExported,
  isNullableType,
  isNullType,
  isTypeReference,
  resolveReferencedType,
  unparenthiseTypeNode,
  visitTypeNodes,
  visitTypes,
} from "./ts-utils";
import type { LiteralValue, PropInfo, TypeIndexInfo, TypeInfo } from "./types";
import { createTypeInfoCache } from "./type-cache";

export function parseProgram(
  program: ts.Program,
  baseDir: string
): readonly TypeInfo[] {
  const checker = program.getTypeChecker();
  const cache = createTypeInfoCache(checker);

  program.getSourceFiles().forEach((sourceFile) => {
    if (!sourceFile.isDeclarationFile) {
      ts.forEachChild(sourceFile, visit);
    }
  });

  return cache
    .values()
    .filter((info) => !!info.name)
    .sort((a, b) => a.name!.localeCompare(b.name!));

  function visit(node: ts.Node): void {
    if (!isNodeExported(node)) {
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      getTypeInfo(checker.getTypeAtLocation(node), node.type);
    } else if (ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
      getTypeInfo(checker.getTypeAtLocation(node));
    } else {
      ts.forEachChild(node, visit);
    }
  }

  function getTypeInfo(type: ts.Type, typeNode?: ts.TypeNode): TypeInfo {
    typeNode = typeNode ? unparenthiseTypeNode(typeNode) : undefined;

    // first, check for unions to exclude storing unified types in cache

    /** all union types incl self */
    let unionTypes: ts.Type[] = collectUnionTypes(type, typeNode);

    const cacheKey = cache.getKey(unionTypes);
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // if a new type, create a new info entry
    const result = {} as TypeInfo;

    // ... and store the info object by the type early for cases of recursion via property types.
    cache.set(cacheKey, result);

    let arrayOf: TypeInfo | undefined;
    let allowedValues: Set<LiteralValue> | undefined;
    const typeName = checker.typeToString(type);
    let isNullable: boolean | undefined;

    unionTypes = unionTypes.filter((nodeType) => {
      if (isLiteralType(nodeType)) {
        (allowedValues ?? (allowedValues = new Set())).add(nodeType.value);
      } else if (isNullType(nodeType)) {
        isNullable = true;
      } else {
        return !areTypeSame(nodeType, type) || unionTypes.length > 1;
      }
    });
    if (unionTypes.length === 1 && areTypeSame(unionTypes[0], type)) {
      unionTypes = [];
    }
    const unionOf: TypeInfo[] = unionTypes.map((t) => getTypeInfo(t));

    if (typeNode) {
      if (ts.isArrayTypeNode(typeNode)) {
        const elementTypeNode = unparenthiseTypeNode(typeNode.elementType);
        const elementType = checker.getTypeAtLocation(elementTypeNode);
        arrayOf = getTypeInfo(elementType, elementTypeNode);
        // if (ts.isTypeAliasDeclaration(typeNode.parent)) {
        //   result.name = typeNode.parent.name.getText();
        // }
      }
    } else {
      if (isTypeReference(type) && isArrayType(type)) {
        arrayOf = getTypeInfo(checker.getTypeArguments(type)[0]);
      }
    }

    const declaration = getDeclaration(type, typeNode);

    if (declaration) {
      /*
                        if (!typeNode && ts.isTypeAliasDeclaration(declaration)) {
                          typeNode = unparenthiseTypeNode(declaration.type);
                        }
                  */

      const sourceFile = declaration.getSourceFile();
      const pos = ts.getLineAndCharacterOfPosition(sourceFile, declaration.pos);
      const fileName = path.relative(baseDir, sourceFile.fileName);
      const name = declaration.name.getText();
      // typeName = name;
      const isEnum = ts.isEnumDeclaration(declaration);
      if (isEnum) {
        allowedValues = new Set(getEnumValues(declaration, checker));
      }
      const isTsDeclaration =
        sourceFile.isDeclarationFile && fileName.includes("/typescript/");

      const collectProps =
        !isEnum &&
        !isTsDeclaration &&
        !(type.isUnion() && type.types.every(isLiteralType));

      assignTruthy(result, {
        name,
        loc: `${fileName}:${pos.line + 1}`,
        isEnum,
        properties: collectProps
          ? checker
              // get props and methods
              .getPropertiesOfType(type)
              .map((sym) => getDeclarationAtSymbol(sym, ts.isPropertySignature))
              // filter out methods
              .filter(Boolean)
              .map((prop) => getPropInfo(prop!))
          : undefined,
        indexes:
          collectProps || (isTsDeclaration && name === "Record")
            ? checker
                .getIndexInfosOfType(type)
                .map((info) => getTypeIndexInfo(info))
            : undefined,
        // ||          (isTsDeclaration && getRecordIndexInfos(type, typeNode)),

        // declaration,
      });
    }

    isNullable || (isNullable = isNullableType(type));

    if (isLiteralType(type)) {
      allowedValues = new Set([type.value]);
    }

    assignTruthy(result, {
      typeName,
      isNullable,
      arrayOf,
      unionOf,
      allowedValues: allowedValues ? Array.from(allowedValues) : undefined,
    });

    return result;
  }

  function collectUnionTypes(type: ts.Type, typeNode?: ts.TypeNode) {
    const typeSet = new Set<ts.Type>();
    if (!typeNode) {
      visitTypes(type, checker, (visitee) => {
        typeSet.add(visitee.type);
      });
    } else {
      visitTypeNodes(typeNode, checker, (visitee) => {
        if (visitee.typeNode) {
          const nodeType = checker.getTypeAtLocation(visitee.typeNode);
          typeSet.add(nodeType);
        } else if (visitee.enumDeclaration) {
          const enumSymbol = checker.getSymbolAtLocation(
            visitee.enumDeclaration.name
          );
          const enumType =
            enumSymbol &&
            checker.getTypeOfSymbolAtLocation(
              enumSymbol,
              enumSymbol.valueDeclaration!
            );
          enumType && typeSet.add(enumType);
        } else if (visitee.interfaceDeclaration) {
          const interfaceType = checker.getTypeAtLocation(
            visitee.interfaceDeclaration
          );
          typeSet.add(interfaceType);
        }
      });
    }

    return Array.from(typeSet);
  }

  function getDeclaration(
    type: ts.Type | ts.TypeReference,
    typeNode?: ts.TypeNode
  ): DescribedTypeDeclaration | undefined {
    if (type.intrinsicName) {
      return undefined;
    }

    if (typeNode) {
      if (ts.isTypeLiteralNode(typeNode)) {
        const parentDecl = getParent(typeNode, ts.isTypeAliasDeclaration);
        if (parentDecl) {
          return parentDecl;
        }
      }

      /* && !typeNode.typeArguments?.length*/
      if (ts.isTypeReferenceNode(typeNode)) {
        return checker
          .getSymbolAtLocation(typeNode.typeName)
          ?.getDeclarations()
          ?.find(isDescribedTypeDeclaration);
      }
      if (ts.isArrayTypeNode(typeNode)) {
        return type
          .getSymbol()
          ?.getDeclarations()
          ?.find(isDescribedTypeDeclaration);
      }
    }

    return getDescribedDeclarationByType(type);
  }

  function getPropInfo(propertySignature: ts.PropertySignature) {
    const [type, typeNode] = resolveReferencedType(
      propertySignature.type!,
      checker
    );
    return assignTruthy<PropInfo>(
      {
        name: propertySignature.name.getText(),
        type: getTypeInfo(type, typeNode),
      },
      {
        isOptional: !!propertySignature?.questionToken,
      }
    );
  }

  function getTypeIndexInfo(info: ts.IndexInfo): TypeIndexInfo {
    return {
      keyType: getTypeInfo(
        info.keyType,
        // TODO: check that we get the proper indexing type node
        info.declaration?.parameters[0].type
      ),
      type: getTypeInfo(info.type, info.declaration?.type),
      // declaration: info.declaration,
    };
  }
}
