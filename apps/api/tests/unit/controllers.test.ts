/**
 * Юнит-тесты контроллеров scores/leaderboard, полностью БЕЗ БД: модуль
 * db/queries/scores.queries.js подменяется целиком через vi.mock ДО того,
 * как buildApp() (и транзитивно controllers/*) его импортируют — поэтому
 * db/pool.ts (который создаёт `new Pool(...)` на этапе импорта и которому
 * нужна DATABASE_URL) в этом файле вообще не загружается.
 *
 * Проверяем логику, которая принадлежит именно контроллеру, а не схеме:
 *  - обрезку пробелов у playerName перед записью (createScoreHandler);
 *  - подстановку LEADERBOARD_DEFAULT_LIMIT, когда limit не передан;
 *  - форму и статус-код успешного ответа;
 *  - что ошибка слоя данных долетает до общего error-handler как 500
 *    INTERNAL_ERROR, а не проглатывается/переформатируется контроллером
 *    (см. комментарий в scores.controller.ts о том, что это намеренно).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { ApiErrorResponse, LeaderboardEntry, ScoreRecord } from '@agentic-game/types';

vi.mock('../../src/db/queries/scores.queries.js', () => ({
  insertScore: vi.fn(),
  getLeaderboard: vi.fn(),
}));

const { insertScore, getLeaderboard } = await import('../../src/db/queries/scores.queries.js');
const { buildApp } = await import('../../src/app.js');
const insertScoreMock = vi.mocked(insertScore);
const getLeaderboardMock = vi.mocked(getLeaderboard);

const testEnv = {
  nodeEnv: 'test' as const,
  port: 0,
  host: '127.0.0.1',
  gameOrigins: ['http://localhost:3000'],
  databaseUrl: 'unused-because-db-queries-is-mocked',
};

describe('createScoreHandler (POST /api/scores) — с замоканным слоем данных', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterEach(() => {
    insertScoreMock.mockReset();
  });

  const fixtureRecord: ScoreRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    playerName: 'Ada',
    score: 100,
    levelId: 'level-1',
    durationMs: null,
    stageReached: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('обрезает пробелы у playerName перед вызовом insertScore', async () => {
    insertScoreMock.mockResolvedValueOnce(fixtureRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: '  Ada  ', score: 100, levelId: 'level-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(insertScoreMock).toHaveBeenCalledTimes(1);
    expect(insertScoreMock).toHaveBeenCalledWith({
      playerName: 'Ada',
      score: 100,
      levelId: 'level-1',
      durationMs: undefined,
    });
  });

  it('прокидывает durationMs, когда он передан', async () => {
    insertScoreMock.mockResolvedValueOnce({ ...fixtureRecord, durationMs: 4200 });

    await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'Ada', score: 100, levelId: 'level-1', durationMs: 4200 },
    });

    expect(insertScoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 4200 }),
    );
  });

  it('возвращает 201 и тело, ровно совпадающее с тем, что вернул insertScore', async () => {
    insertScoreMock.mockResolvedValueOnce(fixtureRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'Ada', score: 100, levelId: 'level-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual(fixtureRecord);
  });

  it('ошибка слоя данных не перехватывается контроллером — долетает до error-handler как 500 INTERNAL_ERROR', async () => {
    insertScoreMock.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { playerName: 'Ada', score: 100, levelId: 'level-1' },
    });

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
    // Деталь реализации (текст ошибки pg) не должна утечь клиенту.
    expect(JSON.stringify(parsed)).not.toContain('connection terminated');
  });
});

describe('getLeaderboardHandler (GET /api/leaderboard) — с замоканным слоем данных', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterEach(() => {
    getLeaderboardMock.mockReset();
  });

  const fixtureEntries: LeaderboardEntry[] = [
    {
      rank: 1,
      playerName: 'Ada',
      score: 500,
      durationMs: 12000,
      stageReached: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('подставляет LEADERBOARD_DEFAULT_LIMIT (10), если limit не передан', async () => {
    getLeaderboardMock.mockResolvedValueOnce(fixtureEntries);

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(getLeaderboardMock).toHaveBeenCalledWith({ levelId: 'level-1', limit: 10 });
    expect(JSON.parse(response.body)).toEqual({ levelId: 'level-1', limit: 10, entries: fixtureEntries });
  });

  it('использует переданный limit, а не дефолт', async () => {
    getLeaderboardMock.mockResolvedValueOnce(fixtureEntries);

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1', limit: '25' },
    });

    expect(getLeaderboardMock).toHaveBeenCalledWith({ levelId: 'level-1', limit: 25 });
    expect(JSON.parse(response.body)).toMatchObject({ limit: 25 });
  });

  it('response.limit — это ПРИМЕНЁННЫЙ limit (после дефолта), а не то, что прислал клиент', async () => {
    getLeaderboardMock.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1' }, // клиент limit не прислал
    });

    const body = JSON.parse(response.body) as { limit: number };
    expect(body.limit).toBe(10);
  });

  it('ошибка слоя данных долетает как 500 INTERNAL_ERROR', async () => {
    getLeaderboardMock.mockRejectedValueOnce(new Error('pool exhausted'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1' },
    });

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('INTERNAL_ERROR');
  });
});
