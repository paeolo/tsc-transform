import assert from 'assert';
import ts from 'typescript';
import path from 'path';

import {
  createCompilerHost,
  TSProject
} from './builder';
import {
  DependencyMap,
  getTopologicalSorting,
  FilePath,
  DependencyNode
} from './dependencies';
import {
  ConsoleLogger
} from './reporter';
import {
  BuildStatus,
  CustomTransformers,
  FSEvent
} from './types';
import {
  createModuleResolverGetter
} from './utils';

const commonDir = require('common-dir');

export class Runner {
  private topologicalSorting: DependencyNode[];
  private projects: Map<FilePath, TSProject>;
  private invalidateSourceFile: (fileName: string) => void;
  private logger: ConsoleLogger;
  private compilerHost: ts.CompilerHost;

  constructor(dependencyMap: DependencyMap, customTransformer?: CustomTransformers) {
    this.topologicalSorting = getTopologicalSorting(dependencyMap);
    this.projects = new Map();
    this.logger = new ConsoleLogger();

    const {
      host,
      invalidateSourceFile,
      projectResolutionCache,
      moduleResolutionCache
    } = createCompilerHost();

    this.compilerHost = host;
    this.invalidateSourceFile = invalidateSourceFile;

    const buildStatusGetter = (configPath: FilePath) => {
      assert(this.projects.has(configPath));
      return this.projects.get(configPath)!.getBuildStatus();
    }

    const moduleResolutionGetter = createModuleResolverGetter(
      this.topologicalSorting
        .filter((dependency) => dependency.pkgName)
        .map((dependency) => dependency.pkgName!)
    );

    const dateTime = new Date().getTime();

    for (const dependency of this.topologicalSorting) {
      const project = new TSProject({
        pkgName: dependency.pkgName,
        configPath: dependency.configPath,
        commandLine: dependency.commandLine,
        host,
        moduleResolutionCache,
        projectResolutionCache,
        moduleResolutionGetter,
        invalidateSourceFile: this.invalidateSourceFile,
        buildStatusGetter,
        projectReferences: dependency.projectReferences,
        logger: this.logger,
        customTransformer,
      });

      this.projects.set(dependency.configPath, project);
    }

    if (!this.someDependencyHasStatus(BuildStatus.Unbuildable)) {
      this.logger.success(`Built in ${new Date().getTime() - dateTime}ms`);
    }
  }

  private someDependencyHasStatus(status: BuildStatus) {
    for (const [, project] of this.projects) {
      if (project.getBuildStatus() === status) {
        return true;
      }
    }
    return false;
  }

  public getCommonDir() {
    const wildcardDirectories = [];

    for (const dependency of this.topologicalSorting) {
      wildcardDirectories.push(
        ...Object.keys(<object>dependency.commandLine.wildcardDirectories)
      );
    }

    return commonDir(wildcardDirectories);
  }

  public build(event: FSEvent) {
    for (const fileName of event.updated.concat(event.deleted)) {
      this.invalidateSourceFile(fileName);
    }

    for (const dependency of this.topologicalSorting) {
      this.projects.get(dependency.configPath)!.updateBuildStatus(event);
    }

    if (!this.someDependencyHasStatus(BuildStatus.OutOfDate)) {
      return;
    }

    const dateTime = new Date().getTime();

    this.logger.info('File change detected!');

    const outputFiles: ts.OutputFile[] = [];

    for (const dependency of this.topologicalSorting) {
      const projectOutput = this.projects.get(dependency.configPath)!.build();
      if (projectOutput) {
        outputFiles.push(...projectOutput);
      }
    }

    for (const outputFile of outputFiles) {
      this.compilerHost.writeFile(outputFile.name, outputFile.text, outputFile.writeByteOrderMark);
    }

    if (!this.someDependencyHasStatus(BuildStatus.Unbuildable)) {
      this.logger.success(`Built in ${new Date().getTime() - dateTime}ms`);
    }
  }
}

export class RunnerClean {
  constructor(dependencyMap: DependencyMap) {

    assert(ts.sys.deleteFile);
    const { host } = createCompilerHost();

    for (const [, dependency] of dependencyMap) {
      dependency.commandLine.options.tsBuildInfoFile = path.join(
        path.dirname(dependency.configPath),
        '.tsbuildinfo'
      );
      const outputs = ts.getAllProjectOutputs(dependency.commandLine, !host.useCaseSensitiveFileNames());

      for (const output of outputs) {
        if (host.fileExists(output)) {
          ts.sys.deleteFile(output);
        }
      }
    }
  }
}
