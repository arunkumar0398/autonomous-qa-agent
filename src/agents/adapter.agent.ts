import { detectBugFixIntent, detectUiFeatures } from '../lib/feature-detector.js';
import { detectFrameworks } from '../lib/framework-detector.js';
import type { ChimeraRunPayload } from '../types/domain.js';

export const adapterAgent = {
  async sense(input: ChimeraRunPayload) {
    const frameworks = detectFrameworks(input.repoSnapshot);
    const features = detectUiFeatures(input.repoSnapshot);
    const bugFixIntent = detectBugFixIntent(input.changeMeta);

    return {
      targetAudience: 'freelancers_startups',
      frameworks,
      detectedFeatures: features,
      bugFixIntent,
      phase: 'sense' as const
    };
  },

  async learn({ execution, sensedState }: { execution: { summary: { flakyCandidates: number; failedScenarioIds: string[] } }; sensedState: { frameworks: Array<{ framework: string }> }; decisions?: unknown }) {
    return {
      phase: 'learn' as const,
      flakyCandidates: execution.summary.flakyCandidates,
      failedScenarios: execution.summary.failedScenarioIds,
      frameworkCoverage: sensedState.frameworks.map((item) => item.framework),
      recommendations: [
        'Promote stable scenarios to regression pack.',
        'Retire repeatedly flaky selectors when Playwright retries exceed threshold.'
      ]
    };
  }
};
