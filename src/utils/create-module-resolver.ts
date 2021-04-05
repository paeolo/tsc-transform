import path from 'path';
import ts from 'typescript';

import {
  FilePath
} from '../dependencies';
import {
  getExpectedOutputs
} from './get-expected-output';

export interface ProjectResolutionCache extends ts.ModuleResolutionCache {
  invalidate(entry: string): void;
}

export type ModuleResolverGetter = (
  compilerOptions: ts.CompilerOptions,
  compilerHost: ts.CompilerHost,
  moduleResolutionCache: ts.ModuleResolutionCache,
  projectResolutionCache: ts.ModuleResolutionCache
) => (
    moduleName: string,
    containingFile: string,
    redirectedReference: ts.ResolvedProjectReference | undefined
  ) => ts.ResolvedModuleFull | undefined;

export const createProjectResolutionCache = (): ProjectResolutionCache => {
  const cache = new Map<string, ts.ResolvedModuleWithFailedLookupLocations>();
  const cachePerModuleName = new Map<string, Map<string, ts.ResolvedModuleWithFailedLookupLocations>>();

  return {
    getOrCreateCacheForDirectory: () => cache,
    getOrCreateCacheForModuleName: (directoryName: string) => {
      let perModuleName = cachePerModuleName.get(directoryName);

      if (!perModuleName) {
        perModuleName = new Map();
        cachePerModuleName.set(directoryName, perModuleName);
      }

      return perModuleName;
    },
    invalidate: (entry: string) => {
      const resolution = cache.get(entry);

      if (resolution && !resolution.resolvedModule) {
        cache.delete(entry);
        cachePerModuleName.delete(entry);
      }
    }
  };
}

export const createModuleResolverGetter = (projectNames: string[]) => (
  compilerOptions: ts.CompilerOptions,
  compilerHost: ts.CompilerHost,
  moduleResolutionCache: ts.ModuleResolutionCache,
  projectResolutionCache: ts.ModuleResolutionCache
) => (
  moduleName: string,
  containingFile: string,
  redirectedReference: ts.ResolvedProjectReference | undefined
) => {
    if (projectNames.some(projectName => moduleName.startsWith(projectName))) {
      return ts
        .resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          compilerHost,
          projectResolutionCache,
          redirectedReference
        )
        .resolvedModule!;
    } else {
      return ts
        .resolveModuleName(
          moduleName,
          containingFile,
          compilerOptions,
          compilerHost,
          moduleResolutionCache,
          redirectedReference
        )
        .resolvedModule!;
    }
  }

export const invalidateModuleResolution = (
  fileNames: FilePath[],
  pkgName: string | undefined,
  projectResolutionCache: ProjectResolutionCache,
  commandLine: ts.ParsedCommandLine,
  host: ts.CompilerHost
) => {
  if (!pkgName || fileNames.length === 0) {
    return;
  }

  projectResolutionCache.invalidate(pkgName);

  const basePath = path.dirname(<string>commandLine.options.configFilePath);
  const dtsOutputs = getExpectedOutputs(fileNames, commandLine, host)
    .filter(output => output.endsWith('d.ts'))
    .map(output => path.relative(basePath, output))
    .map(output => pkgName.concat('/').concat((output.slice(0, -5))));

  for (const output of dtsOutputs) {
    projectResolutionCache.invalidate(output);

    if (output.endsWith('/index')) {
      projectResolutionCache.invalidate(output.slice(0, -6));
    }
  }
}
