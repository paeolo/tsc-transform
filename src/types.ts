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
