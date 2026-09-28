/**
 * Интеграционные тесты POST /api/scores + GET /api/leaderboard + GET /health
 * через buildApp() + app.inject() — БЕЗ моков БД, против РЕАЛЬНОГО Postgres.
 *
 * ТРЕБУЕТСЯ поднятая и мигрированная БД перед запуском:
 *   pnpm db:up       # поднимает сервис db из infra/docker-compose.yml
 *   pnpm db:migrate  # применяет apps/api/src/db/migrations
 * и переменная окружения DATABASE_URL, указывающая на неё — см.
 * tests/integration/README.md за точной командой, которой пользовался
 * qa-test-expert при написании этого файла (порт мог отличаться от 5432
 * из-за конфликта с локально запущенным Postgres на машине, где писались
 * тесты — см. README).
 *
 * Если DATABASE_URL не задана или БД недоступна на момент запуска — весь
 * describe помечается skip через describe.skipIf, а не выдаёт
 * фальсифицированные "зелёные" результаты по несуществующим прогонам.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client } from 'pg';

import type { ApiErrorResponse, ScoreRecord } from '@agentic-game/types';

import { buildApp } from '../../src/app.js';
import type { AppEnv } from '../../src/config/env.js';
import { closePool, getPoolConfig, pool } from '../../src/db/pool.js';

const databaseUrl = process.env['DATABASE_URL'];

// "Настоящая" ли это БД (не заглушка из tests/setup-env.ts) — проверяем
// реальной попыткой подключения, а не просто наличием переменной: значение
// могло прийти как раз от setup-env.ts (fallback для юнит-тестов), которое
// синтаксически валидно, но никуда реально не подключается.
async function probeRealDatabase(): Promise<boolean> {
  if (!databaseUrl) return false;
  const client = new Client(getPoolConfig());
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const dbAvailable = await probeRealDatabase();

const testEnv: AppEnv = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  gameOrigins: ['http://localhost:3000'],
  databaseUrl: databaseUrl ?? 'unused',
};

describe.skipIf(!dbAvailable)('POST /api/scores + GET /api/leaderboard — интеграционные (реальный Postgres)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterEach(async () => {
    await pool.query('TRUNCATE TABLE scores');
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it('happy path: POST создаёт запись, GET /api/leaderboard её возвращает с rank=1', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'Ada Lovelace', score: 9001, levelId: 'level-int-1', durationMs: 45000 },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body) as ScoreRecord;
    expect(created).toMatchObject({
      playerName: 'Ada Lovelace',
      score: 9001,
      levelId: 'level-int-1',
      durationMs: 45000,
    });
    expect(typeof created.id).toBe('string');
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(() => new Date(created.createdAt).toISOString()).not.toThrow();

    const leaderboardResponse = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-int-1' },
    });

    expect(leaderboardResponse.statusCode).toBe(200);
    const leaderboard = JSON.parse(leaderboardResponse.body) as {
      levelId: string;
      limit: number;
      entries: Array<{ rank: number; playerName: string; score: number }>;
    };
    expect(leaderboard.levelId).toBe('level-int-1');
    expect(leaderboard.limit).toBe(10);
    expect(leaderboard.entries).toHaveLength(1);
    expect(leaderboard.entries[0]).toMatchObject({ rank: 1, playerName: 'Ada Lovelace', score: 9001 });
  });

  it('durationMs не передан -> записывается как null, не как undefined/0', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'NoDuration', score: 10, levelId: 'level-int-1' },
    });
    const created = JSON.parse(response.body) as ScoreRecord;
    expect(created.durationMs).toBeNull();
  });

  it('playerName обрезается по краям при сохранении в БД (не только в памяти)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: '  Grace Hopper  ', score: 500, levelId: 'level-int-1' },
    });

    const leaderboardResponse = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-int-1' },
    });
    const leaderboard = JSON.parse(leaderboardResponse.body) as {
      entries: Array<{ playerName: string }>;
    };
    expect(leaderboard.entries[0]?.playerName).toBe('Grace Hopper');
  });

  it('сортировка: по score DESC, при равенстве score — по durationMs ASC NULLS LAST', async () => {
    const level = 'level-int-sort';
    const scores = [
      { playerName: 'Low', score: 100, durationMs: 1000 },
      { playerName: 'HighSlow', score: 500, durationMs: 9000 },
      { playerName: 'HighFast', score: 500, durationMs: 3000 },
      { playerName: 'HighNoDuration', score: 500 }, // durationMs не передан -> NULL, должен быть НИЖЕ HighSlow
    ];

    for (const payload of scores) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: { ...payload, levelId: level },
      });
      expect(response.statusCode).toBe(201);
    }

    const leaderboardResponse = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: level },
    });
    const leaderboard = JSON.parse(leaderboardResponse.body) as {
      entries: Array<{ rank: number; playerName: string }>;
    };

    expect(leaderboard.entries.map((e) => e.playerName)).toEqual([
      'HighFast', // score 500, duration 3000 — самый быстрый из равных по очкам
      'HighSlow', // score 500, duration 9000
      'HighNoDuration', // score 500, duration NULL — NULLS LAST, ниже всех с тем же score
      'Low', // score 100
    ]);
    expect(leaderboard.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it('leaderboard изолирован по levelId — записи другого уровня не попадают в выборку', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'OtherLevel', score: 99999, levelId: 'level-int-OTHER' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'ThisLevel', score: 1, levelId: 'level-int-1' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-int-1' },
    });
    const leaderboard = JSON.parse(response.body) as { entries: Array<{ playerName: string }> };
    expect(leaderboard.entries.map((e) => e.playerName)).toEqual(['ThisLevel']);
  });

  it('limit ограничивает количество возвращённых записей', async () => {
    const level = 'level-int-limit';
    for (let i = 0; i < 15; i += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/scores',
        payload: { playerName: `Player${i}`, score: i, levelId: level },
      });
      expect(response.statusCode).toBe(201);
    }

    const defaultResponse = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: level },
    });
    const defaultBody = JSON.parse(defaultResponse.body) as { entries: unknown[]; limit: number };
    expect(defaultBody.limit).toBe(10);
    expect(defaultBody.entries).toHaveLength(10);

    const customResponse = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: level, limit: '3' },
    });
    const customBody = JSON.parse(customResponse.body) as { entries: unknown[]; limit: number };
    expect(customBody.limit).toBe(3);
    expect(customBody.entries).toHaveLength(3);
  });

  it('уровень без единой записи возвращает пустой массив entries, не 404/500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-int-nobody-played-this' },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { entries: unknown[] };
    expect(body.entries).toEqual([]);
  });

  it('валидация по-прежнему отклоняет некорректный запрос ДАЖЕ при реальной БД (полный стек)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: '', score: 100, levelId: 'level-int-1' },
    });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /health отдаёт 200 status=ok database=up, когда БД реально доступна', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string; database: string };
    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
  });
});

if (!dbAvailable) {
  // eslint-disable-next-line no-console -- намеренно: видимый сигнал в выводе test-раннера,
  // почему весь describe выше пропущен, а не тихий skip без объяснения.
  console.warn(
    '[integration] Postgres недоступен (DATABASE_URL не задана или подключение не удалось) — ' +
      'интеграционные тесты API пропущены (describe.skipIf), см. tests/integration/README.md.',
  );
}
