import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  removeDeletedOutputs
} from './get-expected-output';

const minimumDate = new Date(-8640000000000000);
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

  if (buildInfo.version !== ts.version || !buildInfo.program.timestamp) {
    return false;
  }

  let newestInputFileTime = minimumDate;
  const timestamp = new Date(buildInfo.program.timestamp);

  for (const inputFile of commandLine.fileNames) {
    if (!compilerHost.fileExists(inputFile)) {
      throw new Error(`${inputFile} does not exist`);
    }
    const inputTime = getModifiedTime(inputFile) || missingFileModifiedTime;

    if (inputTime > newestInputFileTime) {
      newestInputFileTime = inputTime;
    }
  }

  if (newestInputFileTime > timestamp) {
    return false;
  }

  const outputs = ts.getAllProjectOutputs(commandLine, !compilerHost.useCaseSensitiveFileNames());

  for (const output of outputs) {
    if (!compilerHost.fileExists(output)) {
      return false;
    }
  }

  const configFiles = (<ts.TsConfigSourceFile>commandLine.options.configFile).extendedSourceFiles || [];
  configFiles.push(<FilePath>commandLine.options.configFilePath);

  const configModifiedTime = configFiles.reduce(
    (acc, elem) => newer(acc, (getModifiedTime(elem) || missingFileModifiedTime)),
    minimumDate
  );

  if (configModifiedTime > timestamp) {
    return false;
  }

  return true;
}
