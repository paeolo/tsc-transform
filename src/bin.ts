#!/usr/bin/env node

import { run } from '.';
import meow from 'meow';

const cli = meow(`
  Usage
    $ tsc-transform --option <project>

  List of options
    - watch |> Build your changes while your are coding
    - clean |> Clean your source code output
`, {
  flags: {
    watch: {
      type: 'boolean',
      alias: 'w',
    },
    clean: {
      type: 'boolean',
      alias: 'c'
    },
  },
});

if (cli.input.length === 0 && !cli.flags.show)
  cli.showHelp(0);

export type FlagsType = typeof cli.flags;

run(
  cli.input,
  cli.flags,
)
  .catch((err: Error) => {
    console.error(err);
    process.exit(1);
  });
