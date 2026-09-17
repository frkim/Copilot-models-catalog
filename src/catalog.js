/**
 * Normalization helpers that turn raw GitHub Copilot `/models` payloads into a
 * stable catalog document.
 */

/**
 * A model is considered disabled when the policy attached to it is not in the
 * `enabled` state. Models without a policy are always available to the user.
 *
 * @param {object} rawModel raw model entry returned by the Copilot API
 * @returns {object} normalized model entry
 */
export function normalizeModel(rawModel) {
  if (!rawModel || typeof rawModel !== 'object') {
    throw new TypeError('A model entry must be an object');
  }

  const policyState = rawModel.policy?.state ?? null;
  const enabled = policyState === null ? true : policyState === 'enabled';

  return {
    id: rawModel.id ?? null,
    name: rawModel.name ?? rawModel.id ?? null,
    vendor: rawModel.vendor ?? null,
    family: rawModel.capabilities?.family ?? null,
    version: rawModel.version ?? null,
    status: enabled ? 'enabled' : 'disabled',
    enabled,
    policy: {
      state: policyState,
      /** Models gated by a policy must be enabled by the user or an admin. */
      required: rawModel.policy !== undefined && rawModel.policy !== null,
      termsUrl: rawModel.policy?.terms ?? null
    },
    preview: Boolean(rawModel.preview),
    modelPicker: {
      enabled: Boolean(rawModel.model_picker_enabled),
      category: rawModel.model_picker_category ?? null
    },
    capabilities: {
      type: rawModel.capabilities?.type ?? null,
      supports: rawModel.capabilities?.supports ?? {},
      limits: rawModel.capabilities?.limits ?? {}
    }
  };
}

/**
 * Builds the JSON document produced by the CLI.
 *
 * @param {object[]} rawModels raw model entries returned by the Copilot API
 * @param {{source?: string, generatedAt?: string}} [options]
 * @returns {object} catalog document
 */
export function buildCatalog(rawModels, options = {}) {
  if (!Array.isArray(rawModels)) {
    throw new TypeError('Expected an array of models');
  }

  const models = rawModels
    .map((rawModel) => normalizeModel(rawModel))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const enabled = models.filter((model) => model.enabled).length;

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: options.source ?? null,
    summary: {
      total: models.length,
      enabled,
      disabled: models.length - enabled
    },
    models
  };
}

/**
 * Filters the model list of a catalog document by status. The summary keeps
 * describing the whole catalog, so callers can tell how many models were left
 * out by the filter.
 *
 * @param {object} catalog catalog document built by {@link buildCatalog}
 * @param {'all'|'enabled'|'disabled'} status status to keep
 * @returns {object} filtered catalog document
 */
export function filterCatalogByStatus(catalog, status) {
  if (status === 'all') {
    return { ...catalog };
  }

  if (status !== 'enabled' && status !== 'disabled') {
    throw new TypeError(`Unknown status filter: ${status}`);
  }

  const models = catalog.models.filter((model) => model.status === status);

  return { ...catalog, models };
}
