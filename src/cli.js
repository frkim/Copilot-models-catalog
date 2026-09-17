#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ApiError, COPILOT_API_BASE_URL, listModels } from './api.js';
import { buildCatalog, filterCatalogByStatus } from './catalog.js';
import { VERSION } from './version.js';

const USAGE = `copilot-models-catalog ${VERSION}

Lists the GitHub Copilot models available to the authenticated user together
with their current status (enabled or disabled) and writes the result as JSON.

Usage:
  copilot-models-catalog [options]

Options:
  -t, --token <token>    GitHub token (or Copilot token) to authenticate with.
                         Defaults to $COPILOT_TOKEN, $GITHUB_TOKEN or $GH_TOKEN.
  -o, --output <file>    Write the JSON catalog to <file> instead of stdout.
  -s, --status <status>  Only include models with this status:
                         all (default), enabled or disabled.
  -c, --compact          Print the JSON on a single line.
  -h, --help             Show this help message.
  -v, --version          Show the version number.
`;

const OPTIONS = {
  token: { type: 'string', short: 't' },
  output: { type: 'string', short: 'o' },
  status: { type: 'string', short: 's', default: 'all' },
  compact: { type: 'boolean', short: 'c', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false }
};

const VALID_STATUSES = ['all', 'enabled', 'disabled'];

function resolveToken(values, env) {
  const candidates = [values.token, env.COPILOT_TOKEN, env.GITHUB_TOKEN, env.GH_TOKEN];

  return candidates.map((candidate) => candidate?.trim()).find(Boolean) ?? null;
}

/**
 * Runs the CLI.
 *
 * @param {string[]} argv command line arguments (without node and script path)
 * @param {object} [dependencies] injected dependencies, used by the tests
 * @returns {Promise<number>} the process exit code
 */
export async function run(argv, dependencies = {}) {
  const {
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    listModelsImpl = listModels,
    writeFileImpl = writeFile
  } = dependencies;

  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: OPTIONS }));
  } catch (error) {
    stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (values.help) {
    stdout.write(USAGE);
    return 0;
  }

  if (values.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (!VALID_STATUSES.includes(values.status)) {
    stderr.write(`Unknown status "${values.status}". Expected one of: ${VALID_STATUSES.join(', ')}.\n`);
    return 2;
  }

  const token = resolveToken(values, env);

  if (!token) {
    stderr.write(
      'No GitHub token found. Pass --token or set COPILOT_TOKEN, GITHUB_TOKEN or GH_TOKEN.\n'
    );
    return 2;
  }

  let catalog;
  try {
    const rawModels = await listModelsImpl(token);
    catalog = filterCatalogByStatus(
      buildCatalog(rawModels, { source: `${COPILOT_API_BASE_URL}/models` }),
      values.status
    );
  } catch (error) {
    const suffix = error instanceof ApiError && error.status === 401 ? ' Is the token valid?' : '';
    stderr.write(`${error.message}${suffix}\n`);
    return 1;
  }

  const json = values.compact ? JSON.stringify(catalog) : JSON.stringify(catalog, null, 2);

  if (values.output) {
    try {
      await writeFileImpl(values.output, `${json}\n`, 'utf8');
    } catch (error) {
      stderr.write(`Unable to write ${values.output}: ${error.message}\n`);
      return 1;
    }

    stderr.write(
      `Wrote ${catalog.models.length} model(s) to ${values.output} ` +
        `(${catalog.summary.enabled} enabled, ${catalog.summary.disabled} disabled).\n`
    );
    return 0;
  }

  stdout.write(`${json}\n`);
  return 0;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  process.exitCode = await run(process.argv.slice(2));
}
