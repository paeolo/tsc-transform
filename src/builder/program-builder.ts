import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  ConsoleLogger,
  formatDiagnostic
} from '../reporter';
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
  pkgName?: string;
  configPath: FilePath;
  commandLine: ts.ParsedCommandLine;
  host: ts.CompilerHost;
  moduleResolutionCache: ts.ModuleResolutionCache;
  projectResolutionCache: utils.ProjectResolutionCache;
  moduleResolverGetter: utils.ModuleResolverGetter;
  invalidateSourceFile: (fileName: string) => void;
  buildStatusGetter: BuildStatusGetter;
  projectReferences: FilePath[];
  logger: ConsoleLogger;
  customTransformer?: ts.CustomTransformers;
}

export class TSProject {
  private pkgName?: string;
  private commandLine: ts.ParsedCommandLine;
  private compilerHost: ts.CompilerHost;
  private configFileParsingDiagnostics: readonly ts.Diagnostic[];
  private program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
  private buildStatus: BuildStatus;
  private buildStatusGetter: BuildStatusGetter;
  private projectReferences: FilePath[];
  private rootNames: Set<FilePath>;
  private logger: ConsoleLogger;
  private customTransformer?: ts.CustomTransformers;
  private invalidateSourceFile: (fileName: string) => void;
  private projectResolutionCache: utils.ProjectResolutionCache;

  constructor(options: TSProjectOptions) {
    this.pkgName = options.pkgName;
    this.commandLine = options.commandLine;
    this.commandLine.options.tsBuildInfoFile = path.join(path.dirname(options.configPath), '.tsbuildinfo');
    this.customTransformer = options.customTransformer;
    this.invalidateSourceFile = options.invalidateSourceFile;
    this.projectResolutionCache = options.projectResolutionCache;

    const loader = options.moduleResolverGetter(
      this.compilerOptions,
      options.host,
      options.moduleResolutionCache,
      options.projectResolutionCache
    );

    this.compilerHost = {
      ...options.host,
      resolveModuleNames: (moduleNames, containingFile, _reusedNames, redirectedReference) =>
        ts.loadWithLocalCache(ts.Debug.checkEachDefined(moduleNames), containingFile, redirectedReference, loader)
    };

    this.buildStatus = BuildStatus.Unchanged;
    this.buildStatusGetter = options.buildStatusGetter;
    this.projectReferences = options.projectReferences;
    this.rootNames = new Set(this.commandLine.fileNames);
    this.logger = options.logger;

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

  private someDependencyUpdated() {
    return this.projectReferences.some(
      configPath => this.buildStatusGetter(configPath) === BuildStatus.Updated
    );
  }

  private updateOutputTimestamps() {
    const now = new Date();
    const outputs = ts.getAllProjectOutputs(this.commandLine, !this.compilerHost.useCaseSensitiveFileNames());

    for (const output of outputs) {
      setModifiedTime(output, now);
    }
  }

  private createProgram() {
    const program = utils.createProgram(
      this.commandLine.fileNames,
      this.compilerOptions,
      this.compilerHost,
      this.program,
      this.configFileParsingDiagnostics,
      this.commandLine.projectReferences
    );

    return program;
  }

  private initialBuild() {
    if (!this.isProgramUptoDate() || this.someDependencyUpdated()) {
      this.program = this.createProgram();
      const diagnostic = utils.getFirstError(this.program);

      if (diagnostic) {
        this.logger.error(formatDiagnostic(diagnostic));
        this.buildStatus = BuildStatus.Unbuildable;
        (<any>this.program).emitBuildInfo();
        return;
      }

      ((<any>this.program).getState().buildInfoEmitPending = true);

      this.program.emit(
        undefined,
        undefined,
        undefined,
        undefined,
        this.customTransformer
      );
      this.buildStatus = BuildStatus.Updated;
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
    utils.removeExpectedOutputs(
      deleted,
      this.commandLine,
      this.compilerHost,
      this.invalidateSourceFile
    );
    utils.invalidateModuleResolution(
      updated,
      this.pkgName,
      this.projectResolutionCache,
      this.commandLine,
      this.compilerHost
    )

    return {
      count: deleted.length + updated.length,
      deleted,
      updated,
    };
  }

  public updateBuildStatus(event: FSEvent) {
    const projectEvent = this.updateRootNames(event);

    if (projectEvent.count > 0) {
      this.buildStatus = BuildStatus.OutOfDate;
    }
    else if (this.buildStatus !== BuildStatus.Unbuildable) {
      this.buildStatus = BuildStatus.Unchanged;
    }
  }

  public build() {
    if (this.buildStatus === BuildStatus.OutOfDate
      || this.buildStatus === BuildStatus.Unbuildable
      || this.someDependencyUpdated()
    ) {
      this.program = this.createProgram();
      const diagnostic = utils.getFirstError(this.program);

      if (diagnostic) {
        this.logger.error(formatDiagnostic(diagnostic));
        this.buildStatus = BuildStatus.Unbuildable;
        (<any>this.program).emitBuildInfo();
        return;
      }

      ((<any>this.program).getState().buildInfoEmitPending = true);

      this.program.emit(
        undefined,
        undefined,
        undefined,
        undefined,
        this.customTransformer
      );
      this.buildStatus = BuildStatus.Updated;
      this.updateOutputTimestamps();
    }
  }
}
