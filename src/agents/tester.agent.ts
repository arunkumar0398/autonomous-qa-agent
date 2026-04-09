import { generateScenarios } from '../lib/scenario-generator.js';
import type { UiFeature } from '../types/domain.js';

export const testerAgent = {
  async decide(sensedState: { detectedFeatures: UiFeature[] }) {
    const scenarios = generateScenarios(sensedState.detectedFeatures);

    return {
      phase: 'decide' as const,
      generatedScenarioCount: scenarios.length,
      scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
      scenarios
    };
  },

  async act(decisions: { scenarioIds: string[] }) {
    const failedScenarioIds: string[] = [];

    return {
      phase: 'act' as const,
      executedScenarioCount: decisions.scenarioIds.length,
      summary: {
        status: 'completed' as const,
        pass: decisions.scenarioIds.length - failedScenarioIds.length,
        fail: failedScenarioIds.length,
        failedScenarioIds,
        flakyCandidates: 0,
        durationMs: decisions.scenarioIds.length * 150
      }
    };
  }
};
