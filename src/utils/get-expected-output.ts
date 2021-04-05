import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  difference
} from './difference';

const noop = () => { };
const deleteFile = ts.sys.deleteFile ? ts.sys.deleteFile : noop;

export const getExpectedOutputs = (fileNames: FilePath[], commandLine: ts.ParsedCommandLine, host: ts.CompilerHost) => {
  const outputs = ts.getAllProjectOutputs(
    {
      ...commandLine,
      fileNames
    },
    !host.useCaseSensitiveFileNames()
  );

  return outputs.filter(value => value !== commandLine.options.tsBuildInfoFile);
}

export const removeExpectedOutputs = (
  fileNames: FilePath[],
  commandLine: ts.ParsedCommandLine,
  host: ts.CompilerHost,
  invalidateSourceFile: (fileName: string) => void,
) => {
  if (fileNames.length === 0) {
    return;
  }

  const outputs = getExpectedOutputs(fileNames, commandLine, host);

  for (const output of outputs) {
    invalidateSourceFile(output);
    deleteFile(output);
  }
}

export const removeDeletedOutputs = (buildInfo: any, commandLine: ts.ParsedCommandLine, host: ts.CompilerHost) => {
  const fileNames = difference(buildInfo.program.rootNames, commandLine.fileNames);

  if (fileNames.length === 0) {
    return false;
  }

  const outputs = getExpectedOutputs(fileNames, commandLine, host);

  for (const output of outputs) {
    deleteFile(output);
  }

  return true;
}
