import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMvpRunPayload, validateMvpRunPayload } from '../src/lib/payload-validator.js';

test('validateMvpRunPayload requires repoSnapshot', () => {
  const result = validateMvpRunPayload({});
  assert.equal(result.valid, false);
});

test('normalizeMvpRunPayload defaults files/dependencies', () => {
  const normalized = normalizeMvpRunPayload({ repoSnapshot: {} });
  assert.deepEqual(normalized.repoSnapshot.files, []);
  assert.deepEqual(normalized.repoSnapshot.dependencies, []);
});
