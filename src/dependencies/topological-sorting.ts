import {
  DependencyMap,
  DependencyNode,
  FilePath
} from './types';

export const getTopologicalSorting = (dependencyMap: DependencyMap) => {
  const L = new Array<DependencyNode>();
  const S = new Set<{ node: DependencyNode, dependencyCount: number }>();

  dependencyMap.forEach((value, _) => S.add({
    node: value,
    dependencyCount: value.projectReferences.length
  }));

  const pushLeaves = () => {
    const T: FilePath[] = [];

    S.forEach((value) => {
      if (value.dependencyCount === 0) {
        S.delete(value);
        L.push(value.node);
        T.push(value.node.configPath);
      }
    });

    S.forEach((value) => {
      T.forEach((key) => {
        if (value.node.projectReferences.includes(key)) {
          value.dependencyCount += -1;
        }
      })
    });

    return T.length;
  };

  while (L.length < dependencyMap.size) {
    if (pushLeaves() === 0) {
      const T: FilePath[] = [];
      let value: DependencyNode = S.values().next().value.node;

      while (!T.includes(value.configPath)) {
        T.push(value.configPath);
        value = dependencyMap.get(value.projectReferences[0])!;
      }

      T.push(value.configPath);

      throw new Error(
        `Dependency cycle detected: \n|> ${T.slice(T.indexOf(value.configPath)).join('\n|> ')}`
      );
    }
  }

  return L;
}
