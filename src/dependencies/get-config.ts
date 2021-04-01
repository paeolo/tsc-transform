import path from 'path';
import ts from 'typescript';

import {
  DirectoryPath,
  FilePath,
  DependencyNode
} from './types';

export const findTSConfigOrFail = (fileOrDirectoryPath: FilePath | DirectoryPath): FilePath => {
  const configPath = ts.findConfigFile(fileOrDirectoryPath, ts.sys.fileExists);

  if (!configPath) {
    throw new Error(`Could not find a valid "tsconfig.json" at ${fileOrDirectoryPath}.`);
  }

  return path.resolve(configPath);
}

export const getTSConfigOrFail = (fileOrDirectoryPath: FilePath | DirectoryPath): DependencyNode => {
  const configPath = findTSConfigOrFail(fileOrDirectoryPath);

  const sourceFile = ts.readJsonConfigFile(configPath, ts.sys.readFile);

  const commandLine = ts.parseJsonSourceFileConfigFileContent(
    sourceFile,
    ts.sys,
    path.dirname(configPath)
  );

  commandLine.options.configFilePath = configPath;

  const projectReferences = commandLine.projectReferences
    ? commandLine.projectReferences.map(value => findTSConfigOrFail(value.path))
    : [];


  return {
    configPath,
    commandLine,
    projectReferences
  };
}
