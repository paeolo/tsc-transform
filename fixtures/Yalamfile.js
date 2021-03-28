const {
  pipe,
} = require('@yalam/core');
const {
  destination,
  source,
} = require('@yalam/operators');
const {
  tsCompiler
} = require('@yalam/typescript');


const tsc = pipe(
  source({ glob: 'src/**/*.ts' }),
  tsCompiler.transpile(),
  destination({ path: 'dist' })
);

module.exports = {
  default: tsc,
};
