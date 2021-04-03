import ts from 'typescript';

export const getFirstError = (program: ts.EmitAndSemanticDiagnosticsBuilderProgram) => {
  const syntacticDiagnostics = program.getSyntacticDiagnostics();

  if (syntacticDiagnostics.length > 0) {
    return syntacticDiagnostics[0];
  }

  const semanticDiagnostics = program.getSemanticDiagnostics();

  if (semanticDiagnostics.length > 0) {
    return semanticDiagnostics[0];
  }
}

export const getFirstErrorForSourceFile = (sourceFile: ts.SourceFile, program: ts.EmitAndSemanticDiagnosticsBuilderProgram) => {
  const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);

  if (syntacticDiagnostics.length > 0) {
    return syntacticDiagnostics[0];
  }

  const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);

  if (semanticDiagnostics.length > 0) {
    return semanticDiagnostics[0];
  }
}
