import path from 'path';
import ts from 'typescript';
import isSubdir from 'is-subdir';

import {
  FilePath
} from '../dependencies';

declare module 'typescript' {
  export interface IsIgnoredFileFromWildCardWatchingInput {
    watchedDirPath: FilePath;
    fileOrDirectory: string;
    fileOrDirectoryPath: FilePath;
    configFileName: string;
    options: ts.CompilerOptions;
    program: ts.BuilderProgram | ts.Program | undefined;
    extraFileExtensions?: readonly ts.FileExtensionInfo[];
    currentDirectory: string;
    useCaseSensitiveFileNames: boolean;
    writeLog: (s: string) => void;
  }
  export function isIgnoredFileFromWildCardWatching(input: IsIgnoredFileFromWildCardWatchingInput): boolean
}

export const isIncludedFile = (filePath: FilePath, commandLine: ts.ParsedCommandLine, host: ts.CompilerHost) => {
  const configFilePath = <string>commandLine.options.configFilePath;
  const basePath = path.dirname(configFilePath);
  const wildcardDirectories = Object.keys(<object>commandLine.wildcardDirectories);
  const dirname = path.dirname(filePath);
  const files = commandLine.raw && commandLine.raw.files
    ? commandLine.raw.files
    : [];

  for (const file of files) {
    if (path.isAbsolute(file) && file === filePath) {
      return true;
    }
    else if (!path.isAbsolute(file) && path.join(basePath, file) === filePath) {
      return true;
    }
  }

  if (!wildcardDirectories.some(directory => isSubdir(directory, dirname))) {
    return false;
  }

  return !ts.isIgnoredFileFromWildCardWatching({
    watchedDirPath: basePath,
    fileOrDirectory: filePath,
    fileOrDirectoryPath: path.dirname(filePath),
    configFileName: configFilePath,
    currentDirectory: host.getCurrentDirectory(),
    useCaseSensitiveFileNames: host.useCaseSensitiveFileNames(),
    writeLog: () => { },
    options: commandLine.options,
    program: undefined
  });
};
