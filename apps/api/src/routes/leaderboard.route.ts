import type { FastifyPluginAsync } from 'fastify';

import { getLeaderboardHandler } from '../controllers/leaderboard.controller.js';
import { LeaderboardQuerySchema, LeaderboardResponseSchema } from '../schemas/scores.schema.js';
import type { LeaderboardQueryParams } from '../schemas/scores.schema.js';

/**
 * GET /api/leaderboard — топ результатов по одному уровню.
 *
 * Только успешный ответ (200) объявлен Fastify-схемой `response` — см.
 * комментарий в scores.route.ts / plugins/error-handler.ts про ошибки.
 */
export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: LeaderboardQueryParams }>(
    '/api/leaderboard',
    {
      schema: {
        querystring: LeaderboardQuerySchema,
        response: {
          200: LeaderboardResponseSchema,
        },
      },
    },
    getLeaderboardHandler,
  );
};
