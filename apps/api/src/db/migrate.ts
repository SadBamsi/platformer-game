import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

import { getPoolConfig } from './pool.js';

/**
 * Минимальный раннер миграций.
 *
 * - Читает *.sql из ./migrations, сортирует по имени файла по возрастанию
 *   (конвенция: `NNNN_описание.sql`, NNNN — 4-значный номер с ведущими
 *   нулями, чтобы лексикографическая сортировка совпадала с числовой).
 * - Уже применённые миграции отслеживает в служебной таблице
 *   `schema_migrations` (создаётся сама при первом запуске, если её нет —
 *   идемпотентно, безопасно на пустой и на уже мигрированной базе).
 * - Каждую ещё не применённую миграцию выполняет в отдельной транзакции:
 *   BEGIN; <содержимое файла>; INSERT INTO schema_migrations; COMMIT.
 *   Одна упавшая миграция откатывается и останавливает весь прогон —
 *   миграции после неё не запускаются (fail fast, чтобы не оставить базу в
 *   непредсказуемом промежуточном состоянии).
 * - Открывает собственный `pg.Client` (не переиспользует прикладной
 *   `pool` из pool.ts): у раннера другой жизненный цикл — одно короткое
 *   подключение на весь прогон, а не пул на весь процесс api — и он не
 *   должен наследовать shutdown-хуки прикладного пула (см. pool.ts).
 *
 * ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ: этот раннер оборачивает каждый файл в BEGIN/COMMIT,
 * поэтому им нельзя выполнить `CREATE INDEX CONCURRENTLY` — эта команда
 * не может выполняться внутри блока транзакции. Для 0001_init.sql это не
 * проблема (таблица создаётся пустой в той же транзакции), но если
 * когда-нибудь потребуется добавить индекс на уже наполненную в проде
 * таблицу без блокировки записи — такую миграцию через этот раннер
 * запускать нельзя, её нужно будет применить вручную вне транзакции.
 *
 * Запуск: `pnpm --filter @agentic-game/api migrate` (см. package.json).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

const ENSURE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text        PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  );
`;

interface AppliedMigrationRow {
  filename: string;
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function run(): Promise<void> {
  const client = new Client(getPoolConfig());
  await client.connect();

  try {
    await client.query(ENSURE_MIGRATIONS_TABLE);

    const appliedResult = await client.query<AppliedMigrationRow>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const files = listMigrationFiles();
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.info('[migrate] нет непримененных миграций.');
      return;
    }

    for (const file of pending) {
      const filePath = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(filePath, 'utf8');

      console.info(`[migrate] применяю ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
          file,
        ]);
        await client.query('COMMIT');
        console.info(`[migrate] применена ${file}`);
      } catch (err) {
        // ROLLBACK сам может упасть (соединение уже разорвано, рестарт
        // Postgres, idle_in_transaction_session_timeout). Если не поймать его
        // здесь, промис отвергнется ошибкой ROLLBACK, а исходная причина
        // падения миграции будет потеряна — диагностика укажет на сеть вместо
        // ошибочного SQL. Поэтому ошибку отката только логируем, а наружу
        // всегда отдаём исходную ошибку через cause.
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error(
            `[migrate] не удалось выполнить ROLLBACK после падения ${file}`,
            rollbackErr,
          );
        }
        throw new Error(`[migrate] миграция ${file} упала и откачена, прогон остановлен`, {
          cause: err,
        });
      }
    }

    console.info(`[migrate] применено миграций: ${pending.length}`);
  } finally {
    await client.end();
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
