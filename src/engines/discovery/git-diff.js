import { resolve } from 'node:path';
import simpleGit from 'simple-git';

/** File extensions considered testable. */
const TESTABLE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.ts', '.tsx',
  '.jsx',
  '.vue', '.svelte',
  '.py', '.rb', '.go', '.java', '.php',
]);

/** Path keywords that suggest higher test priority. */
const HIGH_PRIORITY_KEYWORDS = [
  'auth', 'login', 'signup', 'register', 'payment', 'checkout',
  'order', 'cart', 'admin', 'api', 'route', 'controller', 'handler',
];

/**
 * Heuristically extract changed function/component names from a diff string.
 * @param {string} diff
 * @returns {string[]}
 */
function extractChangedSymbols(diff) {
  const symbols = new Set();
  // Match function declarations: function foo(, async function foo(, foo = function(
  for (const m of diff.matchAll(/\+.*?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\())/g)) {
    const name = m[1] || m[2];
    if (name && name.length > 2) symbols.add(name);
  }
  // Match class method definitions: methodName(
  for (const m of diff.matchAll(/\+\s{2,}(?:async\s+)?(\w+)\s*\(/g)) {
    if (m[1] && m[1].length > 2 && !['if', 'for', 'while', 'switch', 'catch'].includes(m[1])) {
      symbols.add(m[1]);
    }
  }
  return [...symbols].slice(0, 8); // cap at 8 per file
}

/**
 * Determine priority based on file path heuristics.
 * @param {string} filePath
 * @returns {'high'|'medium'|'low'}
 */
function inferPriority(filePath) {
  const lower = filePath.toLowerCase();
  if (HIGH_PRIORITY_KEYWORDS.some((kw) => lower.includes(kw))) return 'high';
  if (lower.includes('test') || lower.includes('spec') || lower.includes('mock')) return 'low';
  return 'medium';
}

/**
 * Analyze git diff and return discovered testable features.
 *
 * @param {object} options
 * @param {string} [options.repoPath=process.cwd()]
 * @param {string} [options.since='HEAD~1']
 * @returns {Promise<Array<{
 *   id: string,
 *   filePath: string,
 *   changeType: 'added'|'modified'|'deleted',
 *   description: string,
 *   priority: 'high'|'medium'|'low',
 *   diff: string
 * }>>}
 */
export async function analyzeGitDiff(options = {}) {
  const repoPath = resolve(options.repoPath ?? process.cwd());
  const since = options.since ?? 'HEAD~1';

  const git = simpleGit(repoPath);

  // Verify this is a git repo with commits
  const log = await git.log({ maxCount: 1 }).catch(() => null);
  if (!log || log.total === 0) {
    return [];
  }

  // Get the short hash for the HEAD commit (used in feature IDs)
  const headHash = (await git.revparse(['--short', 'HEAD'])).trim();

  // Get list of changed files
  let diffSummary;
  try {
    diffSummary = await git.diffSummary([since, 'HEAD']);
  } catch {
    // If 'since' ref doesn't exist (e.g. only 1 commit), diff against empty tree
    diffSummary = await git.diffSummary(['--cached']).catch(() => ({ files: [] }));
  }

  const features = [];

  for (const file of diffSummary.files) {
    const filePath = file.file;
    const ext = filePath.slice(filePath.lastIndexOf('.'));

    if (!TESTABLE_EXTENSIONS.has(ext)) continue;
    if (file.binary) continue;

    // Determine change type
    let changeType = 'modified';
    if (file.insertions > 0 && file.deletions === 0) changeType = 'added';
    else if (file.insertions === 0 && file.deletions > 0) changeType = 'deleted';

    // Skip deleted files — nothing to test
    if (changeType === 'deleted') continue;

    // Get the actual diff for this file
    let diff = '';
    try {
      diff = await git.diff([since, 'HEAD', '--', filePath]);
    } catch {
      diff = '';
    }

    const symbols = extractChangedSymbols(diff);
    const symbolStr = symbols.length > 0 ? symbols.join(', ') : 'changes';
    const description = `${changeType === 'added' ? 'Added' : 'Modified'}: ${symbolStr} in ${filePath}`;

    features.push({
      id: `${headHash}:${filePath}`,
      filePath,
      changeType,
      description,
      priority: inferPriority(filePath),
      diff: diff.slice(0, 4000), // cap diff size sent to LLM
    });
  }

  // Sort by priority: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  features.sort((a, b) => order[a.priority] - order[b.priority]);

  return features;
}
