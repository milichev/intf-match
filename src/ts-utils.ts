import ts from "typescript";
import { PseudoBigInt } from "typescript";

export type DescribedTypeDeclaration =
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration;

export function areTypeSame(a: ts.Type, b: ts.Type) {
  const sym = a.aliasSymbol ?? a.getSymbol();
  return sym
    ? sym === b.aliasSymbol ?? b.getSymbol()
    : a.intrinsicName
    ? a.intrinsicName === b.intrinsicName
    : false;
}

export function isPseudoBigInt(value: any): value is PseudoBigInt {
  return !!value && "negative" in value && "base10Value" in value;
}

export function isSymbol(node: unknown): node is ts.Symbol {
  return !!node && typeof node === "object" && "escapedName" in node;
}

export function isNullType(type: ts.Type) {
  return (type.flags & ts.TypeFlags.Null) !== 0;
}

export function isNullableType(type: ts.Type): boolean {
  return (
    isNullType(type) ||
    (type.isUnion() && type.types.some(isNullableType)) ||
    !!type.aliasSymbol?.getDeclarations()?.some(isNullableTypeNode)
  );
}

export function isEnumType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.EnumLiteral) !== 0;
}

export function isLiteralType(type: ts.Type): type is ts.LiteralType {
  return (type.flags & ts.TypeFlags.Literal) !== 0;
}

export function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return "target" in type;
}

export function isArrayType(type: ts.TypeReference): boolean {
  return (
    type.target.symbol.escapedName === "Array" ||
    type.target.symbol.escapedName === "ReadonlyArray"
  );
}

export function isNodeExported(node: ts.Node): boolean {
  return (
    (ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Export) !==
    0
  );
}

export function isTopLevelNode(node: ts.Node): boolean {
  return !!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile;
}

export function isDescribedTypeDeclaration(
  node: ts.Node
): node is DescribedTypeDeclaration {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  );
}

export function getDeclarationAtSymbol<T extends ts.Declaration>(
  symbol: ts.Symbol | undefined,
  predicate: (node: ts.Node) => node is T
): T | undefined {
  return symbol?.getDeclarations()?.find(predicate);
}

export function resolveReferencedType(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): [ts.Type, ts.TypeNode | undefined] {
  typeNode = unparenthiseTypeNode(typeNode);
  if (ts.isTypeReferenceNode(typeNode) && !typeNode.typeArguments?.length) {
    const declaration = checker
      .getSymbolAtLocation(typeNode.typeName)
      ?.getDeclarations()
      ?.find(isDescribedTypeDeclaration);
    if (declaration) {
      return [
        checker.getTypeAtLocation(declaration),
        ts.isTypeAliasDeclaration(declaration) ? declaration.type : undefined,
      ];
    }
  }
  return [checker.getTypeAtLocation(typeNode), typeNode];
}

export function getDeclarationByType<T extends ts.Declaration>(
  type: ts.Type,
  predicate: (node: ts.Node) => node is T
): T | undefined {
  return getDeclarationAtSymbol(
    type.getSymbol() ?? type.aliasSymbol,
    predicate
  );
}

export function getDescribedDeclarationByType(
  type: ts.Type
): DescribedTypeDeclaration | undefined {
  return (
    getDeclarationByType(type, isDescribedTypeDeclaration) ??
    getParent(
      type.getSymbol()?.getDeclarations()?.find(ts.isTypeLiteralNode),
      ts.isTypeAliasDeclaration
    )
  );
}

function isNullLiteral(node: ts.Node): node is ts.NullLiteral {
  return node.kind === ts.SyntaxKind.NullKeyword;
}

export function isNullableTypeNode(typeNode: ts.Node): boolean {
  return (
    (ts.isLiteralTypeNode(typeNode) && isNullLiteral(typeNode.literal)) ||
    (ts.isUnionTypeNode(typeNode) && typeNode.types.some(isNullableTypeNode)) ||
    (ts.isTypeAliasDeclaration(typeNode) && isNullableTypeNode(typeNode.type))
  );
}

export function getEnumValues(
  declaration: ts.EnumDeclaration,
  checker: ts.TypeChecker
): readonly ts.LiteralType["value"][] {
  return declaration.members
    .map(checker.getTypeAtLocation)
    .filter(isLiteralType)
    .map((memberType) => memberType.value);
}

export function collectUnions(types: ts.Type[], all: Set<ts.Type>) {
  types.forEach((type) => {
    if (type.isUnion() && !isEnumType(type)) {
      collectUnions(type.types, all);
    } else {
      all.add(type);
    }
  });
}

export function unparenthiseTypeNode(typeNode: ts.TypeNode): ts.TypeNode {
  return ts.isParenthesizedTypeNode(typeNode)
    ? unparenthiseTypeNode(typeNode.type)
    : typeNode;
}

export function getParent<T extends ts.Node>(
  typeNode: ts.Node | undefined,
  predicate: (d: ts.Node) => d is T,
  getParent: (n: ts.Node) => ts.Node | undefined = (n) => n.parent
): T | undefined {
  let node = typeNode as ts.Node | undefined;
  while (node) {
    if (predicate(node)) {
      return node;
    }
    node = getParent(node);
  }
}

export function visitTypeNodes(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visitor: (params: {
    /** Guaranteed not a union type node */
    typeNode?: ts.TypeNode;
    enumDeclaration?: ts.EnumDeclaration;
    interfaceDeclaration?: ts.InterfaceDeclaration;
  }) => void
) {
  if (ts.isUnionTypeNode(typeNode)) {
    typeNode.types.forEach((t) =>
      visitTypeNodes(unparenthiseTypeNode(t), checker, visitor)
    );
  } else if (ts.isParenthesizedTypeNode(typeNode)) {
    visitTypeNodes(typeNode.type, checker, visitor);
  } else if (
    ts.isTypeReferenceNode(typeNode) &&
    !typeNode.typeArguments?.length
  ) {
    checker
      .getSymbolAtLocation(typeNode.typeName)
      ?.getDeclarations()
      ?.forEach((declaration) => {
        if (ts.isTypeAliasDeclaration(declaration)) {
          visitTypeNodes(declaration.type, checker, visitor);
        } else if (ts.isEnumDeclaration(declaration)) {
          visitor({ enumDeclaration: declaration });
        } else if (ts.isInterfaceDeclaration(declaration)) {
          visitor({ interfaceDeclaration: declaration });
        }
      });
  } else {
    visitor({ typeNode });
  }
}

export function visitTypes(
  type: ts.Type,
  checker: ts.TypeChecker,
  visitor: (params: { type: ts.Type }) => void
) {
  if (type.isUnion()) {
    type.types.forEach((t) => visitTypes(t, checker, visitor));
  } else {
    visitor({ type });
  }
}
