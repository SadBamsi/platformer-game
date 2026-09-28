import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';
import { closePool } from './db/pool.js';

/**
 * Точка входа процесса: buildApp() + listen() + graceful shutdown.
 *
 * Порядок остановки при SIGTERM/SIGINT принципиален и обязан быть именно
 * таким:
 *   1. app.close() — перестаём принимать новые запросы и дожидаемся
 *      завершения уже начатых (in-flight).
 *   2. closePool() — только после этого закрываем pg pool.
 *
 * Если поменять порядок (сначала пул, потом сервер), in-flight запрос,
 * который в этот момент выполняет SELECT/INSERT, может получить ошибку от
 * уже закрытого соединения вместо того, чтобы корректно отработать до
 * конца.
 *
 * ../db/pool.ts НЕ вешает собственных обработчиков сигналов — это принципиально.
 * Раньше вешал, и тогда порядок выше не соблюдался: Node вызывает всех
 * листенеров одного сигнала, обработчик из pool.ts срабатывал первым и
 * запускал pool.end() немедленно, ещё до app.close(). Запрос, уже принятый
 * и прошедший валидацию, но не успевший обратиться к БД, получал
 * «Cannot use a pool after calling end on the pool» и отвечал 500 —
 * ровно тот отказ, который graceful shutdown должен предотвращать.
 * Теперь closePool() вызывается только отсюда, строго после app.close(),
 * поэтому единственный источник решения о порядке остановки — эта функция.
 */

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  let shuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, 'получен сигнал остановки, начинаю graceful shutdown');
    try {
      await app.close();
      app.log.info('HTTP-сервер остановлен, in-flight запросы завершены');
      await closePool();
      app.log.info('пул соединений с БД закрыт');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'ошибка при graceful shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await app.listen({ port: env.port, host: env.host });
  } catch (err) {
    app.log.error({ err }, 'не удалось запустить сервер');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- до этого момента логгер Fastify ещё не гарантированно существует
  console.error('[api] фатальная ошибка при старте', err);
  process.exit(1);
});
