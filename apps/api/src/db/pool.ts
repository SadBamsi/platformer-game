import { Pool, type PoolConfig } from 'pg';

/**
 * Единственный `pg.Pool` процесса. Импортируйте `pool` там, где нужно
 * выполнить запрос; никогда не создавайте второй Pool — размер пула,
 * таймауты и graceful shutdown имеют смысл только если он ровно один на
 * процесс.
 *
 * Настройки берутся из переменных окружения (см. список в
 * `getPoolConfig`). Все переменные, кроме DATABASE_URL, опциональны и
 * имеют консервативные дефолты для локальной разработки.
 */
export const pool = new Pool(getPoolConfig());

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  // Ноль отвергается намеренно, а не по недосмотру: для DB_POOL_MAX он даёт
  // пул, не выдающий ни одного клиента (каждый запрос висит до
  // connectionTimeoutMillis), а для таймаутов в PostgreSQL 0 означает
  // «таймаута нет» — то есть тихо отключает ту самую защиту от зависшего
  // запроса, ради которой эти переменные и заведены. Лучше упасть на старте
  // с понятным сообщением, чем молча получить неработоспособную конфигурацию.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Переменная окружения ${name} должна быть целым числом больше нуля, получено: "${raw}"`,
    );
  }
  return parsed;
}

/**
 * Собирает конфигурацию подключения/пула из переменных окружения.
 *
 * Экспортируется отдельно от синглтона `pool`, чтобы разовые скрипты
 * (раннер миграций, seed) могли открыть свой короткоживущий `Client` с той
 * же идентичностью подключения, но не наследуя жизненный цикл и
 * shutdown-хуки прикладного пула.
 *
 * Переменные окружения:
 *   DATABASE_URL                        — обязательна. Строка подключения
 *                                          postgres://user:password@host:5432/db
 *   DB_POOL_MAX                         — максимум клиентов в пуле (по
 *                                          умолчанию 10 — дефолт самого pg)
 *   DB_IDLE_TIMEOUT_MS                  — простаивающий клиент закрывается
 *                                          через столько мс (по умолчанию
 *                                          30000)
 *   DB_CONNECTION_TIMEOUT_MS            — таймаут установления соединения
 *                                          (по умолчанию 5000)
 *   DB_STATEMENT_TIMEOUT_MS             — таймаут выполнения одного
 *                                          statement на стороне Postgres
 *                                          (по умолчанию 5000). Защита от
 *                                          зависшего запроса, который иначе
 *                                          вечно держит слот пула.
 *   DB_IDLE_IN_TRANSACTION_TIMEOUT_MS   — таймаут для клиента, зависшего
 *                                          "idle in transaction" (по
 *                                          умолчанию 5000). Защита от
 *                                          клиента, открывшего транзакцию и
 *                                          не закрывшего её (баг в коде,
 *                                          упавший процесс на середине
 *                                          транзакции) — без этого такая
 *                                          транзакция может держать locks
 *                                          и слот пула бесконечно.
 *
 * Значения таймаутов пришли из pg.Client — statement_timeout и
 * idle_in_transaction_session_timeout это стандартные параметры сессии
 * Postgres, pg.Client их прокидывает при подключении (подтверждено через
 * Context7, /brianc/node-postgres, apis/client.mdx).
 */
export function getPoolConfig(): PoolConfig {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL не задана. Ожидается строка подключения вида ' +
        'postgres://user:password@localhost:5432/agentic_game',
    );
  }

  return {
    connectionString,
    max: readIntEnv('DB_POOL_MAX', 10),
    idleTimeoutMillis: readIntEnv('DB_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: readIntEnv('DB_CONNECTION_TIMEOUT_MS', 5_000),
    statement_timeout: readIntEnv('DB_STATEMENT_TIMEOUT_MS', 5_000),
    idle_in_transaction_session_timeout: readIntEnv(
      'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
      5_000,
    ),
  };
}

// Простаивающий в пуле клиент всё ещё подключён к живому backend'у и может
// получить ошибку (рестарт Postgres, сетевой разрыв). Без обработчика pool
// эмитит 'error' как некэпчнутое исключение и роняет процесс — см.
// Context7 /brianc/node-postgres, apis/pool.mdx, events > error.
pool.on('error', (err: Error) => {
  // eslint-disable-next-line no-console -- в db-слое нет своего логгера
  console.error('[db] неожиданная ошибка на простаивающем клиенте pg', err);
});

let closed = false;

/**
 * Корректно закрывает пул: дожидается завершения выполняющихся запросов и
 * возвращённых в пул клиентов, затем разрывает все соединения и глушит
 * внутренние таймеры pool.end(). Идемпотентна — повторный вызов не
 * пытается закрыть пул второй раз.
 *
 * Вызывается автоматически по SIGTERM/SIGINT (см. ниже), но также
 * экспортируется явно: если у процесса есть собственная оркестровка
 * graceful shutdown (например, сначала закрыть HTTP-сервер и перестать
 * принимать новые запросы, и только потом закрыть БД), вызывающий код
 * должен звать `closePool()` сам в нужном месте последовательности —
 * автоматический обработчик здесь не знает о других частях приложения и
 * не должен быть единственным местом принятия решения о порядке остановки.
 */
export async function closePool(): Promise<void> {
  if (closed) {
    return;
  }
  closed = true;
  await pool.end();
}

// СОЗНАТЕЛЬНО без собственных обработчиков SIGTERM/SIGINT.
//
// Раньше этот модуль вешал их сам и вызывал closePool() немедленно. Это
// ломало порядок остановки, документированный во входной точке: Node
// вызывает всех листенеров сигнала, обработчик отсюда срабатывал первым,
// выставлял `closed = true` и запускал pool.end() ДО того, как HTTP-сервер
// раздренирует in-flight запросы. Запрос, уже принятый и прошедший
// валидацию, но ещё не дошедший до первого обращения к БД, получал от pg
// «Cannot use a pool after calling end on the pool» и отвечал 500 вместо
// штатного результата — при том что graceful shutdown задумывался ровно
// ради того, чтобы такие запросы доигрывались до конца.
//
// Порядок остановки принадлежит владельцу жизненного цикла процесса
// (src/index.ts): сначала app.close(), затем closePool(). db-слой не знает
// про HTTP-сервер и не должен принимать это решение за него.
//
// Если этот модуль когда-нибудь будет использоваться процессом без своей
// оркестровки shutdown, такой процесс обязан сам вызвать closePool() —
// функция экспортирована и идемпотентна.
