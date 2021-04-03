import ts from 'typescript';

import {
  FilePath
} from '../dependencies';

export const getValidSourceFile = (fileName: FilePath, program: ts.EmitAndSemanticDiagnosticsBuilderProgram): ts.SourceFile => {
  const sourceFile = program.getSourceFile(fileName);

  if (!sourceFile) {
    throw new Error(
      `Could not find source file: '${fileName}'.`
    );
  }

  return sourceFile;
}
