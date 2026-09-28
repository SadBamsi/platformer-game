import { Client } from 'pg';

import { getPoolConfig } from './pool.js';

/**
 * Идемпотентные seed-данные для локальной разработки: несколько записей
 * лидерборда для "level-1", чтобы GET /api/leaderboard сразу отдавал
 * что-то осмысленное на свежей базе.
 *
 * Идемпотентность: id зафиксированы явно (а не gen_random_uuid()), и
 * вставка идёт через ON CONFLICT (id) DO NOTHING — повторный запуск не
 * создаёт дубликаты и не падает. Без явных id идемпотентность через
 * ON CONFLICT была бы невозможна, потому что при каждом запуске
 * генерировался бы новый случайный uuid и конфликтовать было бы не с чем.
 *
 * НЕ подключено к package.json (apps/api/package.json вне зоны владения
 * database-engineer в этом тикете) — запускать вручную:
 *   pnpm --filter @agentic-game/api exec tsx src/db/seed.ts
 *
 * Использует отдельный `pg.Client`, а не прикладной `pool` — по тем же
 * причинам, что и migrate.ts (короткоживущий разовый скрипт, не часть
 * жизненного цикла api-процесса).
 */

const SEED_ROWS: ReadonlyArray<{
  id: string;
  playerName: string;
  score: number;
  levelId: string;
  durationMs: number | null;
}> = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    playerName: 'Alice',
    score: 1200,
    levelId: 'level-1',
    durationMs: 45_000,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    playerName: 'Bob',
    score: 1200,
    levelId: 'level-1',
    durationMs: 52_000,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    playerName: 'Carol',
    score: 950,
    levelId: 'level-1',
    durationMs: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    playerName: 'Dave',
    score: 800,
    levelId: 'level-2',
    durationMs: 61_000,
  },
];

async function run(): Promise<void> {
  const client = new Client(getPoolConfig());
  await client.connect();

  try {
    for (const row of SEED_ROWS) {
      await client.query(
        `INSERT INTO scores (id, player_name, score, level_id, duration_ms)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.playerName, row.score, row.levelId, row.durationMs],
      );
    }
    console.info(`[seed] готово, строк в наборе: ${SEED_ROWS.length}`);
  } finally {
    await client.end();
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
