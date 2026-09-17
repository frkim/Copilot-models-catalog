import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Version of the package, single source of truth for the CLI and API headers. */
export const VERSION = require('../package.json').version;
