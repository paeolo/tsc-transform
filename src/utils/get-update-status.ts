import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  removeDeletedOutputs
} from './get-output';

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
  export function getAllProjectOutputs(configFile: ts.ParsedCommandLine, ignoreCase: boolean): readonly string[];
  export function fileExtensionIs(path: string, extension: string): boolean;
  export function getBuildInfo(buildInfoText: string): any;
}

const getModifiedTime = ts.sys.getModifiedTime || ((path: string) => undefined);
const isDeclarationFile = (fileName: string) => ts.fileExtensionIs(fileName, Extension.Dts);
const newer = (date1: Date, date2: Date) => date2 > date1 ? date2 : date1;

export const isProgramUptoDate = (commandLine: ts.ParsedCommandLine, compilerHost: ts.CompilerHost) => {
  const buildInfoContent = compilerHost.readFile(commandLine.options.tsBuildInfoFile!);

  if (!buildInfoContent && commandLine.fileNames.length === 0) {
    return true;
  }
  else if (!buildInfoContent) {
    return false;
  }

  const buildInfo = ts.getBuildInfo(buildInfoContent);

  if (buildInfo.program.semanticDiagnosticsPerFile
    && buildInfo.program.semanticDiagnosticsPerFile.some(
      (element: any) => Array.isArray(element)
    )) {
    return false;
  }

  if (removeDeletedOutputs(buildInfo, commandLine, compilerHost)) {
    return false;
  }

  if (buildInfo.version !== ts.version) {
    return false;
  }

  let newestInputFileTime = minimumDate;

  for (const inputFile of commandLine.fileNames) {
    if (!compilerHost.fileExists(inputFile)) {
      throw new Error(`${inputFile} does not exist`);
    }
    const inputTime = getModifiedTime(inputFile) || missingFileModifiedTime;

    if (inputTime > newestInputFileTime) {
      newestInputFileTime = inputTime;
    }
  }

  const outputs = ts.getAllProjectOutputs(commandLine, !compilerHost.useCaseSensitiveFileNames());

  let oldestOutputFileTime = maximumDate;
  let newestOutputFileTime = minimumDate;
  let missingOutputFileName: string | undefined;
  let newestDeclarationFileContentChangedTime = minimumDate;
  let isOutOfDateWithInputs = false;

  for (const output of outputs) {
    if (!compilerHost.fileExists(output)) {
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

  const configFiles = (<ts.TsConfigSourceFile>commandLine.options.configFile).extendedSourceFiles || [];
  configFiles.push(<FilePath>commandLine.options.configFilePath);

  const configModifiedTime = configFiles.reduce(
    (acc, elem) => newer(acc, (getModifiedTime(elem) || missingFileModifiedTime)),
    minimumDate
  );

  if (missingOutputFileName !== undefined
    || isOutOfDateWithInputs
    || oldestOutputFileTime < configModifiedTime) {
    return false;
  }

  return true;
}
