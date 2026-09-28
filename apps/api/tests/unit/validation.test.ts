/**
 * Тесты валидации контракта на уровне Fastify-схем (TypeBoxValidatorCompiler),
 * БЕЗ реальной БД.
 *
 * Как это достигается без Postgres: buildApp() импортирует контроллеры,
 * которые импортируют db/queries/scores.queries.ts, который импортирует
 * db/pool.ts — тот создаёт `new Pool(getPoolConfig())` на этапе импорта
 * модуля. pg.Pool НЕ подключается eagerly при конструировании — соединение
 * открывается лениво при первом query(). Поэтому для этого файла достаточно
 * ЛЮБОЙ синтаксически заполненной строки DATABASE_URL (реальная доступность
 * БД не нужна), ПОКА тест не долетает до реального query() — то есть пока
 * тестируются только пути, где Fastify отклоняет запрос ДО вызова
 * контроллера (400 по схеме) или контроллер вообще не строит query
 * (404 — маршрут не найден, не долетает до роутинга вообще).
 *
 * НАХОДКА (см. отчёт): `databaseUrl` в `testEnv` ниже передаётся в
 * buildApp(), но db/pool.ts на самом деле игнорирует его и читает
 * process.env.DATABASE_URL напрямую на этапе ПЕРВОГО импорта модуля во всём
 * тестовом процессе (см. tests/setup-env.ts, который и задаёт реальное
 * значение через process.env). Поле здесь оставлено для полноты типа AppEnv,
 * но фактическая строка подключения — это НЕ значение из testEnv, а то, что
 * лежит в process.env.DATABASE_URL к моменту первого импорта src/db/pool.ts
 * в процессе (см. tests/setup-env.ts).
 *
 * Один тест-пограничник ниже (playerName ровно 20 символов) намеренно
 * ПРОПУСКАЕТ валидацию и подтверждает это узнаванием, что ответ НЕ 400 —
 * не проверяя код 500/201, чтобы не зависеть от (недоступной здесь) БД.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import type { ApiErrorResponse } from '@agentic-game/types';

import { buildApp } from '../../src/app.js';
import type { AppEnv } from '../../src/config/env.js';

const testEnv: AppEnv = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  gameOrigins: ['http://localhost:3000'],
  databaseUrl: 'postgres://unit-test:unit-test@127.0.0.1:1/unit_test_unreachable',
};

describe('POST /api/scores — валидация запроса (без обращения к БД)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = { playerName: 'Ada', score: 100, levelId: 'level-1' };

  it.each([
    ['пустое имя', { ...validBody, playerName: '' }],
    ['имя из одних пробелов', { ...validBody, playerName: '   ' }],
    ['имя длиннее 20 символов (21)', { ...validBody, playerName: 'a'.repeat(21) }],
    ['отрицательный score', { ...validBody, score: -1 }],
    ['нецелый score', { ...validBody, score: 1.5 }],
    ['score отсутствует', { playerName: 'Ada', levelId: 'level-1' }],
    ['отсутствующий levelId', { playerName: 'Ada', score: 100 }],
    ['пустой levelId', { ...validBody, levelId: '' }],
    ['levelId из одних пробелов', { ...validBody, levelId: '   ' }],
    ['отрицательный durationMs', { ...validBody, durationMs: -5 }],
    ['нецелый durationMs', { ...validBody, durationMs: 12.3 }],
    ['stageReached = 0 (ниже STAGE_REACHED_MIN)', { ...validBody, stageReached: 0 }],
    ['нецелый stageReached', { ...validBody, stageReached: 1.5 }],
    ['stageReached строкой', { ...validBody, stageReached: '3' }],
    ['лишнее поле (additionalProperties: false)', { ...validBody, extra: 'nope' }],
    ['playerName не строка', { ...validBody, playerName: 123 }],
  ])('отклоняет с 400 VALIDATION_ERROR: %s', async (_label, body) => {
    const response = await app.inject({ method: 'POST', url: '/api/scores', payload: body });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(typeof parsed.error.message).toBe('string');
  });

  it('playerName ровно 20 символов (верхняя граница) проходит валидацию схемы (не 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { ...validBody, playerName: 'a'.repeat(20) },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('playerName из 1 символа (нижняя граница) проходит валидацию схемы (не 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { ...validBody, playerName: 'A' },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('score = 0 (нижняя граница) проходит валидацию схемы (не 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { ...validBody, score: 0 },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('stageReached отсутствует (поле опционально) — ответ не 400', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/scores', payload: validBody });
    expect(response.statusCode).not.toBe(400);
  });

  it('stageReached = 1 (нижняя граница STAGE_REACHED_MIN) проходит валидацию (не 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { ...validBody, stageReached: 1 },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('stageReached = 5 проходит валидацию (не 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      payload: { ...validBody, stageReached: 5 },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('отклоняет синтаксически некорректный JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scores',
      headers: { 'content-type': 'application/json' },
      payload: '{ это не json',
    });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/leaderboard — валидация query-параметров (без обращения к БД)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['отсутствующий levelId', {}],
    ['пустой levelId', { levelId: '' }],
    ['levelId из одних пробелов', { levelId: '   ' }],
    ['лишний query-параметр', { levelId: 'level-1', foo: 'bar' }],
  ])('отклоняет с 400 VALIDATION_ERROR: %s', async (_label, query) => {
    const response = await app.inject({ method: 'GET', url: '/api/leaderboard', query });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['limit > 100 (101)', { levelId: 'level-1', limit: '101' }],
    ['limit = 0', { levelId: 'level-1', limit: '0' }],
    ['limit отрицательный', { levelId: 'level-1', limit: '-1' }],
  ])('limit вне диапазона [1,100]: %s — ожидаем 400 VALIDATION_ERROR', async (_label, query) => {
    const response = await app.inject({ method: 'GET', url: '/api/leaderboard', query });
    // ПРИМЕЧАНИЕ ДЛЯ ОТЧЁТА: этот тест проверяет реальное поведение
    // TypeBoxValidatorCompiler для querystring-параметров limit>100/<1.
    // Если Fastify/TypeBox не коэрсит строку query-параметра в число перед
    // проверкой minimum/maximum, тест провалится — это будет
    // задокументировано как находка, а не подогнано.
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('levelId без limit проходит валидацию (limit опционален) — ответ не 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1' },
    });
    expect(response.statusCode).not.toBe(400);
  });

  it('limit = 100 (верхняя граница) проходит валидацию — ответ не 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      query: { levelId: 'level-1', limit: '100' },
    });
    expect(response.statusCode).not.toBe(400);
  });
});

describe('404 NOT_FOUND', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(testEnv);
  });

  afterAll(async () => {
    await app.close();
  });

  it('неизвестный GET-маршрут отдаёт 404 с ApiErrorResponse.code === NOT_FOUND', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/unknown-route' });
    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('неподдерживаемый метод на известном пути тоже отдаёт 404', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/scores' });
    expect(response.statusCode).toBe(404);
    const parsed = JSON.parse(response.body) as ApiErrorResponse;
    expect(parsed.error.code).toBe('NOT_FOUND');
  });
});
