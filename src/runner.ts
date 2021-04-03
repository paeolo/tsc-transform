import assert from 'assert';

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
        projectReferences: dependency.projectReferences
      });

      this.projects.set(dependency.configPath, project);
    }

    this.logger.success(`Built in ${new Date().getTime() - dateTime}ms`);
  }

  private hasChanged() {
    for (const [, project] of this.projects) {
      if (project.getBuildStatus() !== BuildStatus.Unchanged) {
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

    for (const dependency of this.topologicalSorting) {
      this.projects.get(dependency.configPath)!.updateBuildStatus(event);
    }

    if (!this.hasChanged()) {
      return;
    }

    const dateTime = new Date().getTime();
    this.logger.info('File change detected!');

    for (const dependency of this.topologicalSorting) {
      this.projects.get(dependency.configPath)!.build();
    }

    this.logger.success(`Built in ${new Date().getTime() - dateTime}ms`);
  }
}
