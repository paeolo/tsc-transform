import 'v8-compile-cache';

import watcher from '@parcel/watcher';
import ts from 'typescript';

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

const watch = async (configPath: FilePath, customTransformer?: ts.CustomTransformers) => {
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

const build = (configPath: FilePath, customTransformer?: ts.CustomTransformers) => {
  new Runner(
    getDependencies(configPath),
    customTransformer
  );
}

export const run = async (input: string[], flags: FlagsType, customTransformer?: ts.CustomTransformers) => {
  if (!input[0]) {
    throw new Error('missing input argument');
  }

  const configPath = input[0];

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
