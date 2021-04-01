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

    for (const dependency of this.topologicalSorting) {
      const project = new TSProject({
        commandLine: dependency.commandLine,
        configPath: dependency.configPath,
        host,
        moduleResolutionCache
      });

      this.projects.set(dependency.configPath, project);
    }
  }
}
