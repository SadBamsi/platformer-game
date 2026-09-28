import type { FastifyPluginAsync } from 'fastify';

import type { HealthResponse } from '@agentic-game/types';

import { pool } from '../db/pool.js';
import { HealthResponseSchema } from '../schemas/common.schema.js';

/**
 * GET /health — для healthcheck в docker-compose (devops-engineer).
 *
 * Реально бьёт в БД (`SELECT 1`) через прикладной `pool`, а не просто
 * проверяет, что процесс жив: процесс может отвечать на HTTP и при этом
 * быть бесполезен, если БД недоступна — именно это должен обнаружить
 * healthcheck.
 *
 * Статус-код осознанно отражает результат проверки, а не всегда 200:
 * 200 при status: 'ok', 503 Service Unavailable при status: 'degraded'
 * (БД недоступна). Docker healthcheck / оркестратор обычно смотрит именно
 * на HTTP-статус, а не парсит тело ответа — если всегда отвечать 200, что
 * бы ни случилось с БД, healthcheck не сможет отличить "всё хорошо" от
 * "БД лежит" без разбора JSON, а обычно этого не делает. Тело ответа при
 * этом всегда строго HealthResponse независимо от кода.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let databaseUp = true;
      try {
        await pool.query('SELECT 1');
      } catch (err) {
        databaseUp = false;
        request.log.error({ err }, 'health check: БД недоступна');
      }

      const body: HealthResponse = {
        status: databaseUp ? 'ok' : 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        database: databaseUp ? 'up' : 'down',
      };

      reply.code(databaseUp ? 200 : 503).send(body);
    },
  );
};
