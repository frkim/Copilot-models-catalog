/**
 * Minimal client for the GitHub Copilot models endpoint.
 *
 * The Copilot API is not part of the public REST API: a GitHub token (OAuth or
 * personal access token of a user with a Copilot subscription) is first
 * exchanged for a short-lived Copilot token, which is then used to call
 * `GET https://api.githubcopilot.com/models`.
 */
import { VERSION } from './version.js';

export const GITHUB_API_BASE_URL = 'https://api.github.com';
export const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
export const USER_AGENT = 'copilot-models-catalog';
export const EDITOR_VERSION = `${USER_AGENT}/${VERSION}`;

/** Error carrying the HTTP status of a failed API call. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Copilot tokens are opaque strings shaped like `tid=...;exp=...`, so they can
 * be told apart from GitHub tokens and used directly.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isCopilotToken(token) {
  return typeof token === 'string' && token.startsWith('tid=');
}

function copilotHeaders(copilotToken) {
  return {
    authorization: ['Bearer', copilotToken].join(' '),
    accept: 'application/json',
    'user-agent': USER_AGENT,
    'editor-version': EDITOR_VERSION,
    'copilot-integration-id': 'vscode-chat'
  };
}

/**
 * Extracts the `message` field of an error payload. The rest of the body is
 * dropped on purpose: it may echo back request details such as headers.
 *
 * @param {Response} response
 * @returns {Promise<string>} a message to append to an error, possibly empty
 */
async function readErrorMessage(response) {
  try {
    const body = await response.json();
    const message = typeof body?.message === 'string' ? body.message : response.statusText;
    return message ? ` ${message.slice(0, 200)}` : '';
  } catch {
    return response.statusText ? ` ${response.statusText}` : '';
  }
}

/**
 * Exchanges a GitHub token for a short-lived Copilot token.
 *
 * @param {string} githubToken
 * @param {{fetchImpl?: typeof fetch, baseUrl?: string}} [options]
 * @returns {Promise<string>} the Copilot token
 */
export async function fetchCopilotToken(githubToken, options = {}) {
  const { fetchImpl = fetch, baseUrl = GITHUB_API_BASE_URL } = options;

  const response = await fetchImpl(`${baseUrl}/copilot_internal/v2/token`, {
    headers: {
      authorization: `token ${githubToken}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      'editor-version': EDITOR_VERSION
    }
  });

  if (!response.ok) {
    throw new ApiError(
      `Unable to obtain a Copilot token (HTTP ${response.status}).${await readErrorMessage(response)}`,
      response.status
    );
  }

  const payload = await response.json();

  if (!payload || typeof payload.token !== 'string') {
    throw new ApiError('The Copilot token response did not contain a token.', response.status);
  }

  return payload.token;
}

/**
 * Fetches the raw list of models visible to the authenticated Copilot user.
 *
 * @param {string} copilotToken
 * @param {{fetchImpl?: typeof fetch, baseUrl?: string}} [options]
 * @returns {Promise<object[]>} raw model entries
 */
export async function fetchModels(copilotToken, options = {}) {
  const { fetchImpl = fetch, baseUrl = COPILOT_API_BASE_URL } = options;

  const response = await fetchImpl(`${baseUrl}/models`, { headers: copilotHeaders(copilotToken) });

  if (!response.ok) {
    throw new ApiError(
      `Unable to list Copilot models (HTTP ${response.status}).${await readErrorMessage(response)}`,
      response.status
    );
  }

  const payload = await response.json();
  const models = Array.isArray(payload) ? payload : payload?.data;

  if (!Array.isArray(models)) {
    throw new ApiError('The Copilot models response did not contain a list of models.', response.status);
  }

  return models;
}

/**
 * Resolves a usable Copilot token from any supported token, then lists models.
 *
 * @param {string} token GitHub token or Copilot token
 * @param {{fetchImpl?: typeof fetch, githubBaseUrl?: string, copilotBaseUrl?: string}} [options]
 * @returns {Promise<object[]>} raw model entries
 */
export async function listModels(token, options = {}) {
  const {
    fetchImpl = fetch,
    githubBaseUrl = GITHUB_API_BASE_URL,
    copilotBaseUrl = COPILOT_API_BASE_URL
  } = options;

  const copilotToken = isCopilotToken(token)
    ? token
    : await fetchCopilotToken(token, { fetchImpl, baseUrl: githubBaseUrl });

  return fetchModels(copilotToken, { fetchImpl, baseUrl: copilotBaseUrl });
}
