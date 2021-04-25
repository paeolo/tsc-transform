import ts from 'typescript';
import {
  FilePath
} from "./dependencies";

export const enum BuildStatus {
  OutOfDate,
  Unbuildable,
  Unchanged,
  Updated,
}

export type BuildStatusGetter = (configPath: FilePath) => BuildStatus;

export interface FSEvent {
  count: number;
  updated: FilePath[];
  deleted: FilePath[];
}

export interface CustomTransformers {
  before?: ((program: ts.Program) => (ts.TransformerFactory<ts.SourceFile> | ts.CustomTransformerFactory))[];
  after?: ((program: ts.Program) => (ts.TransformerFactory<ts.SourceFile> | ts.CustomTransformerFactory))[];
  afterDeclarations?: ((program: ts.Program) => (ts.TransformerFactory<ts.Bundle | ts.SourceFile> | ts.CustomTransformerFactory))[];
}
