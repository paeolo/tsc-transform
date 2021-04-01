import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';

declare module 'typescript' {
  export function loadWithLocalCache<T>(
    names: string[],
    containingFile: string,
    redirectedReference: ts.ResolvedProjectReference | undefined,
    loader: (name: string, containingFile: string, redirectedReference: ts.ResolvedProjectReference | undefined) => T
  ): T[]
  export const Debug: any;
}

export interface TSProjectOptions {
  configPath: FilePath;
  commandLine: ts.ParsedCommandLine;
  host: ts.CompilerHost;
  moduleResolutionCache: ts.ModuleResolutionCache;
}

export class TSProject {
  private commandLine: ts.ParsedCommandLine;
  private compilerOptions: ts.CompilerOptions;
  private compilerHost: ts.CompilerHost;
  private configFileParsingDiagnostics: readonly ts.Diagnostic[];
  private program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;

  constructor(options: TSProjectOptions) {
    this.compilerOptions = {
      ...options.commandLine.options,
      tsBuildInfoFile: path.join(path.dirname(options.configPath), '.tsbuildinfo')
    }
    this.commandLine = options.commandLine;

    const loader = (moduleName: string, containingFile: string, redirectedReference: ts.ResolvedProjectReference | undefined) => ts
      .resolveModuleName(
        moduleName,
        containingFile,
        this.compilerOptions,
        this.compilerHost,
        options.moduleResolutionCache,
        redirectedReference
      )
      .resolvedModule!;

    this.compilerHost = {
      ...options.host,
      resolveModuleNames: (moduleNames, containingFile, _reusedNames, redirectedReference) =>
        ts.loadWithLocalCache(ts.Debug.checkEachDefined(moduleNames), containingFile, redirectedReference, loader)
    };

    this.configFileParsingDiagnostics = ts.getConfigFileParsingDiagnostics(this.commandLine);
    this.program = ts.readBuilderProgram(this.compilerOptions, this.compilerHost);

    if (!this.isProgramUptoDate()) {
      this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        this.getRootNames(),
        this.compilerOptions,
        this.compilerHost,
        this.program,
        this.configFileParsingDiagnostics,
        this.getProjectReferences(),
      );

      this.program.emit();
    }
  }

  private getProjectReferences() {
    return this.commandLine.projectReferences;
  }

  private getRootNames() {
    return this.commandLine.fileNames;
  }

  private isProgramUptoDate() {
    return false
  }
}
