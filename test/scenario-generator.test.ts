import test from 'node:test';
import assert from 'node:assert/strict';
import { generateScenarios } from '../src/lib/scenario-generator.js';

test('generateScenarios creates 4 scenarios per feature', () => {
  const scenarios = generateScenarios([{ featureId: 'feature_login', source: 'src/components/Login.jsx', category: 'button' }]);
  assert.equal(scenarios.length, 4);
});
