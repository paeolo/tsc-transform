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
import {
  createProgram,
  isProgramUptoDate,
  isIncludedFile,
  removeExpectedOutputs,
  invalidateModuleResolution,
  ProjectResolutionCache,
  ModuleResolutionGetter,
  getFirstError
} from '../utils';

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
  commandLine: ts.ParsedCommandLine;
  configPath: FilePath;
  host: ts.CompilerHost;
  invalidateSourceFile: (fileName: string) => void;
  projectResolutionCache: ProjectResolutionCache;
  moduleResolutionCache: ts.ModuleResolutionCache;
  moduleResolutionGetter: ModuleResolutionGetter;
  buildStatusGetter: BuildStatusGetter;
  projectReferences: FilePath[];
  logger: ConsoleLogger;
  customTransformer?: ts.CustomTransformers;
}

export class TSProject {
  private pkgName?: string;
  private commandLine: ts.ParsedCommandLine;
  private rootNames: Set<FilePath>;
  private compilerHost: ts.CompilerHost;
  private configFileParsingDiagnostics: readonly ts.Diagnostic[];
  private program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;
  private buildStatus: BuildStatus;
  private buildStatusGetter: BuildStatusGetter;
  private invalidateSourceFile: (fileName: string) => void;
  private projectResolutionCache: ProjectResolutionCache;
  private projectReferences: FilePath[];

  private logger: ConsoleLogger;
  private customTransformer?: ts.CustomTransformers;


  constructor(options: TSProjectOptions) {
    this.pkgName = options.pkgName;
    this.commandLine = options.commandLine;
    this.commandLine.options.tsBuildInfoFile = path.join(path.dirname(options.configPath), '.tsbuildinfo');
    this.customTransformer = options.customTransformer;
    this.invalidateSourceFile = options.invalidateSourceFile;
    this.projectResolutionCache = options.projectResolutionCache;

    const loader = options.moduleResolutionGetter(
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

  private isProjectUptoDate() {
    return isProgramUptoDate(this.commandLine, this.compilerHost);
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

  private createCompilerProgram() {
    const program = createProgram(
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
    if (!this.isProjectUptoDate() || this.someDependencyUpdated()) {
      this.program = this.createCompilerProgram();
      const diagnostic = getFirstError(this.program);

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
      if (isIncludedFile(fileName, this.commandLine, this.compilerHost)) {
        updated.push(fileName);
        this.rootNames.add(fileName);
      }
    }

    this.commandLine.fileNames = Array.from(this.rootNames);
    removeExpectedOutputs(
      deleted,
      this.commandLine,
      this.compilerHost,
      this.invalidateSourceFile
    );
    invalidateModuleResolution(
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
      this.program = this.createCompilerProgram();
      const diagnostic = getFirstError(this.program);

      if (diagnostic) {
        this.logger.error(formatDiagnostic(diagnostic));
        this.buildStatus = BuildStatus.Unbuildable;
        (<any>this.program).emitBuildInfo();
        return;
      }

      const outputFiles: ts.OutputFile[] = [];
      ((<any>this.program).getState().buildInfoEmitPending = true);

      this.program.emit(
        undefined,
        (name, text, writeByteOrderMark) => outputFiles.push({ name, text, writeByteOrderMark }),
        undefined,
        undefined,
        this.customTransformer
      );

      this.buildStatus = BuildStatus.Updated;
      return outputFiles;
    }
  }
}
