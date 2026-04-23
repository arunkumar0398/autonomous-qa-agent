/**
 * Jira discovery adapter.
 *
 * Fetches issues from Jira Cloud REST API v3 and converts them to
 * the standard feature shape used by the discovery engine.
 *
 * Required env vars (all optional — adapter skips gracefully when absent):
 *   TESTPILOT_JIRA_BASE_URL   https://yourorg.atlassian.net
 *   TESTPILOT_JIRA_EMAIL      user@yourorg.com
 *   TESTPILOT_JIRA_API_TOKEN  Jira API token (not password)
 *   TESTPILOT_JIRA_PROJECT    Project key, e.g. "DEV"
 *
 * Optional env vars:
 *   TESTPILOT_JIRA_JQL        Override the default JQL query
 *   TESTPILOT_JIRA_MAX        Max issues to fetch (default 50)
 */

const JIRA_PRIORITY_MAP = {
  Highest: 'high',
  High:    'high',
  Medium:  'medium',
  Low:     'low',
  Lowest:  'low',
};

/**
 * Map a Jira priority label to our priority enum.
 * @param {string|undefined} jiraPriority
 * @returns {'high'|'medium'|'low'}
 */
function mapPriority(jiraPriority) {
  return JIRA_PRIORITY_MAP[jiraPriority] ?? 'medium';
}

/**
 * Extract plain text from Atlassian Document Format (ADF) or plain string.
 * ADF is the JSON format Jira Cloud uses for rich-text fields.
 * @param {object|string|null} content
 * @returns {string}
 */
function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;

  // ADF: { version: 1, type: 'doc', content: [...] }
  if (content.type === 'doc' && Array.isArray(content.content)) {
    return content.content
      .flatMap((block) => {
        if (block.type === 'paragraph' && Array.isArray(block.content)) {
          return block.content
            .filter((n) => n.type === 'text')
            .map((n) => n.text);
        }
        return [];
      })
      .join(' ')
      .trim();
  }

  return '';
}

/**
 * Build a feature-shaped description from a Jira issue.
 * @param {object} issue
 * @returns {string}
 */
function buildDescription(issue) {
  const { key, fields } = issue;
  const summary     = fields.summary ?? '';
  const issueType   = fields.issuetype?.name ?? 'Issue';
  const status      = fields.status?.name ?? '';
  const description = extractText(fields.description);

  const parts = [`${issueType}: ${summary}`, `Status: ${status}`];
  if (description) parts.push(`Description: ${description.slice(0, 500)}`);

  return parts.join('\n');
}

/**
 * Fetch issues from Jira using the Search API (JQL).
 *
 * @param {object} config
 * @param {string} config.baseUrl     - https://org.atlassian.net
 * @param {string} config.email
 * @param {string} config.apiToken
 * @param {string} config.project     - Jira project key
 * @param {string} [config.jql]       - custom JQL (overrides default)
 * @param {number} [config.maxResults] - defaults to 50
 * @returns {Promise<object[]>}       - raw Jira issue objects
 */
async function fetchIssues(config) {
  const jql = config.jql ??
    `project = "${config.project}" AND statusCategory != Done ORDER BY priority DESC, updated DESC`;

  const url = new URL('/rest/api/3/search', config.baseUrl);
  url.searchParams.set('jql', jql);
  url.searchParams.set('maxResults', String(config.maxResults ?? 50));
  url.searchParams.set('fields', 'summary,description,priority,status,issuetype,labels,updated');

  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.issues ?? [];
}

/**
 * Convert a Jira issue to the standard discovery feature shape.
 * @param {object} issue
 * @returns {object}
 */
function issueToFeature(issue) {
  const { key, fields } = issue;
  return {
    id:          `jira:${key}`,
    filePath:    `jira/${key}`,
    changeType:  'added',
    description: buildDescription(issue),
    priority:    mapPriority(fields.priority?.name),
    diff:        buildDescription(issue),  // used as LLM context
    source:      'jira',
    metadata: {
      issueKey:  key,
      issueType: fields.issuetype?.name,
      status:    fields.status?.name,
      labels:    fields.labels ?? [],
    },
  };
}

/**
 * Run Jira discovery. Returns empty array if config is absent.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl]
 * @param {string} [options.email]
 * @param {string} [options.apiToken]
 * @param {string} [options.project]
 * @param {string} [options.jql]
 * @param {number} [options.maxResults]
 * @returns {Promise<object[]>}
 */
export async function discoverFromJira(options = {}) {
  const config = {
    baseUrl:    options.baseUrl    ?? process.env.TESTPILOT_JIRA_BASE_URL,
    email:      options.email      ?? process.env.TESTPILOT_JIRA_EMAIL,
    apiToken:   options.apiToken   ?? process.env.TESTPILOT_JIRA_API_TOKEN,
    project:    options.project    ?? process.env.TESTPILOT_JIRA_PROJECT,
    jql:        options.jql        ?? process.env.TESTPILOT_JIRA_JQL,
    maxResults: options.maxResults ?? Number(process.env.TESTPILOT_JIRA_MAX ?? 50),
  };

  // Skip silently when Jira is not configured
  if (!config.baseUrl || !config.email || !config.apiToken || !config.project) {
    return [];
  }

  let issues;
  try {
    issues = await fetchIssues(config);
  } catch (err) {
    console.warn(`[discovery/jira] fetch failed: ${err.message}`);
    return [];
  }

  return issues.map(issueToFeature);
}
