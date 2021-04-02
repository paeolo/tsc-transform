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
  BuildStatus,
  FSEvent
} from './types';

const commonDir = require('common-dir')

export class Runner {
  private topologicalSorting: DependencyNode[];
  private projects: Map<FilePath, TSProject>;
  private invalidate: (fileName: string) => void;

  constructor(dependencyMap: DependencyMap) {
    this.topologicalSorting = getTopologicalSorting(dependencyMap);
    this.projects = new Map();

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

    console.log('First build!');
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
      const project = this.projects.get(dependency.configPath)!;
      project.build(event);
    }

    if (this.hasChanged()) {
      console.log('Built:)');
    }
  }
}
