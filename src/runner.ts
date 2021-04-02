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

export class Runner {
  private dependencyMap: DependencyMap;
  private topologicalSorting: DependencyNode[];
  private projects: Map<FilePath, TSProject>;

  constructor(dependencyMap: DependencyMap) {
    this.dependencyMap = dependencyMap;
    this.topologicalSorting = getTopologicalSorting(dependencyMap);
    this.projects = new Map();

    const {
      host,
      invalidate,
      moduleResolutionCache
    } = createCompilerHost();

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
}
