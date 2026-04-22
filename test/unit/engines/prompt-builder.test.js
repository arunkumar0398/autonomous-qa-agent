import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, parseScenarios } from '../../../src/engines/generator/prompt-builder.js';

describe('buildPrompt', () => {
  const feature = {
    filePath: 'src/routes/auth.js',
    changeType: 'modified',
    description: 'Modified: login, register in src/routes/auth.js',
    priority: 'high',
    diff: '+async function login(req, res) { ... }',
  };

  test('returns messages array with system + user roles', () => {
    const msgs = buildPrompt(feature);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].role, 'user');
  });

  test('user message contains file path', () => {
    const msgs = buildPrompt(feature);
    assert.ok(msgs[1].content.includes('src/routes/auth.js'));
  });

  test('user message contains diff', () => {
    const msgs = buildPrompt(feature);
    assert.ok(msgs[1].content.includes('+async function login'));
  });

  test('handles missing diff gracefully', () => {
    const msgs = buildPrompt({ ...feature, diff: '' });
    assert.ok(msgs[1].content.includes('no diff available'));
  });
});

describe('parseScenarios', () => {
  const validJson = JSON.stringify([
    {
      scenarioName: 'User logs in successfully',
      description: 'Tests happy path login flow',
      priority: 'high',
      type: 'happy_path',
      steps: ['Navigate to /login', 'Fill email field with user@test.com', 'Click Submit'],
    },
  ]);

  test('parses clean JSON array', () => {
    const result = parseScenarios(validJson);
    assert.equal(result.length, 1);
    assert.equal(result[0].scenarioName, 'User logs in successfully');
    assert.equal(result[0].steps.length, 3);
  });

  test('strips markdown code fences', () => {
    const wrapped = '```json\n' + validJson + '\n```';
    const result = parseScenarios(wrapped);
    assert.equal(result.length, 1);
  });

  test('extracts embedded JSON array from prose', () => {
    const withProse = 'Here are the scenarios:\n' + validJson + '\nDone.';
    const result = parseScenarios(withProse);
    assert.equal(result.length, 1);
  });

  test('returns empty array on invalid JSON', () => {
    const result = parseScenarios('not json at all');
    assert.deepEqual(result, []);
  });

  test('returns empty array when root is object not array', () => {
    const result = parseScenarios('{"key": "value"}');
    assert.deepEqual(result, []);
  });

  test('returns empty array on empty string', () => {
    const result = parseScenarios('');
    assert.deepEqual(result, []);
  });
});
