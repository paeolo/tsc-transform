import ts from 'typescript'

export const typeResolverTransformer: (program: ts.Program) => ts.TransformerFactory<ts.SourceFile>
