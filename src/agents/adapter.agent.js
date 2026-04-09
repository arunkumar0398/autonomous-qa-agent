export const adapterAgent = {
  async sense(input) {
    return {
      trigger: input.trigger ?? { source: 'manual' },
      detectedFeatures: [],
      worldModelDelta: {
        pagesChanged: 0,
        endpointsChanged: 0,
        flowsChanged: 0
      },
      bugFixCandidates: []
    };
  },

  async learn({ execution }) {
    return {
      runStatus: execution.summary.status,
      flakyCandidates: execution.summary.flakyCandidates,
      retiredTests: 0,
      replayQueueSize: 0,
      notes: 'Learning loop placeholder. Persist to PostgreSQL in next slice.'
    };
  }
};
