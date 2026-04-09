export const testerAgent = {
  async decide(sensedState) {
    const { detectedFeatures } = sensedState;

    return {
      generatedScenarios: detectedFeatures.length === 0 ? 0 : detectedFeatures.length * 4,
      strategy: {
        includeHappyPath: true,
        includeEdgeCases: true,
        includeNegative: true,
        includeRegression: true
      },
      selectedScenarioIds: []
    };
  },

  async act(decisions) {
    return {
      executedScenarioCount: decisions.selectedScenarioIds.length,
      summary: {
        status: 'completed',
        pass: 0,
        fail: 0,
        flakyCandidates: 0,
        durationMs: 0
      },
      artifacts: []
    };
  }
};
