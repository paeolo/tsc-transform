import 'v8-compile-cache';

import watcher from '@parcel/watcher';

import type {
  FlagsType
} from './bin';
import {
  FilePath,
  getDependencies,
} from './dependencies';
import {
  Runner, RunnerClean
} from './runner';
import {
  getEvent
} from './utils';
import {
  CustomTransformers
} from './types';

const watch = async (configPath: FilePath, customTransformer?: CustomTransformers) => {
  const runner = new Runner(
    getDependencies(configPath),
    customTransformer
  );

  const handler = (err: Error | null, events: watcher.Event[]) => {
    if (err) throw err;
    runner.build(getEvent(events));
  };

  return watcher.subscribe(
    runner.getCommonDir(),
    handler
  );
}
const clean = (configPath: FilePath) => {
  new RunnerClean(
    getDependencies(configPath)
  );
}

const build = (configPath: FilePath, customTransformer?: CustomTransformers) => {
  new Runner(
    getDependencies(configPath),
    customTransformer
  );
}

export default async (configPath: FilePath, flags: FlagsType, customTransformer?: CustomTransformers) => {
  if (!configPath) {
    throw new Error('missing input argument');
  }

  if (flags.watch) {
    return watch(
      configPath,
      customTransformer
    );
  }
  else if (flags.clean) {
    clean(configPath);
  }
  else {
    build(
      configPath,
      customTransformer
    );
  }
}
