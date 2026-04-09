import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBugFixIntent, detectUiFeatures } from '../src/lib/feature-detector.js';

test('detectUiFeatures extracts component/page-like files', () => {
  const features = detectUiFeatures({
    files: ['src/components/LoginButton.jsx', 'src/views/Dashboard.vue', 'docs/readme.md']
  });

  assert.equal(features.length, 2);
  assert.equal(features[0].featureId.length > 0, true);
});

test('detectBugFixIntent should identify fix metadata', () => {
  const fixIntent = detectBugFixIntent({ title: 'fix: login issue', branch: 'hotfix/login', labels: [] });
  assert.equal(fixIntent.detected, true);
});
