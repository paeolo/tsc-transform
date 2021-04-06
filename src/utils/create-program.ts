import ts from 'typescript';

export const createProgram = (
  rootNames: readonly string[] | undefined,
  options: ts.CompilerOptions | undefined,
  host?: ts.CompilerHost,
  oldProgram?: ts.EmitAndSemanticDiagnosticsBuilderProgram,
  configFileParsingDiagnostics?: readonly ts.Diagnostic[],
  projectReferences?: readonly ts.ProjectReference[],
): ts.EmitAndSemanticDiagnosticsBuilderProgram => {
  const timestamp = new Date().getTime();

  const program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
    rootNames,
    options,
    host,
    oldProgram,
    configFileParsingDiagnostics,
    projectReferences,
  );

  const stateProgram = (<any>program).getState().program;
  const originalGetProgramBuildInfo = stateProgram.getProgramBuildInfo;

  stateProgram.getProgramBuildInfo = () => {
    return {
      ...originalGetProgramBuildInfo(),
      rootNames,
      timestamp,
    }
  }

  return program;
}
