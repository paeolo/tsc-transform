import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  BuildStatus,
  BuildStatusGetter
} from '../types';
import * as utils from '../utils';

export const enum Extension {
  Ts = ".ts",
  Tsx = ".tsx",
  Dts = ".d.ts",
  Js = ".js",
  Jsx = ".jsx",
  Json = ".json",
  TsBuildInfo = ".tsbuildinfo"
}

declare module 'typescript' {
  export function loadWithLocalCache<T>(
    names: string[],
    containingFile: string,
    redirectedReference: ts.ResolvedProjectReference | undefined,
    loader: (name: string, containingFile: string, redirectedReference: ts.ResolvedProjectReference | undefined) => T
  ): T[];
  export const Debug: any;
}

const noop = () => { };
const setModifiedTime = ts.sys.setModifiedTime ? ((path: string, date: Date) => ts.sys.setModifiedTime!(path, date)) : noop;

export interface TSProjectOptions {
  configPath: FilePath;
  commandLine: ts.ParsedCommandLine;
  host: ts.CompilerHost;
  moduleResolutionCache: ts.ModuleResolutionCache;
  buildStatusGetter: BuildStatusGetter;
  projectReferences: FilePath[];
}

export class TSProject {
  private commandLine: ts.ParsedCommandLine;
  private compilerHost: ts.CompilerHost;
  private configFileParsingDiagnostics: readonly ts.Diagnostic[];
  private program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
  private buildStatus: BuildStatus;
  private buildStatusGetter: BuildStatusGetter;
  private projectReferences: FilePath[];

  constructor(options: TSProjectOptions) {
    this.commandLine = options.commandLine;
    this.commandLine.options.tsBuildInfoFile = path.join(path.dirname(options.configPath), '.tsbuildinfo');

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

    this.buildStatus = BuildStatus.Unchanged;
    this.buildStatusGetter = options.buildStatusGetter;
    this.projectReferences = options.projectReferences;

    this.configFileParsingDiagnostics = ts.getConfigFileParsingDiagnostics(this.commandLine);
    this.program = ts.readBuilderProgram(this.compilerOptions, this.compilerHost);
    this.initialBuild();
  }

  public getBuildStatus() {
    return this.buildStatus;
  }

  private get compilerOptions() {
    return this.commandLine.options;
  }

  private getFileNames() {
    return this.commandLine.fileNames;
  }

  private isProgramUptoDate(fileNames: FilePath[]) {
    return utils.isProgramUptoDate(fileNames, this.compilerHost, this.commandLine);
  }

  private isEveryDependencyUnchanged() {
    return this.projectReferences
      .every(configPath => this.buildStatusGetter(configPath));
  }

  private updateOutputTimestamps() {
    const now = new Date();
    const outputs = ts.getAllProjectOutputs(this.commandLine, !this.compilerHost.useCaseSensitiveFileNames());

    for (const output of outputs) {
      setModifiedTime(output, now);
    }
  }

  private initialBuild() {
    if (!this.isProgramUptoDate(this.getFileNames()) || !this.isEveryDependencyUnchanged()) {
      this.buildStatus = BuildStatus.Updated;
      this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        this.getFileNames(),
        this.compilerOptions,
        this.compilerHost,
        this.program,
        this.configFileParsingDiagnostics,
        this.commandLine.projectReferences
      );

      this.program.emit()
    }

    this.updateOutputTimestamps();
  }
}
