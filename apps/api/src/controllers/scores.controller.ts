import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ScoreRecord } from '@agentic-game/types';

import { insertScore } from '../db/queries/scores.queries.js';
import type { CreateScoreRequestBody } from '../schemas/scores.schema.js';

/**
 * POST /api/scores.
 *
 * Валидация формы (длины, диапазоны, "не пусто") уже прошла на уровне
 * Fastify-схемы (см. routes/scores.route.ts, schemas/scores.schema.ts) —
 * здесь только нормализация значения, которое схема не может нормализовать
 * сама (обрезка пробелов у имени игрока — контракт описывает это поведение
 * явно, см. комментарий у CreateScoreRequest.playerName в
 * packages/types/src/scores.ts), и делегирование в слой данных.
 *
 * insertScore() не оборачивается в try/catch: любая её ошибка (обрыв
 * соединения с БД, нарушение CHECK на стороне БД, таймаут) должна долететь
 * до общего error-handler'а (../plugins/error-handler.ts) и стать 500
 * INTERNAL_ERROR, а не превратиться здесь в частично обработанный или
 * неверно классифицированный ответ.
 */
export async function createScoreHandler(
  request: FastifyRequest<{ Body: CreateScoreRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body;

  const record: ScoreRecord = await insertScore({
    playerName: body.playerName.trim(),
    score: body.score,
    levelId: body.levelId,
    durationMs: body.durationMs,
    stageReached: body.stageReached,
  });

  reply.code(201).send(record);
}
