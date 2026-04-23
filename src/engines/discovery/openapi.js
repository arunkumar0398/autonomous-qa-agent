/**
 * OpenAPI discovery adapter.
 *
 * Parses OpenAPI 3.x / Swagger 2.x specs (JSON or YAML) and converts
 * each operation into the standard feature shape.
 *
 * Supports:
 *   - Local file path (absolute or relative to cwd)
 *   - HTTP/HTTPS URL (fetched at runtime)
 *   - Optional base spec for diffing (only new/changed operations returned)
 *
 * Required env vars (all optional — adapter skips when absent):
 *   TESTPILOT_OPENAPI_SPEC        Path or URL to current spec
 *
 * Optional env vars:
 *   TESTPILOT_OPENAPI_BASE_SPEC   Path or URL to base spec (for diff mode)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

/** HTTP methods that represent testable API operations. */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

/** Path segments that imply higher test priority. */
const HIGH_PRIORITY_SEGMENTS = [
  'auth', 'login', 'logout', 'register', 'signup',
  'payment', 'checkout', 'order', 'cart',
  'admin', 'user', 'account', 'token', 'webhook',
];

/**
 * Infer priority from API path.
 * @param {string} apiPath
 * @param {string} method
 * @returns {'high'|'medium'|'low'}
 */
function inferPriority(apiPath, method) {
  const lower = apiPath.toLowerCase();
  if (HIGH_PRIORITY_SEGMENTS.some((s) => lower.includes(s))) return 'high';
  // Mutating methods on non-trivial paths get medium
  if (['post', 'put', 'patch', 'delete'].includes(method)) return 'medium';
  return 'low';
}

/**
 * Load and parse a spec from a file path or URL.
 * @param {string} source  - file path or http(s):// URL
 * @returns {Promise<object>}
 */
async function loadSpec(source) {
  let raw;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source, { headers: { Accept: 'application/json, application/yaml, text/yaml' } });
    if (!res.ok) throw new Error(`Failed to fetch spec from ${source}: HTTP ${res.status}`);
    raw = await res.text();
  } else {
    raw = readFileSync(resolve(source), 'utf-8');
  }

  // Try JSON first, fall back to YAML
  try {
    return JSON.parse(raw);
  } catch {
    return yaml.load(raw);
  }
}

/**
 * Extract all operations from an OpenAPI 3.x or Swagger 2.x spec.
 * Returns a Map keyed by `${method}:${path}` → operation object.
 *
 * @param {object} spec
 * @returns {Map<string, {method: string, path: string, operation: object, spec: object}>}
 */
function extractOperations(spec) {
  const ops = new Map();
  const paths = spec.paths ?? {};

  for (const [apiPath, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      ops.set(`${method}:${apiPath}`, { method, apiPath, operation, spec });
    }
  }

  return ops;
}

/**
 * Build a diff-like summary of an operation for LLM context.
 * @param {string} method
 * @param {string} apiPath
 * @param {object} operation
 * @param {object} spec  - full spec (for resolving $ref in schemas)
 * @returns {string}
 */
function buildOperationContext(method, apiPath, operation, spec) {
  const lines = [
    `${method.toUpperCase()} ${apiPath}`,
    operation.summary    ? `Summary: ${operation.summary}`    : null,
    operation.description ? `Description: ${operation.description?.slice(0, 300)}` : null,
  ].filter(Boolean);

  // Parameters
  const params = operation.parameters ?? [];
  if (params.length > 0) {
    lines.push(`Parameters: ${params.map((p) => `${p.name} (${p.in}${p.required ? ', required' : ''})`).join(', ')}`);
  }

  // Request body (OpenAPI 3.x)
  if (operation.requestBody) {
    const content = operation.requestBody.content ?? {};
    const mediaTypes = Object.keys(content);
    if (mediaTypes.length > 0) {
      lines.push(`Request body: ${mediaTypes.join(', ')}`);
    }
  }

  // Response codes
  const responses = operation.responses ?? {};
  const codes = Object.keys(responses);
  if (codes.length > 0) {
    lines.push(`Responses: ${codes.map((c) => `${c} ${responses[c].description ?? ''}`).join(', ')}`);
  }

  // Tags
  if (operation.tags?.length > 0) {
    lines.push(`Tags: ${operation.tags.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Convert an extracted operation to the standard discovery feature shape.
 * @param {string} method
 * @param {string} apiPath
 * @param {object} operation
 * @param {object} spec
 * @param {'added'|'modified'} changeType
 * @returns {object}
 */
function operationToFeature(method, apiPath, operation, spec, changeType = 'added') {
  const id = `openapi:${method}:${apiPath}`;
  const context = buildOperationContext(method, apiPath, operation, spec);

  return {
    id,
    filePath:    `openapi/${method}${apiPath.replace(/\//g, '_').replace(/[{}]/g, '')}`,
    changeType,
    description: `${changeType === 'added' ? 'New' : 'Changed'} API: ${method.toUpperCase()} ${apiPath}` +
                 (operation.summary ? ` — ${operation.summary}` : ''),
    priority:    inferPriority(apiPath, method),
    diff:        context,
    source:      'openapi',
    metadata: {
      method,
      apiPath,
      operationId: operation.operationId ?? null,
      tags:        operation.tags ?? [],
    },
  };
}

/**
 * Run OpenAPI discovery. Returns empty array if spec is not configured.
 *
 * @param {object} [options]
 * @param {string} [options.spec]      - path or URL to current spec
 * @param {string} [options.baseSpec]  - path or URL to base spec (diff mode)
 * @returns {Promise<object[]>}
 */
export async function discoverFromOpenApi(options = {}) {
  const specSource     = options.spec     ?? process.env.TESTPILOT_OPENAPI_SPEC;
  const baseSpecSource = options.baseSpec ?? process.env.TESTPILOT_OPENAPI_BASE_SPEC;

  if (!specSource) return [];

  let currentSpec;
  try {
    currentSpec = await loadSpec(specSource);
  } catch (err) {
    console.warn(`[discovery/openapi] failed to load spec from ${specSource}: ${err.message}`);
    return [];
  }

  const currentOps = extractOperations(currentSpec);

  // Diff mode: only return new/changed operations compared to base spec
  if (baseSpecSource) {
    let baseSpec;
    try {
      baseSpec = await loadSpec(baseSpecSource);
    } catch (err) {
      console.warn(`[discovery/openapi] failed to load base spec: ${err.message} — returning all operations`);
      // Fall through to return all operations
      return [...currentOps.entries()].map(([, { method, apiPath, operation }]) =>
        operationToFeature(method, apiPath, operation, currentSpec, 'added'),
      );
    }

    const baseOps = extractOperations(baseSpec);
    const features = [];

    for (const [key, { method, apiPath, operation }] of currentOps.entries()) {
      if (!baseOps.has(key)) {
        // New operation
        features.push(operationToFeature(method, apiPath, operation, currentSpec, 'added'));
      } else {
        // Check if changed (compare serialised operation — shallow check)
        const baseSerialized    = JSON.stringify(baseOps.get(key).operation);
        const currentSerialized = JSON.stringify(operation);
        if (baseSerialized !== currentSerialized) {
          features.push(operationToFeature(method, apiPath, operation, currentSpec, 'modified'));
        }
      }
    }

    return features;
  }

  // No base spec — return all operations
  return [...currentOps.entries()].map(([, { method, apiPath, operation }]) =>
    operationToFeature(method, apiPath, operation, currentSpec, 'added'),
  );
}
