import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  createProjectResolutionCache, ProjectResolutionCache
} from '../utils';

declare module 'typescript' {
  export function setGetSourceFileAsHashVersioned(compilerHost: ts.CompilerHost, host: { createHash?(data: string): string; }): void
}

type ErrorHandler = (message: string) => void;

type CompilerHostWithCache = {
  host: ts.CompilerHost;
  moduleResolutionCache: ts.ModuleResolutionCache;
  projectResolutionCache: ProjectResolutionCache;
  invalidateSourceFile: (fileName: FilePath) => void;
}

export const createCompilerHost = (): CompilerHostWithCache => {
  const host = ts.createCompilerHost({ watch: false, newLine: undefined });
  const buckets = new Map<string, Map<FilePath, ts.SourceFile>>();

  const moduleResolutionCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    fileName => host.getCanonicalFileName(fileName)
  );

  ts.setGetSourceFileAsHashVersioned(host, ts.sys);

  const getBucket = (languageVersion: ts.ScriptTarget) => {
    if (!buckets.has(languageVersion.toString())) {
      const map = new Map();
      buckets.set(languageVersion.toString(), new Map())
      return map;
    }

    return buckets.get(languageVersion.toString())!
  }

  const invalidateSourceFile = (fileName: FilePath) => {
    for (const [, bucket] of buckets) {
      bucket.delete(fileName);
    }
  }

  const originalGetSourceFile = host.getSourceFile;

  host.getSourceFile = (fileName: string, languageVersion: ts.ScriptTarget, onError?: ErrorHandler, shouldCreate?: boolean) => {
    const map = getBucket(languageVersion);

    if (!map.has(fileName)) {
      const sourceFile = originalGetSourceFile(fileName, languageVersion, onError, shouldCreate);
      map.set(fileName, sourceFile);
      return sourceFile;
    }

    return map.get(fileName);
  }

  return {
    host,
    moduleResolutionCache,
    projectResolutionCache: createProjectResolutionCache(),
    invalidateSourceFile
  };
}
