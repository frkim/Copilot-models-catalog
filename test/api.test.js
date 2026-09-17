import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, fetchCopilotToken, fetchModels, isCopilotToken, listModels } from '../src/api.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test('isCopilotToken recognizes Copilot tokens', () => {
  assert.equal(isCopilotToken('tid=abc;exp=123'), true);
  assert.equal(isCopilotToken('ghp_example'), false);
  assert.equal(isCopilotToken(undefined), false);
});

test('fetchCopilotToken exchanges a GitHub token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ token: 'tid=abc;exp=1' });
  };

  const token = await fetchCopilotToken('ghp_example', { fetchImpl, baseUrl: 'https://api.test' });

  assert.equal(token, 'tid=abc;exp=1');
  assert.equal(calls[0].url, 'https://api.test/copilot_internal/v2/token');
  assert.equal(calls[0].init.headers.authorization, 'token ghp_example');
});

test('fetchCopilotToken surfaces HTTP errors without echoing the whole body', async () => {
  const fetchImpl = async () =>
    jsonResponse({ message: 'Bad credentials', request: { authorization: 'token secret' } }, { ok: false, status: 401 });

  await assert.rejects(() => fetchCopilotToken('bad', { fetchImpl }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.match(error.message, /Bad credentials/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});

test('fetchModels reads the data array and authenticates with the Copilot token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ data: [{ id: 'gpt-4o' }] });
  };

  const models = await fetchModels('tid=abc', { fetchImpl, baseUrl: 'https://copilot.test' });

  assert.deepEqual(models, [{ id: 'gpt-4o' }]);
  assert.equal(calls[0].url, 'https://copilot.test/models');
  assert.equal(calls[0].init.headers.authorization, ['Bearer', 'tid=abc'].join(' '));
});

test('fetchModels accepts a bare array payload', async () => {
  const fetchImpl = async () => jsonResponse([{ id: 'gpt-4o' }]);

  assert.deepEqual(await fetchModels('tid=abc', { fetchImpl }), [{ id: 'gpt-4o' }]);
});

test('fetchModels rejects unexpected payloads', async () => {
  const fetchImpl = async () => jsonResponse({ unexpected: true });

  await assert.rejects(() => fetchModels('tid=abc', { fetchImpl }), ApiError);
});

test('listModels exchanges GitHub tokens but reuses Copilot tokens', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return url.endsWith('/models')
      ? jsonResponse({ data: [{ id: 'gpt-4o' }] })
      : jsonResponse({ token: 'tid=abc' });
  };

  await listModels('ghp_example', { fetchImpl });
  assert.equal(urls.length, 2);

  urls.length = 0;
  await listModels('tid=abc', { fetchImpl });
  assert.deepEqual(urls, ['https://api.githubcopilot.com/models']);
});
