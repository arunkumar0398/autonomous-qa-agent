import type { Scenario, UiFeature } from '../types/domain.js';

const SCENARIO_TYPES: Array<Scenario['type']> = ['happy_path', 'negative', 'edge_case', 'regression'];

function createScenario(feature: UiFeature, type: Scenario['type']): Scenario {
  return {
    scenarioId: `${feature.featureId}:${type}`,
    featureId: feature.featureId,
    type,
    title: `${feature.featureId} ${type.replace('_', ' ')}`,
    steps: [
      { action: 'navigate', target: feature.source, expected: 'page loads' },
      { action: 'interact', target: feature.category, expected: 'interaction succeeds' },
      { action: 'assert', target: 'ui-state', expected: 'expected behavior' }
    ],
    priority: type === 'happy_path' || type === 'regression' ? 'high' : 'medium'
  };
}

export function generateScenarios(features: UiFeature[] = []): Scenario[] {
  return features.flatMap((feature) => SCENARIO_TYPES.map((type) => createScenario(feature, type)));
}
