import { adapterAgent } from '../agents/adapter.agent.js';
import { testerAgent } from '../agents/tester.agent.js';

/**
 * Sense -> Decide -> Act -> Learn
 */
export async function runAutonomousCycle(input) {
  const startedAt = new Date();

  const sensedState = await adapterAgent.sense(input);
  const decisions = await testerAgent.decide(sensedState);
  const execution = await testerAgent.act(decisions);
  const learning = await adapterAgent.learn({
    sensedState,
    decisions,
    execution
  });

  return {
    status: 'success',
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    cycle: {
      sense: sensedState,
      decide: decisions,
      act: execution,
      learn: learning
    }
  };
}
