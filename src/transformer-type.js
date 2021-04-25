const ts = require('typescript');

const {
  getTypeSerializer
} = require('./serialize-type');

const METADATA_KEY = 'design:resolver';

const typeResolverTransformer = (program) => (context) => {
  const {
    factory,
    getEmitHelperFactory,
    getCompilerOptions
  } = context;

  const compilerOptions = getCompilerOptions();
  const serializeTypeNode = getTypeSerializer(context);

  return (sourceFile) => {
    const isDecoratedClassElement = (member, isStatic, parent) => {
      return ts.nodeOrChildIsDecorated(member, parent)
        && isStatic === ts.hasSyntacticModifier(member, ts.ModifierFlags.Static);
    }

    function isInstanceDecoratedClassElement(member, parent) {
      return isDecoratedClassElement(member, false, parent);
    }

    const getDecoratedClassElements = (node) => {
      return ts.filter(node.members, m => isInstanceDecoratedClassElement(m, node));
    }

    const serializeTypeOfNode = (node, currentNameScope) => {
      switch (node.kind) {
        case ts.SyntaxKind.PropertyDeclaration:
          return serializeTypeNode(node.type, currentNameScope);
        default:
          return factory.createVoidZero();
      }
    }

    const createTypeMedataExpression = (node, currentNameScope) => getEmitHelperFactory()
      .createMetadataHelper(
        METADATA_KEY,
        factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
          serializeTypeOfNode(node, currentNameScope)
        )
      );

    const addTypeMetadata = (currentNameScope, node, decorators) => {
      if (!decorators || decorators.length === 0) {
        return;
      }

      decorators.push(
        factory.createDecorator(createTypeMedataExpression(node, currentNameScope))
      );
    }

    const visitor = (node) => {
      if (ts.isClassDeclaration(node)) {
        const members = getDecoratedClassElements(node);

        for (const member of members) {
          if (ts.isPropertyDeclaration(member)) {
            addTypeMetadata(node, member, member.decorators);
          }
        }

        return node;
      }

      return ts.visitEachChild(node, (child) => visitor(child), context);
    };

    if (compilerOptions.emitDecoratorMetadata) {
      return ts.visitNode(sourceFile, visitor);
    }
    else {
      return sourceFile;
    }
  }
}

module.exports = {
  typeResolverTransformer
}
