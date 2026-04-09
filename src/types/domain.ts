export type FrameworkName = 'react' | 'vue' | 'angular';

export interface RepoSnapshot {
  files: string[];
  dependencies: string[];
}

export interface ChangeMeta {
  title?: string;
  branch?: string;
  labels?: string[];
}

export interface ChimeraRunPayload {
  repoSnapshot: RepoSnapshot;
  changeMeta?: ChangeMeta;
}

export interface FrameworkSignal {
  framework: FrameworkName;
  confidence: number;
  signals: {
    dependency: boolean;
    files: boolean;
  };
}

export interface UiFeature {
  featureId: string;
  source: string;
  category: string;
}

export interface ScenarioStep {
  action: string;
  target: string;
  expected: string;
}

export interface Scenario {
  scenarioId: string;
  featureId: string;
  type: 'happy_path' | 'negative' | 'edge_case' | 'regression';
  title: string;
  steps: ScenarioStep[];
  priority: 'high' | 'medium';
}
