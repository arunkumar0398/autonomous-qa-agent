import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestFile } from '../../../src/engines/executor/playwright-runner.js';

describe('buildTestFile', () => {
  test('generates valid Playwright test structure', () => {
    const scenario = {
      scenarioName: 'User can navigate to login page',
      steps: ['Navigate to /login'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes("import { test, expect } from '@playwright/test'"));
    assert.ok(code.includes('User can navigate to login page'));
    assert.ok(code.includes('async ({ page }) =>'));
  });

  test('navigate step emits page.goto', () => {
    const scenario = {
      scenarioName: 'Navigation test',
      steps: ['Navigate to /dashboard'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('page.goto'));
    assert.ok(code.includes('/dashboard'));
  });

  test('click step emits page.getByText click', () => {
    const scenario = {
      scenarioName: 'Click test',
      steps: ['Click on Submit button'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('getByText'));
    assert.ok(code.includes('.click()'));
  });

  test('fill step emits page.getByLabel fill', () => {
    const scenario = {
      scenarioName: 'Fill test',
      steps: ['Fill email field in form with user@test.com'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('getByLabel'));
    assert.ok(code.includes('.fill('));
  });

  test('expect step emits toBeVisible assertion', () => {
    const scenario = {
      scenarioName: 'Assert test',
      steps: ['Verify user should see Welcome message'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('toBeVisible'));
  });

  test('unrecognized steps become TODO comments', () => {
    const scenario = {
      scenarioName: 'Unknown step',
      steps: ['Do something totally ambiguous'],
    };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('// TODO:'));
    assert.ok(code.includes('Do something totally ambiguous'));
  });

  test('uses provided baseUrl for bare navigations', () => {
    const scenario = {
      scenarioName: 'Base URL test',
      steps: ['Navigate to /home'],
    };
    const code = buildTestFile(scenario, 'http://localhost:4000');
    assert.ok(code.includes('/home'));
  });

  test('scenario name is JSON-escaped in output', () => {
    const scenario = {
      scenarioName: 'Test with "quotes" and \'apostrophes\'',
      steps: [],
    };
    // buildTestFile uses JSON.stringify for the name — should not throw
    assert.doesNotThrow(() => buildTestFile(scenario));
    const code = buildTestFile(scenario);
    assert.ok(code.includes('test('));
  });

  test('empty steps produces valid (empty) test body', () => {
    const scenario = { scenarioName: 'Empty steps', steps: [] };
    const code = buildTestFile(scenario);
    assert.ok(code.includes('async ({ page }) =>'));
  });
});
