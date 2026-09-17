import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCatalog, filterCatalogByStatus, normalizeModel } from '../src/catalog.js';

const RAW_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    vendor: 'OpenAI',
    version: 'gpt-4o-2024-11-20',
    model_picker_enabled: true,
    model_picker_category: 'versatile',
    capabilities: { family: 'gpt-4o', type: 'chat', limits: { max_output_tokens: 16384 } }
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    vendor: 'Anthropic',
    preview: true,
    policy: { state: 'unconfigured', terms: 'https://example.test/terms' },
    capabilities: { family: 'claude-sonnet-4', type: 'chat' }
  }
];

test('a model without a policy is enabled', () => {
  const model = normalizeModel(RAW_MODELS[0]);

  assert.equal(model.status, 'enabled');
  assert.equal(model.enabled, true);
  assert.deepEqual(model.policy, { state: null, required: false, termsUrl: null });
  assert.equal(model.family, 'gpt-4o');
  assert.deepEqual(model.modelPicker, { enabled: true, category: 'versatile' });
});

test('a model whose policy is not enabled is reported as disabled', () => {
  const model = normalizeModel(RAW_MODELS[1]);

  assert.equal(model.status, 'disabled');
  assert.equal(model.enabled, false);
  assert.deepEqual(model.policy, {
    state: 'unconfigured',
    required: true,
    termsUrl: 'https://example.test/terms'
  });
  assert.equal(model.preview, true);
});

test('a model whose policy is enabled is reported as enabled', () => {
  const model = normalizeModel({ id: 'o3-mini', policy: { state: 'enabled' } });

  assert.equal(model.status, 'enabled');
  assert.equal(model.policy.required, true);
  assert.equal(model.name, 'o3-mini');
});

test('normalizeModel rejects non object entries', () => {
  assert.throws(() => normalizeModel(null), TypeError);
});

test('buildCatalog summarizes and sorts the models', () => {
  const catalog = buildCatalog(RAW_MODELS, {
    source: 'https://api.githubcopilot.com/models',
    generatedAt: '2026-01-01T00:00:00.000Z'
  });

  assert.equal(catalog.generatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(catalog.source, 'https://api.githubcopilot.com/models');
  assert.deepEqual(catalog.summary, { total: 2, enabled: 1, disabled: 1 });
  assert.deepEqual(
    catalog.models.map((model) => model.id),
    ['claude-sonnet-4', 'gpt-4o']
  );
});

test('buildCatalog rejects non array payloads', () => {
  assert.throws(() => buildCatalog({ data: [] }), TypeError);
});

test('filterCatalogByStatus keeps only the requested status', () => {
  const catalog = buildCatalog(RAW_MODELS);

  assert.deepEqual(
    filterCatalogByStatus(catalog, 'disabled').models.map((model) => model.id),
    ['claude-sonnet-4']
  );
  assert.deepEqual(
    filterCatalogByStatus(catalog, 'enabled').models.map((model) => model.id),
    ['gpt-4o']
  );
  assert.equal(filterCatalogByStatus(catalog, 'all').models.length, 2);
  assert.throws(() => filterCatalogByStatus(catalog, 'nope'), TypeError);
});
