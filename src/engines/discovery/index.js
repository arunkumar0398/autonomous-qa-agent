import { analyzeGitDiff } from './git-diff.js';
import { discoverFromJira } from './jira.js';
import { discoverFromOpenApi } from './openapi.js';

/**
 * Run all active discovery strategies in parallel and merge results.
 *
 * Active strategies:
 *   1. Git diff     — always runs (returns [] when no commits)
 *   2. Jira         — runs when TESTPILOT_JIRA_* env vars are set
 *   3. OpenAPI spec — runs when TESTPILOT_OPENAPI_SPEC env var is set
 *
 * @param {object} options
 * @param {string}  [options.repoPath]      - path to git repo (defaults to cwd)
 * @param {string}  [options.since]         - git ref to diff against (defaults to HEAD~1)
 * @param {number}  [options.maxFeatures]   - cap on features returned (defaults to 20)
 * @param {string}  [options.jiraBaseUrl]   - override TESTPILOT_JIRA_BASE_URL
 * @param {string}  [options.jiraEmail]     - override TESTPILOT_JIRA_EMAIL
 * @param {string}  [options.jiraApiToken]  - override TESTPILOT_JIRA_API_TOKEN
 * @param {string}  [options.jiraProject]   - override TESTPILOT_JIRA_PROJECT
 * @param {string}  [options.jiraJql]       - override JQL query
 * @param {string}  [options.openapiSpec]   - override TESTPILOT_OPENAPI_SPEC
 * @param {string}  [options.openapiBase]   - override TESTPILOT_OPENAPI_BASE_SPEC
 * @returns {Promise<Array<{
 *   id: string,
 *   filePath: string,
 *   changeType: string,
 *   description: string,
 *   priority: 'high'|'medium'|'low',
 *   diff: string,
 *   source?: string
 * }>>}
 */
export async function discover(options = {}) {
  const maxFeatures = options.maxFeatures ?? 20;

  // Run all adapters in parallel — each handles its own errors internally
  const [gitFeatures, jiraFeatures, openapiFeatures] = await Promise.all([
    analyzeGitDiff({
      repoPath: options.repoPath,
      since:    options.since,
    }),
    discoverFromJira({
      baseUrl:    options.jiraBaseUrl,
      email:      options.jiraEmail,
      apiToken:   options.jiraApiToken,
      project:    options.jiraProject,
      jql:        options.jiraJql,
    }),
    discoverFromOpenApi({
      spec:     options.openapiSpec,
      baseSpec: options.openapiBase,
    }),
  ]);

  // Tag git features with source for consistency
  const taggedGit = gitFeatures.map((f) => ({ ...f, source: f.source ?? 'git' }));

  // Merge: git first (highest signal), then jira, then openapi
  const merged = [...taggedGit, ...jiraFeatures, ...openapiFeatures];

  // Deduplicate by id
  const seen = new Set();
  const deduped = merged.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  // Sort by priority: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  deduped.sort((a, b) => order[a.priority] - order[b.priority]);

  return deduped.slice(0, maxFeatures);
}
