import {
  DirectoryPath,
  DependencyNode,
  DependencyMap,
  FilePath
} from './types';
import {
  getTSConfigOrFail,
} from './get-config';

export const getDependencies = (fileOrDirectoryPath: FilePath | DirectoryPath): DependencyMap => {
  const dependencyMap = new Map<FilePath, DependencyNode>();

  const visitProject = (fileOrDirectoryPath: FilePath | DirectoryPath) => {
    const project = getTSConfigOrFail(fileOrDirectoryPath);

    dependencyMap.set(project.configPath, project);

    project.projectReferences.forEach((projectReference) => {
      if (!dependencyMap.has(projectReference)) {
        visitProject(projectReference);
      }
    });
  };

  visitProject(fileOrDirectoryPath);

  return dependencyMap;
}
