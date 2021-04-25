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

  const wrapper = (type, items) => {
    const expressions = [
      factory.createPropertyAssignment('type', type)
    ];

    if (items) {
      expressions.push(factory.createPropertyAssignment('items', items));
    }

    return factory.createObjectLiteralExpression(expressions);
  }

  const getGlobalBigIntNameWithFallback = () => {
    return languageVersion < ts.ScriptTarget.ESNext
      ? factory.createConditionalExpression(
        factory.createTypeCheck(factory.createIdentifier('BigInt'), 'function'),
        undefined,
        factory.createIdentifier('BigInt'),
        undefined,
        factory.createIdentifier('Object')
      )
      : factory.createIdentifier('BigInt');
  }

  const getGlobalSymbolNameWithFallback = () => {
    return factory.createConditionalExpression(
      factory.createTypeCheck(factory.createIdentifier('Symbol'), 'function'),
      undefined,
      factory.createIdentifier('Symbol'),
      undefined,
      factory.createIdentifier('Object')
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

  function serializeTypeReferenceNode(node, currentNameScope) {
    const kind = resolver.getTypeReferenceSerializationKind(node.typeName, currentNameScope);
    switch (kind) {
      case ts.TypeReferenceSerializationKind.Unknown:
        return wrapper(factory.createIdentifier('Object'));

      case ts.TypeReferenceSerializationKind.TypeWithConstructSignatureAndValue:
        return wrapper(serializeEntityNameAsExpression(node.typeName));

      case ts.TypeReferenceSerializationKind.VoidNullableOrNeverType:
        return wrapper(factory.createVoidZero());

      case ts.TypeReferenceSerializationKind.BigIntLikeType:
        return wrapper(getGlobalBigIntNameWithFallback());

      case ts.TypeReferenceSerializationKind.BooleanType:
        return wrapper(factory.createIdentifier('Boolean'));

      case ts.TypeReferenceSerializationKind.NumberLikeType:
        return wrapper(factory.createIdentifier('Number'));

      case ts.TypeReferenceSerializationKind.StringLikeType:
        return wrapper(factory.createIdentifier('String'));

      case ts.TypeReferenceSerializationKind.ArrayLikeType:
        return wrapper(factory.createIdentifier('Array'));

      case ts.TypeReferenceSerializationKind.ESSymbolType:
        return wrapper(
          languageVersion < ts.ScriptTarget.ES2015
            ? getGlobalSymbolNameWithFallback()
            : factory.createIdentifier('Symbol'));

      case ts.TypeReferenceSerializationKind.TypeWithCallSignature:
        return wrapper(factory.createIdentifier('Function'));

      case ts.TypeReferenceSerializationKind.Promise:
        return wrapper(factory.createIdentifier('Promise'));

      case ts.TypeReferenceSerializationKind.ObjectType:
        return wrapper(factory.createIdentifier('Object'));
      default:
        return ts.Debug.assertNever(kind);
    }
  }

  const serializeTypeNode = (node, currentNameScope) => {
    if (node === undefined) {
      return wrapper(factory.createIdentifier('Object'));
    }

    switch (node.kind) {
      case ts.SyntaxKind.VoidKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
      case ts.SyntaxKind.NeverKeyword:
        return wrapper(factory.createVoidZero());

      case ts.SyntaxKind.ParenthesizedType:
        return serializeTypeNode(node.type, currentNameScope);

      case ts.SyntaxKind.FunctionType:
      case ts.SyntaxKind.ConstructorType:
        return wrapper(factory.createIdentifier('Function'));

      case ts.SyntaxKind.ArrayType:
        return wrapper(
          factory.createIdentifier('Array'),
          serializeTypeNode(node.elementType, currentNameScope)
        );
      case ts.SyntaxKind.TupleType:
        return wrapper(
          factory.createIdentifier('Array'),
          factory.createArrayLiteralExpression(
            node.elements.map(value => {
              if (ts.isNamedTupleMember(value)) {
                return serializeTypeNode(value.type, currentNameScope);
              }
              else {
                return serializeTypeNode(value, currentNameScope)
              }
            })
          ));

      case ts.SyntaxKind.TypePredicate:
      case ts.SyntaxKind.BooleanKeyword:
        return wrapper(factory.createIdentifier('Boolean'));

      case ts.SyntaxKind.StringKeyword:
        return wrapper(factory.createIdentifier('String'));

      case ts.SyntaxKind.ObjectKeyword:
        return wrapper(factory.createIdentifier('Object'));

      case ts.SyntaxKind.LiteralType:
        switch (node.literal.kind) {
          case ts.SyntaxKind.StringLiteral:
          case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return wrapper(factory.createIdentifier('String'));

          case ts.SyntaxKind.PrefixUnaryExpression:
          case ts.SyntaxKind.NumericLiteral:
            return wrapper(factory.createIdentifier('Number'));

          case ts.SyntaxKind.BigIntLiteral:
            return wrapper(getGlobalBigIntNameWithFallback());

          case ts.SyntaxKind.TrueKeyword:
          case ts.SyntaxKind.FalseKeyword:
            return wrapper(factory.createIdentifier('Boolean'));

          case ts.SyntaxKind.NullKeyword:
            return wrapper(factory.createNull());

          default:
            return ts.Debug.failBadts.SyntaxKind(node.literal);
        }

      case ts.SyntaxKind.NumberKeyword:
        return wrapper(factory.createIdentifier('Number'));

      case ts.SyntaxKind.BigIntKeyword:
        return wrapper(getGlobalBigIntNameWithFallback());

      case ts.SyntaxKind.SymbolKeyword:
        return wrapper(
          languageVersion < ScriptTarget.ES2015
            ? getGlobalSymbolNameWithFallback()
            : factory.createIdentifier('Symbol')
        );

      case ts.SyntaxKind.TypeReference:
        return serializeTypeReferenceNode(node, currentNameScope);

      case ts.SyntaxKind.IntersectionType:
        return wrapper(
          factory.createStringLiteral('ALL_OF'),
          factory.createArrayLiteralExpression(
            node.types.map(value => serializeTypeNode(value, currentNameScope))
          )
        );
      case ts.SyntaxKind.UnionType:
        return wrapper(
          factory.createStringLiteral('ONE_OF'),
          factory.createArrayLiteralExpression(
            node.types.map(value => serializeTypeNode(value, currentNameScope))
          )
        );

      case ts.SyntaxKind.ConditionalType:
        return wrapper(
          factory.createStringLiteral('ONE_OF'),
          factory.createArrayLiteralExpression(
            [node.trueType, node.falseType].map(value => serializeTypeNode(value, currentNameScope))
          )
        );

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

    return wrapper(factory.createIdentifier('Object'));
  }

  return serializeTypeNode;
}

module.exports = {
  getTypeSerializer
}
