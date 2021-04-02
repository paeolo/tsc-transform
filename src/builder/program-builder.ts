import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  FSEvent,
  BuildStatus,
  BuildStatusGetter,
} from '../types';
import * as utils from '../utils';

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
  private rootNames: Set<FilePath>;

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
    this.rootNames = new Set(this.commandLine.fileNames);

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

  private isProgramUptoDate() {
    return utils.isProgramUptoDate(this.commandLine, this.compilerHost);
  }

  private isEveryDependencyUnchanged() {
    return this.projectReferences.every(
      configPath => this.buildStatusGetter(configPath) === BuildStatus.Unchanged
    );
  }

  private updateOutputTimestamps() {
    const now = new Date();
    const outputs = ts.getAllProjectOutputs(this.commandLine, !this.compilerHost.useCaseSensitiveFileNames());

    for (const output of outputs) {
      setModifiedTime(output, now);
    }
  }

  private initialBuild() {
    if (this.rootNames.size === 0) {
      return;
    }

    if (!(this.isProgramUptoDate() && this.isEveryDependencyUnchanged())) {
      this.buildStatus = BuildStatus.Updated;
      this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        this.commandLine.fileNames,
        this.compilerOptions,
        this.compilerHost,
        this.program,
        this.configFileParsingDiagnostics,
        this.commandLine.projectReferences
      );

      this.program.emit();
    }

    this.updateOutputTimestamps();
  }

  private updateRootNames(event: FSEvent): FSEvent {
    const deleted: FilePath[] = [];
    const updated: FilePath[] = [];

    for (const fileName of this.rootNames) {
      if (event.deleted.includes(fileName)) {
        deleted.push(fileName);
        this.rootNames.delete(fileName);
      }
    }

    for (const fileName of event.updated) {
      if (utils.isIncludedFile(fileName, this.commandLine, this.compilerHost)) {
        updated.push(fileName);
        this.rootNames.add(fileName);
      }
    }

    this.commandLine.fileNames = Array.from(this.rootNames);

    return {
      deleted,
      updated
    };
  }

  private updateBuildStatus(event: FSEvent) {
    const projectEvent = this.updateRootNames(event);

    if (projectEvent.deleted.length > 0
      || projectEvent.updated.length > 1
      || !this.isEveryDependencyUnchanged()) {
      this.buildStatus = BuildStatus.Updated;
    }
    else if (projectEvent.updated.length === 1) {
      this.buildStatus = BuildStatus.UpdatedOneFile
    }
    else {
      this.buildStatus = BuildStatus.Unchanged;
    }
  }

  public build(event: FSEvent) {
    this.updateBuildStatus(event);

    if (this.rootNames.size === 0) {
      return;
    }

    if (this.buildStatus !== BuildStatus.Unchanged) {
      this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        this.commandLine.fileNames,
        this.compilerOptions,
        this.compilerHost,
        this.program,
        this.configFileParsingDiagnostics,
        this.commandLine.projectReferences
      );

      this.program.emit();
      this.updateOutputTimestamps();
    }
  }
}
