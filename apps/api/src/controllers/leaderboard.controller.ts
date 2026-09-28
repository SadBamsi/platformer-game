import type { FastifyReply, FastifyRequest } from 'fastify';

import { LEADERBOARD_DEFAULT_LIMIT, type LeaderboardResponse } from '@agentic-game/types';

import { getLeaderboard } from '../db/queries/scores.queries.js';
import type { LeaderboardQueryParams } from '../schemas/scores.schema.js';

/**
 * GET /api/leaderboard.
 *
 * Слой данных (getLeaderboard) возвращает только LeaderboardEntry[] — он
 * не знает про уровень HTTP-контракта. Обёртку { levelId, limit, entries },
 * которую требует LeaderboardResponse (packages/types/src/scores.ts),
 * собираем здесь: levelId/limit — это то, что реально применено к запросу
 * (limit после подстановки дефолта), а не то, что клиент мог прислать или
 * не прислать.
 */
export async function getLeaderboardHandler(
  request: FastifyRequest<{ Querystring: LeaderboardQueryParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { levelId, limit } = request.query;
  const effectiveLimit = limit ?? LEADERBOARD_DEFAULT_LIMIT;

  const entries = await getLeaderboard({ levelId, limit: effectiveLimit });

  const response: LeaderboardResponse = {
    levelId,
    limit: effectiveLimit,
    entries,
  };

  reply.code(200).send(response);
}
