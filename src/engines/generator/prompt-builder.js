/**
 * Build LLM messages for Playwright test scenario generation.
 *
 * Returns an OpenAI-style messages array (compatible with both OpenAI and Anthropic adapters).
 */

const SYSTEM_PROMPT = `You are an expert Playwright test engineer. Your job is to generate end-to-end browser test scenarios based on code changes provided to you.

Rules:
- Generate 1–3 test scenarios per code change. Quality over quantity.
- Focus on user-facing behaviour: what a real user would do in a browser.
- Each scenario must be concrete and testable with Playwright.
- Steps should be plain-English instructions that can be translated directly to Playwright calls.
- Prioritize happy path first, then the most important edge case.
- Return ONLY a valid JSON array. No markdown fences, no explanation, no extra text.

JSON schema for each scenario:
{
  "scenarioName": "string — concise test name in sentence case",
  "description": "string — one sentence describing what this tests and why it matters",
  "priority": "high" | "medium" | "low",
  "type": "happy_path" | "edge_case" | "negative" | "regression",
  "steps": ["string — plain English step 1", "string — step 2", ...]
}`;

/**
 * Build the messages array for a single feature.
 *
 * @param {object} feature
 * @param {string} feature.filePath
 * @param {string} feature.changeType
 * @param {string} feature.description
 * @param {string} feature.priority
 * @param {string} feature.diff
 * @returns {Array<{role: string, content: string}>}
 */
export function buildPrompt(feature) {
  const userContent = `Generate Playwright test scenarios for the following code change:

File: ${feature.filePath}
Change type: ${feature.changeType}
Summary: ${feature.description}
Priority: ${feature.priority}

Code diff:
\`\`\`
${feature.diff || '(no diff available — file was newly added)'}
\`\`\`

Return a JSON array of test scenarios following the schema in your instructions.`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Parse LLM response text into an array of scenario objects.
 * Returns empty array on parse failure.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function parseScenarios(text) {
  // Strip markdown code fences if the LLM wrapped the JSON anyway
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to extract a JSON array from anywhere in the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
