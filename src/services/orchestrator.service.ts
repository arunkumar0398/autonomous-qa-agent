import { adapterAgent } from '../agents/adapter.agent.js';
import { testerAgent } from '../agents/tester.agent.js';
import type { ChimeraRunPayload } from '../types/domain.js';

function buildRunId(): string {
  return `chimera_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function runChimeraMvp(payload: ChimeraRunPayload, dependencies: Partial<{ adapterAgent: typeof adapterAgent; testerAgent: typeof testerAgent }> = {}) {
  const runId = buildRunId();
  const startedAt = new Date().toISOString();

  const adapter = dependencies.adapterAgent ?? adapterAgent;
  const tester = dependencies.testerAgent ?? testerAgent;

  const sensedState = await adapter.sense(payload);
  const decisionState = await tester.decide(sensedState);
  const executionState = await tester.act(decisionState);
  const learningState = await adapter.learn({
    sensedState,
    decisions: decisionState,
    execution: executionState
  });

  return {
    status: 'success' as const,
    project: 'Project Chimera',
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    phases: {
      sense: sensedState,
      decide: decisionState,
      act: executionState,
      learn: learningState
    }
  };
}
