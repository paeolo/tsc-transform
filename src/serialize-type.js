const ts = require('typescript');

const getTypeSerializer = (context) => {
  const {
    factory,
    getCompilerOptions,
    getEmitResolver
  } = context;

  const resolver = getEmitResolver();
  const compilerOptions = getCompilerOptions();
  const languageVersion = ts.getEmitScriptTarget(compilerOptions);
  const strictNullChecks = ts.getStrictOptionValue(compilerOptions, "strictNullChecks");

  const getGlobalBigIntNameWithFallback = () => {
    return languageVersion < ts.ScriptTarget.ESNext
      ? factory.createConditionalExpression(
        factory.createTypeCheck(factory.createIdentifier("BigInt"), "function"),
        undefined,
        factory.createIdentifier("BigInt"),
        undefined,
        factory.createIdentifier("Object")
      )
      : factory.createIdentifier("BigInt");
  }

  const getGlobalSymbolNameWithFallback = () => {
    return factory.createConditionalExpression(
      factory.createTypeCheck(factory.createIdentifier("Symbol"), "function"),
      undefined,
      factory.createIdentifier("Symbol"),
      undefined,
      factory.createIdentifier("Object")
    );
  }


  const serializeTypeList = (types, currentNameScope) => {
    let serializedUnion;

    for (let typeNode of types) {
      while (typeNode.kind === ts.SyntaxKind.ParenthesizedType) {
        typeNode = typeNode.type;
      }

      if (typeNode.kind === ts.SyntaxKind.NeverKeyword) {
        continue;
      }
      if (!strictNullChecks
        && (typeNode.kind === ts.SyntaxKind.LiteralType
          && typeNode.literal.kind === ts.SyntaxKind.NullKeyword || typeNode.kind === ts.SyntaxKind.UndefinedKeyword)) {
        continue;
      }

      const serializedIndividual = serializeTypeNode(typeNode, currentNameScope);

      if (ts.isIdentifier(serializedIndividual) && serializedIndividual.escapedText === "Object") {
        // One of the individual is global object, return immediately
        return serializedIndividual;
      }
      // If there exists union that is not void 0 expression, check if the the common type is identifier.
      // anything more complex and we will just default to Object
      else if (serializedUnion) {
        // Different types
        if (!ts.isIdentifier(serializedUnion) ||
          !ts.isIdentifier(serializedIndividual) ||
          serializedUnion.escapedText !== serializedIndividual.escapedText) {
          return factory.createIdentifier("Object");
        }
      }
      else {
        // Initialize the union type
        serializedUnion = serializedIndividual;
      }
    }

    // If we were able to find common type, use it
    return serializedUnion || factory.createVoidZero(); // Fallback is only hit if all union constituients are null/undefined/never
  }

  const createCheckedValue = (left, right) => {
    return factory.createLogicalAnd(
      factory.createStrictInequality(factory.createTypeOfExpression(left), factory.createStringLiteral("undefined")),
      right
    );
  }

  const serializeEntityNameAsExpression = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        return node;

      case ts.SyntaxKind.QualifiedName:
        return factory.createPropertyAccessExpression(serializeEntityNameAsExpression(node.left), node.right);
    }
  }

  const serializeEntityNameAsExpressionFallback = (node) => {
    if (node.kind === ts.SyntaxKind.Identifier) {
      // A -> typeof A !== undefined && A
      const copied = serializeEntityNameAsExpression(node);
      return createCheckedValue(copied, copied);
    }
    if (node.left.kind === ts.SyntaxKind.Identifier) {
      // A.B -> typeof A !== undefined && A.B
      return createCheckedValue(serializeEntityNameAsExpression(node.left), serializeEntityNameAsExpression(node));
    }
    // A.B.C -> typeof A !== undefined && (_a = A.B) !== void 0 && _a.C
    const left = serializeEntityNameAsExpressionFallback(node.left);
    const temp = factory.createTempVariable(hoistVariableDeclaration);
    return factory.createLogicalAnd(
      factory.createLogicalAnd(
        left.left,
        factory.createStrictInequality(factory.createAssignment(temp, left.right), factory.createVoidZero())
      ),
      factory.createPropertyAccessExpression(temp, node.right)
    );
  }

  function serializeTypeReferenceNode(node, currentNameScope) {
    const kind = resolver.getTypeReferenceSerializationKind(node.typeName, currentNameScope);
    switch (kind) {
      case ts.TypeReferenceSerializationKind.Unknown:
        // From conditional type type reference that cannot be resolved is Similar to any or unknown
        if (ts.findAncestor(node, n => n.parent && ts.isConditionalTypeNode(n.parent) && (n.parent.trueType === n || n.parent.falseType === n))) {
          return factory.createIdentifier("Object");
        }

        const serialized = serializeEntityNameAsExpressionFallback(node.typeName);
        const temp = factory.createTempVariable(hoistVariableDeclaration);
        return factory.createConditionalExpression(
          factory.createTypeCheck(factory.createAssignment(temp, serialized), "function"),
                /*questionToken*/ undefined,
          temp,
                /*colonToken*/ undefined,
          factory.createIdentifier("Object")
        );

      case ts.TypeReferenceSerializationKind.TypeWithConstructSignatureAndValue:
        return serializeEntityNameAsExpression(node.typeName);

      case ts.TypeReferenceSerializationKind.VoidNullableOrNeverType:
        return factory.createVoidZero();

      case ts.TypeReferenceSerializationKind.BigIntLikeType:
        return getGlobalBigIntNameWithFallback();

      case ts.TypeReferenceSerializationKind.BooleanType:
        return factory.createIdentifier("Boolean");

      case ts.TypeReferenceSerializationKind.NumberLikeType:
        return factory.createIdentifier("Number");

      case ts.TypeReferenceSerializationKind.StringLikeType:
        return factory.createIdentifier("String");

      case ts.TypeReferenceSerializationKind.ArrayLikeType:
        return factory.createIdentifier("Array");

      case ts.TypeReferenceSerializationKind.ESSymbolType:
        return languageVersion < ts.ScriptTarget.ES2015
          ? getGlobalSymbolNameWithFallback()
          : factory.createIdentifier("Symbol");

      case ts.TypeReferenceSerializationKind.TypeWithCallSignature:
        return factory.createIdentifier("Function");

      case ts.TypeReferenceSerializationKind.Promise:
        return factory.createIdentifier("Promise");

      case ts.TypeReferenceSerializationKind.ObjectType:
        return factory.createIdentifier("Object");
      default:
        return ts.Debug.assertNever(kind);
    }
  }

  const serializeTypeNode = (node, currentNameScope) => {
    if (node === undefined) {
      return factory.createIdentifier("Object");
    }

    switch (node.kind) {
      case ts.SyntaxKind.VoidKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
      case ts.SyntaxKind.NeverKeyword:
        return factory.createVoidZero();

      case ts.SyntaxKind.ParenthesizedType:
        return serializeTypeNode(node.type, currentNameScope);

      case ts.SyntaxKind.FunctionType:
      case ts.SyntaxKind.ConstructorType:
        return factory.createIdentifier("Function");

      case ts.SyntaxKind.ArrayType:
        return serializeTypeNode(node.elementType, currentNameScope);
      case ts.SyntaxKind.TupleType:
        return factory.createArrayLiteralExpression(
          node.elements.map(value => {
            if (ts.isNamedTupleMember(value)) {
              return serializeTypeNode(value.type);
            }
            else {
              return serializeTypeNode(value)
            }
          })
        );

      case ts.SyntaxKind.TypePredicate:
      case ts.SyntaxKind.BooleanKeyword:
        return factory.createIdentifier("Boolean");

      case ts.SyntaxKind.StringKeyword:
        return factory.createIdentifier("String");

      case ts.SyntaxKind.ObjectKeyword:
        return factory.createIdentifier("Object");

      case ts.SyntaxKind.LiteralType:
        switch (node.literal.kind) {
          case ts.SyntaxKind.StringLiteral:
          case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return factory.createIdentifier("String");

          case ts.SyntaxKind.PrefixUnaryExpression:
          case ts.SyntaxKind.NumericLiteral:
            return factory.createIdentifier("Number");

          case ts.SyntaxKind.BigIntLiteral:
            return getGlobalBigIntNameWithFallback();

          case ts.SyntaxKind.TrueKeyword:
          case ts.SyntaxKind.FalseKeyword:
            return factory.createIdentifier("Boolean");

          case ts.SyntaxKind.NullKeyword:
            return factory.createVoidZero();

          default:
            return ts.Debug.failBadts.SyntaxKind(node.literal);
        }

      case ts.SyntaxKind.NumberKeyword:
        return factory.createIdentifier("Number");

      case ts.SyntaxKind.BigIntKeyword:
        return getGlobalBigIntNameWithFallback();

      case ts.SyntaxKind.SymbolKeyword:
        return languageVersion < ScriptTarget.ES2015
          ? getGlobalSymbolNameWithFallback()
          : factory.createIdentifier("Symbol");

      case ts.SyntaxKind.TypeReference:
        return serializeTypeReferenceNode(node, currentNameScope);

      case ts.SyntaxKind.IntersectionType:
      case ts.SyntaxKind.UnionType:
        return serializeTypeList(node.types, currentNameScope);

      case ts.SyntaxKind.ConditionalType:
        return serializeTypeList([node.trueType, node.falseType], currentNameScope);

      case ts.SyntaxKind.TypeOperator:
        if (node.operator === ts.SyntaxKind.ReadonlyKeyword) {
          return serializeTypeNode(node.type, currentNameScope);
        }
        break;

      case ts.SyntaxKind.TypeQuery:
      case ts.SyntaxKind.IndexedAccessType:
      case ts.SyntaxKind.MappedType:
      case ts.SyntaxKind.TypeLiteral:
      case ts.SyntaxKind.AnyKeyword:
      case ts.SyntaxKind.UnknownKeyword:
      case ts.SyntaxKind.ThisType:
      case ts.SyntaxKind.ImportType:
        break;

      // handle JSDoc types from an invalid parse
      case ts.SyntaxKind.JSDocAllType:
      case ts.SyntaxKind.JSDocUnknownType:
      case ts.SyntaxKind.JSDocFunctionType:
      case ts.SyntaxKind.JSDocVariadicType:
      case ts.SyntaxKind.JSDocNamepathType:
        break;

      case ts.SyntaxKind.JSDocNullableType:
      case ts.SyntaxKind.JSDocNonNullableType:
      case ts.SyntaxKind.JSDocOptionalType:
        return serializeTypeNode(node.type, currentNameScope);
      default:
        return ts.Debug.failBadts.SyntaxKind(node);
    }

    return factory.createIdentifier("Object");
  }

  return serializeTypeNode;
}

module.exports = {
  getTypeSerializer
}
