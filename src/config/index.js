import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const defaults = {
  port: 3000,
  db: {
    provider: 'sqlite',           // 'sqlite' | 'postgres'
    sqlitePath: '.testpilot/data.db',
    postgresUrl: null,
  },
  llm: {
    provider: 'openai',           // 'openai' | 'anthropic' | 'ollama'
    model: 'gpt-4o-mini',
    apiKey: null,
    baseUrl: null,                // custom endpoint (e.g. Ollama)
    maxTokens: 4096,
    temperature: 0.2,
  },
  discovery: {
    repoPath: '.',
    baseBranch: 'main',
    depth: 50,                    // max commits to analyse
  },
  executor: {
    headless: true,
    timeout: 30_000,
    screenshotsDir: '.testpilot/screenshots',
  },
  artifacts: {
    persist: false,               // write tests to __testpilot__/
    outputDir: '__testpilot__',
  },
};

/**
 * Deep-merge two plain objects (source wins).
 */
function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Load config from environment variables.
 */
function loadEnv() {
  return {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    db: {
      provider: process.env.TESTPILOT_DB_PROVIDER,
      sqlitePath: process.env.TESTPILOT_SQLITE_PATH,
      postgresUrl: process.env.TESTPILOT_POSTGRES_URL,
    },
    llm: {
      provider: process.env.TESTPILOT_LLM_PROVIDER,
      model: process.env.TESTPILOT_LLM_MODEL,
      apiKey: process.env.TESTPILOT_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.TESTPILOT_LLM_BASE_URL,
    },
    discovery: {
      repoPath: process.env.TESTPILOT_REPO_PATH,
      baseBranch: process.env.TESTPILOT_BASE_BRANCH,
    },
    executor: {
      headless: process.env.TESTPILOT_HEADLESS !== 'false',
    },
    artifacts: {
      persist: process.env.TESTPILOT_PERSIST_TESTS === 'true',
      outputDir: process.env.TESTPILOT_OUTPUT_DIR,
    },
  };
}

/**
 * Attempt to load a testpilot.config.js file from the project root.
 */
function loadFileConfig() {
  const configPath = resolve(process.cwd(), 'testpilot.config.js');
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, 'utf-8');
    // Support simple JSON-style configs (JS configs handled via dynamic import in future)
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Singleton config — built once on first access. */
let _config = null;

/**
 * Return the resolved configuration (defaults ← file ← env).
 */
export function getConfig() {
  if (_config) return _config;
  const fileConf = loadFileConfig();
  const envConf = loadEnv();
  _config = deepMerge(deepMerge(defaults, fileConf), envConf);
  return _config;
}

/**
 * Reset cached config (useful for testing).
 */
export function resetConfig() {
  _config = null;
}
