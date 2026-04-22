import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Convert plain-English step strings to Playwright code lines.
 * This is a best-effort heuristic translator for Phase 1.
 * Phase 2 will use LLM-assisted code generation for more complex steps.
 *
 * @param {string[]} steps
 * @param {string} [baseUrl]
 * @returns {string}
 */
function stepsToPlaywrightCode(steps, baseUrl = 'http://localhost:3000') {
  const lines = [];
  // All dynamic values are JSON.stringify'd so they become valid JS string literals
  // and cannot break out of the string context or inject code.
  for (const step of steps) {
    const s = step.toLowerCase();

    if (s.includes('navigate to') || s.includes('go to') || s.includes('open')) {
      const urlMatch = step.match(/https?:\/\/\S+|\/\S*/);
      const url = urlMatch ? urlMatch[0] : baseUrl;
      lines.push(`  await page.goto(${JSON.stringify(url)});`);
    } else if (s.includes('click')) {
      const target = step.replace(/click\s+(on\s+)?/i, '').trim();
      lines.push(`  await page.getByText(${JSON.stringify(target)}, { exact: false }).click();`);
    } else if (s.includes('fill') || s.includes('type') || s.includes('enter')) {
      const fieldMatch = step.match(/(?:fill|type|enter)\s+['""]?([^'"]+)['""]?\s+(?:in|into|field)/i);
      const valMatch = step.match(/with\s+['""]?([^'"]+)['""]?/i);
      const field = fieldMatch ? fieldMatch[1] : 'input';
      const value = valMatch ? valMatch[1] : 'test value';
      lines.push(`  await page.getByLabel(${JSON.stringify(field)}, { exact: false }).fill(${JSON.stringify(value)});`);
    } else if (s.includes('submit') || s.includes('press enter')) {
      lines.push(`  await page.keyboard.press('Enter');`);
    } else if (s.includes('expect') || s.includes('verify') || s.includes('should see') || s.includes('assert')) {
      const textMatch = step.match(/(?:see|contain|show|display)\s+['""]?([^'"]+)['""]?/i);
      const text = textMatch ? textMatch[1] : 'expected content';
      lines.push(`  await expect(page.getByText(${JSON.stringify(text)}, { exact: false })).toBeVisible();`);
    } else if (s.includes('wait')) {
      lines.push(`  await page.waitForLoadState('networkidle');`);
    } else {
      // Emit as a comment — step text is not executable
      lines.push(`  // TODO: ${step.replace(/\*\//g, '* /')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Generate a Playwright test file content from a scenario.
 *
 * @param {object} scenario
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function buildTestFile(scenario, baseUrl) {
  const code = stepsToPlaywrightCode(scenario.steps ?? [], baseUrl);
  return `import { test, expect } from '@playwright/test';

test(${JSON.stringify(scenario.scenarioName)}, async ({ page }) => {
${code}
});
`;
}

/**
 * Run a single test file with Playwright CLI.
 *
 * @param {string} testFilePath  - absolute path to the test file
 * @param {object} options
 * @param {number} [options.timeout=30000]
 * @returns {Promise<{passed: boolean, duration: number, errorMessage: string|null, output: string}>}
 */
function runPlaywrightFile(testFilePath, options = {}) {
  const timeout = options.timeout ?? 30_000;

  return new Promise((resolve) => {
    const start = Date.now();
    let output = '';

    const proc = spawn('npx', ['playwright', 'test', testFilePath, '--reporter=line'], {
      timeout,
      shell: false,
    });

    const MAX_OUTPUT = 2000;
    proc.stdout.on('data', (d) => {
      output += d.toString();
      if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT);
    });
    proc.stderr.on('data', (d) => {
      output += d.toString();
      if (output.length > MAX_OUTPUT) output = output.slice(-MAX_OUTPUT);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - start;
      const passed = code === 0;
      const errorMessage = passed ? null : (output.slice(-1000) || 'Test failed');
      resolve({ passed, duration, errorMessage, output });
    });

    proc.on('error', (err) => {
      resolve({
        passed: false,
        duration: Date.now() - start,
        errorMessage: err.message,
        output,
      });
    });
  });
}

/**
 * Run a scenario as a Playwright test.
 *
 * @param {object} scenario        - scenario row from DB
 * @param {object} config          - app config
 * @returns {Promise<{
 *   scenarioId: number,
 *   status: 'passed'|'failed'|'error',
 *   durationMs: number,
 *   screenshotUrl: string|null,
 *   errorDetails: object|null
 * }>}
 */
export async function runScenario(scenario, config) {
  const outputDir = resolve(config.artifacts?.outputDir ?? '__testpilot__');
  mkdirSync(outputDir, { recursive: true });

  const safeName = scenario.scenarioName
    .replace(/[^a-z0-9]/gi, '_')
    .slice(0, 60)
    .toLowerCase();
  const testFile = join(outputDir, `${safeName}_${scenario.id}.spec.js`);
  const screenshotsDir = resolve(config.executor?.screenshotsDir ?? '.testpilot/screenshots');
  const baseUrl = config.executor?.baseUrl;

  // Verify testFile is inside outputDir (prevent path traversal)
  if (!testFile.startsWith(outputDir + '/') && !testFile.startsWith(outputDir + '\\')) {
    throw new Error(`Test file path escapes output directory: ${testFile}`);
  }

  writeFileSync(testFile, buildTestFile(scenario, baseUrl), 'utf-8');

  let result;
  try {
    result = await runPlaywrightFile(testFile, { timeout: config.executor?.timeout });
  } catch (err) {
    result = { passed: false, duration: 0, errorMessage: err.message, output: '' };
  }

  // Clean up temp file unless persist mode is on
  if (!config.artifacts?.persist && existsSync(testFile)) {
    try { unlinkSync(testFile); } catch { /* ignore */ }
  }

  // Look for screenshot generated by Playwright (on failure it auto-captures)
  mkdirSync(screenshotsDir, { recursive: true });
  const screenshotPath = join(screenshotsDir, `${safeName}_${scenario.id}.png`);
  const screenshotUrl = existsSync(screenshotPath) ? screenshotPath : null;

  return {
    scenarioId: scenario.id,
    status: result.passed ? 'passed' : 'failed',
    durationMs: result.duration,
    screenshotUrl,
    errorDetails: result.errorMessage
      ? { message: result.errorMessage, output: result.output?.slice(-500) }
      : null,
  };
}
