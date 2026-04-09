import test from 'node:test';
import assert from 'node:assert/strict';
import { runChimeraMvp } from '../src/services/orchestrator.service.js';

test('runChimeraMvp executes all phases and returns Project Chimera metadata', async () => {
  const result = await runChimeraMvp({
    repoSnapshot: {
      files: ['src/components/Login.jsx'],
      dependencies: ['react']
    },
    changeMeta: {
      title: 'feat: login flow'
    }
  });

  assert.equal(result.status, 'success');
  assert.equal(result.project, 'Project Chimera');
  assert.equal(typeof result.phases.sense, 'object');
  assert.equal(typeof result.phases.learn, 'object');
});
