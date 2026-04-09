import type { ChimeraRunPayload, ChangeMeta, RepoSnapshot } from '../types/domain.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateMvpRunPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ['Payload must be an object.'] };
  }

  if (!isObject(payload.repoSnapshot)) {
    errors.push('`repoSnapshot` is required and must be an object.');
  }

  const snapshot = (payload.repoSnapshot ?? {}) as Partial<RepoSnapshot>;

  if (snapshot.files !== undefined && !Array.isArray(snapshot.files)) {
    errors.push('`repoSnapshot.files` must be an array of file paths.');
  }

  if (snapshot.dependencies !== undefined && !Array.isArray(snapshot.dependencies)) {
    errors.push('`repoSnapshot.dependencies` must be an array.');
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeMvpRunPayload(payload: Partial<ChimeraRunPayload>): ChimeraRunPayload {
  const snapshot = (payload.repoSnapshot ?? {}) as Partial<RepoSnapshot>;

  return {
    ...payload,
    repoSnapshot: {
      ...snapshot,
      files: Array.isArray(snapshot.files) ? snapshot.files : [],
      dependencies: Array.isArray(snapshot.dependencies) ? snapshot.dependencies : []
    },
    changeMeta: isObject(payload.changeMeta) ? (payload.changeMeta as ChangeMeta) : {}
  } as ChimeraRunPayload;
}
