/**
 * Валидация переменных окружения процесса API.
 *
 * Вызывается из src/index.ts ДО построения Fastify-приложения — если
 * чего-то не хватает или значение некорректно, процесс должен упасть сразу
 * при старте с понятным сообщением, называющим конкретную переменную, а не
 * сломаться загадочно на первом запросе (например, GET /health, который
 * первым тронет CORS-allowlist) или где-то в середине обработки.
 *
 * Переменные пула соединений с БД (DB_POOL_MAX, DB_IDLE_TIMEOUT_MS,
 * DB_CONNECTION_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS,
 * DB_IDLE_IN_TRANSACTION_TIMEOUT_MS) читает и валидирует самостоятельно
 * ../db/pool.ts (см. getPoolConfig) — здесь они намеренно не дублируются.
 *
 * DATABASE_URL проверяется и там (getPoolConfig бросает при её отсутствии),
 * и здесь: с точки зрения всего процесса отсутствие DATABASE_URL — это
 * ошибка конфигурации, которая должна называться по имени в одном месте
 * старта (loadEnv, вызванный в самом начале main()), а не всплывать позже
 * с отдельным сообщением из db/pool.ts в момент первого импорта слоя данных.
 */

export type NodeEnv = 'development' | 'test' | 'production';

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

export interface AppEnv {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  /** Allowlist origin'ов для CORS, разобранный из GAME_ORIGIN (через запятую, без пробелов внутри значения). */
  gameOrigins: string[];
  /** Присутствие и непустота проверены здесь; формат строки подключения парсит pg в db/pool.ts. */
  databaseUrl: string;
}

/** Ошибка конфигурации окружения. Всегда называет переменную и причину — никаких загадочных падений. */
export class EnvValidationError extends Error {
  constructor(varName: string, reason: string) {
    super(`Некорректная переменная окружения ${varName}: ${reason}`);
    this.name = 'EnvValidationError';
  }
}

function requireString(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new EnvValidationError(name, 'обязательна, но не задана');
  }
  return raw;
}

function readIntEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const trimmed = raw.trim();
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== trimmed) {
    throw new EnvValidationError(name, `должна быть целым числом, получено "${raw}"`);
  }
  if (parsed < bounds.min || parsed > bounds.max) {
    throw new EnvValidationError(
      name,
      `должна быть в диапазоне [${bounds.min}, ${bounds.max}], получено ${parsed}`,
    );
  }
  return parsed;
}

function readNodeEnv(): NodeEnv {
  const raw = process.env['NODE_ENV'];
  if (raw === undefined || raw.trim() === '') {
    return 'development';
  }
  if (!NODE_ENVS.includes(raw as NodeEnv)) {
    throw new EnvValidationError(
      'NODE_ENV',
      `должна быть одной из [${NODE_ENVS.join(', ')}], получено "${raw}"`,
    );
  }
  return raw as NodeEnv;
}

function parseOrigin(name: string, candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new EnvValidationError(
      name,
      `значение "${candidate}" не является корректным http(s) origin, например "http://localhost:3000"`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EnvValidationError(
      name,
      `значение "${candidate}" должно использовать протокол http или https`,
    );
  }
  return candidate;
}

function readGameOrigins(): string[] {
  const raw = requireString('GAME_ORIGIN');
  const origins = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (origins.length === 0) {
    throw new EnvValidationError('GAME_ORIGIN', 'обязательна, но не задана');
  }

  return origins.map((origin) => parseOrigin('GAME_ORIGIN', origin));
}

let cached: AppEnv | undefined;

/**
 * Читает и валидирует все переменные окружения процесса. Результат
 * кэшируется после первого успешного вызова (env не меняется на лету).
 * Бросает EnvValidationError с понятным сообщением при первой же
 * некорректной переменной — fail-fast.
 */
export function loadEnv(): AppEnv {
  if (cached) {
    return cached;
  }

  const nodeEnv = readNodeEnv();
  const port = readIntEnv('PORT', 4000, { min: 1, max: 65_535 });
  const host = process.env['HOST']?.trim() || '0.0.0.0';
  const gameOrigins = readGameOrigins();
  const databaseUrl = requireString('DATABASE_URL');

  cached = { nodeEnv, port, host, gameOrigins, databaseUrl };
  return cached;
}
