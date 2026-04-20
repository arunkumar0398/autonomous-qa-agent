import { analyzeGitDiff } from './git-diff.js';

/**
 * Run all active discovery strategies and return discovered features.
 *
 * Phase 1: git-diff only.
 * Phase 2 will add: live crawler, API spec parser.
 *
 * @param {object} options
 * @param {string} [options.repoPath]  - path to git repo (defaults to cwd)
 * @param {string} [options.since]     - git ref to diff against (defaults to HEAD~1)
 * @param {number} [options.maxFeatures] - cap on features returned (defaults to 20)
 * @returns {Promise<Array<{
 *   id: string,
 *   filePath: string,
 *   changeType: string,
 *   description: string,
 *   priority: 'high'|'medium'|'low',
 *   diff: string
 * }>>}
 */
export async function discover(options = {}) {
  const maxFeatures = options.maxFeatures ?? 20;

  const features = await analyzeGitDiff({
    repoPath: options.repoPath,
    since: options.since,
  });

  return features.slice(0, maxFeatures);
}
