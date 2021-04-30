const ts = require('typescript');

const INTRISIC_TYPES = {
  ANY: 'any',
  BIGINT: 'bigint',
  BOOLEAN: 'boolean',
  ERROR: 'error',
  FALSE: 'false',
  INTRISIC: 'intrinsic',
  NEVER: 'never',
  NULL: 'null',
  NUMBER: 'number',
  OBJECT: 'object',
  STRING: 'string',
  SYMBOL: 'symbol',
  TRUE: 'true',
  UNDEFINED: 'undefined',
  UNKNOWN: 'unknown',
  VOID: 'void',
}

const getTypeSerializer = (typeChecker, context) => {
  const {
    factory,
    getCompilerOptions,
  } = context;

  const compilerOptions = getCompilerOptions();
  const languageVersion = ts.getEmitScriptTarget(compilerOptions);

  let globalPromiseConstructorSymbol;
  let globalArraySymbol;

  const wrapper = (type, items, title) => {
    const expressions = [
      factory.createPropertyAssignment('type', type)
    ];

    if (items) {
      expressions.push(factory.createPropertyAssignment('items', items));
    }

    if (title) {
      expressions.push(
        factory.createPropertyAssignment(
          'title',
          factory.createStringLiteral(title, true)
        )
      );
    }

    return factory.createObjectLiteralExpression(expressions);
  }

  const getGlobalSymbol = (name, meaning) => {
    return typeChecker.resolveName(
      name,
      undefined,
      meaning,
      false
    )
  }

  const getGlobalPromiseConstructorSymbol = () => {
    return globalPromiseConstructorSymbol
      || (globalPromiseConstructorSymbol = getGlobalSymbol('Promise', ts.SymbolFlags.Value));
  }

  const getGlobalArrayConstructorSymbol = () => {
    return globalArraySymbol
      || (globalArraySymbol = getGlobalSymbol('Array', ts.SymbolFlags.Value));
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

  const resolveEntityName = (typeName, currentNameScope, meaning) => {
    if (ts.isIdentifier(typeName)) {
      return typeChecker.resolveName(
        typeName.text,
        currentNameScope,
        meaning,
        false
      );
    }
    else if (ts.isQualifiedName(typeName)) {
      let namespace = resolveEntityName(
        typeName.left,
        currentNameScope,
        ts.SymbolFlags.Namespace
      );

      if (!namespace
        || !namespace.exports
        || ts.nodeIsMissing(typeName.right)) {
        return undefined;
      }

      const symbol = namespace.exports.get(typeName.right.escapedText);

      if (!symbol || !(symbol.flags & meaning)) {
        return undefined;
      }

      return symbol;
    }
  }

  const isFunctionType = (type) => {
    return !!(type.flags & ts.TypeFlags.Object)
      && typeChecker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0;
  }

  const isPromiseType = (type) => {
    const globalPromiseSymbol = getGlobalPromiseConstructorSymbol();

    if (type.symbol && type.symbol === globalPromiseSymbol) {
      return true;
    }

    return false;
  }

  const isArrayType = (type) => {
    const globalArraySymbol = getGlobalArrayConstructorSymbol();

    if (type.symbol && type.symbol === globalArraySymbol) {
      return true;
    }

    return false;
  }

  const isTupleType = (type) => {
    return !!(ts.getObjectFlags(type) & ts.ObjectFlags.Reference && type.target.objectFlags & ts.ObjectFlags.Tuple);
  }

  const serializeTypeReferenceNode = (node, currentNameScope) => {
    if (node.typeName) {
      const symbol = resolveEntityName(node.typeName, currentNameScope, ts.SymbolFlags.Value);

      if (symbol) {
        if (symbol.flags & ts.SymbolFlags.RegularEnum) {
          return wrapper(
            factory.createStringLiteral('REGULAR_ENUM'),
            serializeEntityNameAsExpression(node.typeName),
            symbol.escapedName
          );
        } else {
          return wrapper(serializeEntityNameAsExpression(node.typeName));
        }
      }
    }

    const type = typeChecker.getTypeFromTypeNode(node);

    if (!type) {
      return wrapper(factory.createIdentifier('Object'));
    }

    if (type.intrinsicName) {
      switch (type.intrinsicName) {
        case INTRISIC_TYPES.ANY:
        case INTRISIC_TYPES.ERROR:
        case INTRISIC_TYPES.OBJECT:
        case INTRISIC_TYPES.UNDEFINED:
        case INTRISIC_TYPES.UNKNOWN:
          return wrapper(factory.createIdentifier('Object'));
        case INTRISIC_TYPES.VOID:
        case INTRISIC_TYPES.NEVER:
          return wrapper(factory.createVoidZero());
        case INTRISIC_TYPES.BIGINT:
          return wrapper(getGlobalBigIntNameWithFallback());
        case INTRISIC_TYPES.BOOLEAN:
        case INTRISIC_TYPES.TRUE:
        case INTRISIC_TYPES.FALSE:
          return wrapper(factory.createIdentifier('Boolean'));
        case INTRISIC_TYPES.NUMBER:
          return wrapper(factory.createIdentifier('Number'));
        case INTRISIC_TYPES.STRING:
          return wrapper(factory.createIdentifier('String'));
        case INTRISIC_TYPES.NULL:
          return wrapper(factory.createNull());
        case INTRISIC_TYPES.SYMBOL:
          return wrapper(
            languageVersion < ts.ScriptTarget.ES2015
              ? getGlobalSymbolNameWithFallback()
              : factory.createIdentifier('Symbol')
          );
      }
    }
    else if (isFunctionType(type)) {
      return wrapper(factory.createIdentifier('Function'));
    }
    else if (isPromiseType(type)) {
      return wrapper(factory.createIdentifier('Promise'));
    }
    else if (isArrayType(type) || isTupleType(type)) {
      return wrapper(factory.createIdentifier('Array'));
    }

    return wrapper(factory.createIdentifier('Object'));
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
