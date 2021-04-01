import 'v8-compile-cache';

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

  new Runner(getDependencies(input[0]));
}
