import {
  FilePath
} from "./dependencies";

export const enum BuildStatus {
  Updated,
  Unchanged,
}

export type BuildStatusGetter = (configPath: FilePath) => BuildStatus;
