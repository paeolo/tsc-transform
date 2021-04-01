import ts from 'typescript';

export type FilePath = string;

export type DirectoryPath = string;

export interface DependencyNode {
  configPath: FilePath;
  commandLine: ts.ParsedCommandLine;
  projectReferences: FilePath[];
}

export type DependencyMap = Map<FilePath, DependencyNode>;
