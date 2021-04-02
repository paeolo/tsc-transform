import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';

const minimumDate = new Date(-8640000000000000);
const maximumDate = new Date(8640000000000000);
const missingFileModifiedTime = new Date(0);

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
  export function getAllProjectOutputs(configFile: ts.ParsedCommandLine, ignoreCase: boolean): readonly string[];
  export function fileExtensionIs(path: string, extension: string): boolean;
  export function getBuildInfo(buildInfoText: string): any;
}

const noop = () => { };
const getModifiedTime = ts.sys.getModifiedTime || ((path: string) => undefined);
const setModifiedTime = ts.sys.setModifiedTime ? ((path: string, date: Date) => ts.sys.setModifiedTime!(path, date)) : noop;
const isDeclarationFile = (fileName: string) => ts.fileExtensionIs(fileName, Extension.Dts);
const newer = (date1: Date, date2: Date) => date2 > date1 ? date2 : date1;

export interface TSProjectOptions {
  configPath: FilePath;
  commandLine: ts.ParsedCommandLine;
  host: ts.CompilerHost;
  moduleResolutionCache: ts.ModuleResolutionCache;
}

export class TSProject {
  private configPath: FilePath;
  private commandLine: ts.ParsedCommandLine;
  private compilerHost: ts.CompilerHost;
  private configFileParsingDiagnostics: readonly ts.Diagnostic[];
  private program: ts.EmitAndSemanticDiagnosticsBuilderProgram | undefined;

  constructor(options: TSProjectOptions) {
    this.configPath = options.configPath;
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

    this.configFileParsingDiagnostics = ts.getConfigFileParsingDiagnostics(this.commandLine);
    this.program = ts.readBuilderProgram(this.compilerOptions, this.compilerHost);

    if (!this.isProgramUptoDate(this.getFileNames())) {
      this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
        this.getFileNames(),
        this.compilerOptions,
        this.compilerHost,
        this.program,
        this.configFileParsingDiagnostics,
        this.getProjectReferences(),
      );

      this.program.emit()
    }

    this.updateOutputTimestamps();
  }

  private get compilerOptions() {
    return this.commandLine.options;
  }

  private get buildInfoPath() {
    return this.compilerOptions.tsBuildInfoFile!
  }

  private getProjectReferences() {
    return this.commandLine.projectReferences;
  }

  private getFileNames() {
    return this.commandLine.fileNames;
  }

  private isProgramUptoDate(fileNames: FilePath[]) {
    let newestInputFileTime = minimumDate;

    if (fileNames.length === 0) {
      return true;
    }

    for (const inputFile of fileNames) {
      if (!this.compilerHost.fileExists(inputFile)) {
        throw new Error(`${inputFile} does not exist`);
      }
      const inputTime = getModifiedTime(inputFile) || missingFileModifiedTime;

      if (inputTime > newestInputFileTime) {
        newestInputFileTime = inputTime;
      }
    }

    const outputs = ts.getAllProjectOutputs(this.commandLine, !this.compilerHost.useCaseSensitiveFileNames());

    let oldestOutputFileTime = maximumDate;
    let newestOutputFileTime = minimumDate;
    let missingOutputFileName: string | undefined;
    let newestDeclarationFileContentChangedTime = minimumDate;
    let isOutOfDateWithInputs = false;

    for (const output of outputs) {
      if (!this.compilerHost.fileExists(output)) {
        missingOutputFileName = output;
        return false;
      }

      const outputTime = getModifiedTime(output) || missingFileModifiedTime;
      if (outputTime < oldestOutputFileTime) {
        oldestOutputFileTime = outputTime;
      }

      if (outputTime < newestInputFileTime) {
        isOutOfDateWithInputs = true;
        return false;
      }

      if (outputTime > newestOutputFileTime) {
        newestOutputFileTime = outputTime;
      }

      if (isDeclarationFile(output)) {
        const outputModifiedTime = getModifiedTime(output) || missingFileModifiedTime;
        newestDeclarationFileContentChangedTime = newer(newestDeclarationFileContentChangedTime, outputModifiedTime);
      }
    }

    const configFiles = (this.compilerOptions.configFile as ts.TsConfigSourceFile).extendedSourceFiles || [];
    configFiles.push(this.configPath);

    const configModifiedTime = configFiles.reduce(
      (acc, elem) => newer(acc, (getModifiedTime(elem) || missingFileModifiedTime)),
      minimumDate
    );

    if (missingOutputFileName !== undefined
      || isOutOfDateWithInputs
      || oldestOutputFileTime < configModifiedTime) {
      return false;
    }

    const buildInfoContent = this.compilerHost.readFile(this.buildInfoPath);

    if (!buildInfoContent) {
      return false;
    }

    const buildInfo = ts.getBuildInfo(buildInfoContent);

    if (buildInfo.version !== ts.version) {
      return false;
    }

    return true;
  }

  private updateOutputTimestamps() {
    const now = new Date();
    const outputs = ts.getAllProjectOutputs(this.commandLine, !this.compilerHost.useCaseSensitiveFileNames());

    for (const output of outputs) {
      setModifiedTime(output, now);
    }
  }
}
