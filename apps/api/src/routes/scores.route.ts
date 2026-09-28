import type { FastifyPluginAsync } from 'fastify';

import { createScoreHandler } from '../controllers/scores.controller.js';
import { CreateScoreRequestSchema, ScoreRecordSchema } from '../schemas/scores.schema.js';
import type { CreateScoreRequestBody } from '../schemas/scores.schema.js';

/**
 * POST /api/scores — фиксирует результат прохождения уровня.
 *
 * Только успешный ответ (201) объявлен Fastify-схемой `response`: ошибки
 * идут через общий error-handler (../plugins/error-handler.ts) и НЕ
 * пропускаются через per-route response-сериализацию — см. комментарий
 * там же про то, почему это намеренно.
 */
export const scoresRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateScoreRequestBody }>(
    '/api/scores',
    {
      schema: {
        body: CreateScoreRequestSchema,
        response: {
          201: ScoreRecordSchema,
        },
      },
    },
    createScoreHandler,
  );
};
