import { getConfig } from '../../config/index.js';
import { SqliteRepository } from './sqlite.js';
import { PostgresRepository } from './postgres.js';

/** @type {import('./repository.js').Repository | null} */
let _repo = null;

/**
 * Return the singleton repository instance, creating it on first call.
 * @returns {Promise<import('./repository.js').Repository>}
 */
export async function getRepository() {
  if (_repo) return _repo;

  const { db } = getConfig();

  switch (db.provider) {
    case 'sqlite': {
      _repo = new SqliteRepository(db.sqlitePath);
      break;
    }
    case 'postgres': {
      if (!db.postgresUrl) {
        throw new Error(
          'TESTPILOT_POSTGRES_URL env var required when db.provider = "postgres"',
        );
      }
      _repo = new PostgresRepository(db.postgresUrl);
      break;
    }
    default:
      throw new Error(`Unknown db provider: "${db.provider}"`);
  }

  await _repo.initialize();
  return _repo;
}

/**
 * Shut down the repository (for graceful shutdown).
 */
export async function closeRepository() {
  if (_repo) {
    await _repo.close();
    _repo = null;
  }
}
