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
  FSEvent
} from './types';

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
  }

  public build(event: FSEvent) {
    for (const fileName of event.updated.concat(event.deleted)) {
      this.invalidate(fileName);
    }

    for (const dependency of this.topologicalSorting) {
      const project = this.projects.get(dependency.configPath)!;
      project.build(event);
    }
  }
}
