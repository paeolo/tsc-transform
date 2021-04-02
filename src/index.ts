import 'v8-compile-cache';

import watcher from '@parcel/watcher';

import type { FlagsType } from './bin';
import {
  getDependencies,
} from './dependencies';
import {
  Runner
} from './runner';

export const run = async (input: string[], flags: FlagsType) => {
  if (!input[0]) {
    throw new Error('missing input argument');
  }

  const runner = new Runner(getDependencies(input[0]));

  return watcher.subscribe(runner.getCommonDir(), (err, events) => {
    if (err) {
      throw err;
    };

    runner.build({
      deleted: events.filter(event => event.type === 'delete')
        .map(event => event.path),
      updated: events.filter(event => event.type === 'create' || event.type === 'update')
        .map(event => event.path),
    });
  })
}
