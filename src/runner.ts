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
  FSEvent
} from './types';

const commonDir = require('common-dir')

export class Runner {
  private topologicalSorting: DependencyNode[];
  private projects: Map<FilePath, TSProject>;
  private invalidate: (fileName: string) => void;
  private logger: ConsoleLogger;

  constructor(dependencyMap: DependencyMap) {
    this.topologicalSorting = getTopologicalSorting(dependencyMap);
    this.projects = new Map();
    this.logger = new ConsoleLogger();

    const {
      host,
      invalidate,
      moduleResolutionCache
    } = createCompilerHost();

    this.invalidate = invalidate;

    const buildStatusGetter = (configPath: FilePath) => {
      assert(this.projects.has(configPath));
      return this.projects.get(configPath)!.getBuildStatus();
    }

    const dateTime = new Date().getTime();

    for (const dependency of this.topologicalSorting) {
      const project = new TSProject({
        commandLine: dependency.commandLine,
        configPath: dependency.configPath,
        host,
        moduleResolutionCache,
        buildStatusGetter,
        projectReferences: dependency.projectReferences,
        logger: this.logger
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
      this.invalidate(fileName);
    }

    for (const dependency of this.topologicalSorting) {
      this.projects.get(dependency.configPath)!.updateBuildStatus(event);
    }

    if (!this.someDependencyHasStatus(BuildStatus.OutOfDate)) {
      return;
    }

    const dateTime = new Date().getTime();

    this.logger.info('File change detected!');

    for (const dependency of this.topologicalSorting) {
      this.projects.get(dependency.configPath)!.build();
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
