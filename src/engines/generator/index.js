import { buildPrompt, parseScenarios } from './prompt-builder.js';

/**
 * Generate Playwright test scenarios for a list of discovered features.
 *
 * For each feature:
 * 1. Build an LLM prompt from the feature diff.
 * 2. Call the LLM adapter.
 * 3. Parse the JSON response into scenario objects.
 * 4. Persist each scenario to the database.
 *
 * Features that fail LLM generation are skipped (logged, not thrown).
 *
 * @param {object[]} features          - from discovery engine
 * @param {import('../../core/llm/adapter.js').LlmAdapter} llm
 * @param {import('../../core/db/repository.js').Repository} db
 * @returns {Promise<object[]>}        - all persisted scenario rows
 */
export async function generate(features, llm, db) {
  const allScenarios = [];

  for (const feature of features) {
    let rawText;
    try {
      const messages = buildPrompt(feature);
      rawText = await llm.chat(messages);
    } catch (err) {
      console.warn(`[generator] LLM call failed for ${feature.filePath}: ${err.message}`);
      continue;
    }

    const parsed = parseScenarios(rawText);
    if (parsed.length === 0) {
      console.warn(`[generator] No parseable scenarios from LLM for ${feature.filePath}`);
      continue;
    }

    for (const s of parsed) {
      try {
        const row = await db.createScenario({
          featureId: feature.id,
          scenarioName: s.scenarioName ?? 'Unnamed scenario',
          description: s.description ?? null,
          priority: s.priority ?? feature.priority,
          type: s.type ?? 'happy_path',
          steps: s.steps ?? [],
          tags: [feature.filePath],
        });
        allScenarios.push(row);
      } catch (err) {
        console.warn(`[generator] Failed to persist scenario: ${err.message}`);
      }
    }
  }

  return allScenarios;
}
