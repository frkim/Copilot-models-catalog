import assert from 'node:assert/strict';
import { test } from 'node:test';

import { run } from '../src/cli.js';

function stream() {
  const chunks = [];
  return {
    write: (chunk) => chunks.push(chunk),
    get text() {
      return chunks.join('');
    }
  };
}

const RAW_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', vendor: 'OpenAI' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', policy: { state: 'unconfigured' } }
];

function dependencies(overrides = {}) {
  return {
    env: { GITHUB_TOKEN: 'ghp_example' },
    stdout: stream(),
    stderr: stream(),
    listModelsImpl: async () => RAW_MODELS,
    writeFileImpl: async () => {},
    ...overrides
  };
}

test('prints the JSON catalog on stdout', async () => {
  const deps = dependencies();

  assert.equal(await run([], deps), 0);

  const catalog = JSON.parse(deps.stdout.text);
  assert.deepEqual(catalog.summary, { total: 2, enabled: 1, disabled: 1 });
  assert.equal(catalog.source, 'https://api.githubcopilot.com/models');
  assert.deepEqual(
    catalog.models.map((model) => [model.id, model.status]),
    [
      ['claude-sonnet-4', 'disabled'],
      ['gpt-4o', 'enabled']
    ]
  );
});

test('--status filters the listed models', async () => {
  const deps = dependencies();

  assert.equal(await run(['--status', 'enabled'], deps), 0);

  const catalog = JSON.parse(deps.stdout.text);
  assert.equal(catalog.filter, 'enabled');
  assert.deepEqual(
    catalog.models.map((model) => model.id),
    ['gpt-4o']
  );
});

test('--compact prints a single line', async () => {
  const deps = dependencies();

  assert.equal(await run(['--compact'], deps), 0);
  assert.equal(deps.stdout.text.trimEnd().includes('\n'), false);
});

test('--output writes the catalog to a file', async () => {
  const writes = [];
  const deps = dependencies({
    writeFileImpl: async (file, contents, encoding) => writes.push({ file, contents, encoding })
  });

  assert.equal(await run(['--output', 'models.json'], deps), 0);
  assert.equal(deps.stdout.text, '');
  assert.equal(writes[0].file, 'models.json');
  assert.equal(writes[0].encoding, 'utf8');
  assert.equal(JSON.parse(writes[0].contents).summary.total, 2);
  assert.match(deps.stderr.text, /Wrote 2 model\(s\) to models\.json/);
});

test('reports a failure to write the output file', async () => {
  const deps = dependencies({
    writeFileImpl: async () => {
      throw new Error('EACCES: permission denied');
    }
  });

  assert.equal(await run(['--output', '/nope/models.json'], deps), 1);
  assert.match(deps.stderr.text, /Unable to write \/nope\/models\.json: EACCES/);
});

test('--token wins over the environment', async () => {
  const tokens = [];
  const deps = dependencies({
    env: { GITHUB_TOKEN: 'from-env' },
    listModelsImpl: async (token) => {
      tokens.push(token);
      return RAW_MODELS;
    }
  });

  assert.equal(await run(['--token', 'from-flag'], deps), 0);
  assert.deepEqual(tokens, ['from-flag']);
});

test('fails when no token is available', async () => {
  const deps = dependencies({ env: {} });

  assert.equal(await run([], deps), 2);
  assert.match(deps.stderr.text, /No GitHub token found/);
});

test('blank tokens are ignored', async () => {
  const tokens = [];
  const deps = dependencies({
    env: { GITHUB_TOKEN: '  ', GH_TOKEN: ' ghp_example ' },
    listModelsImpl: async (token) => {
      tokens.push(token);
      return RAW_MODELS;
    }
  });

  assert.equal(await run(['--token', ' '], deps), 0);
  assert.deepEqual(tokens, ['ghp_example']);
});

test('rejects an unknown status', async () => {
  const deps = dependencies();

  assert.equal(await run(['--status', 'nope'], deps), 2);
  assert.match(deps.stderr.text, /Unknown status/);
});

test('rejects unknown options', async () => {
  const deps = dependencies();

  assert.equal(await run(['--nope'], deps), 2);
  assert.match(deps.stderr.text, /Usage/);
});

test('reports API failures', async () => {
  const deps = dependencies({
    listModelsImpl: async () => {
      throw new Error('boom');
    }
  });

  assert.equal(await run([], deps), 1);
  assert.match(deps.stderr.text, /boom/);
});

test('--help and --version short circuit', async () => {
  const help = dependencies();
  assert.equal(await run(['--help'], help), 0);
  assert.match(help.stdout.text, /Usage/);

  const version = dependencies();
  assert.equal(await run(['--version'], version), 0);
  assert.match(version.stdout.text, /^\d+\.\d+\.\d+/);
});
