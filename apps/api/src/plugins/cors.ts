import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

import type { AppEnv } from '../config/env.js';

/**
 * CORS с явным allowlist origin'ов из GAME_ORIGIN (переменные окружения,
 * см. ../config/env.ts). Фронтенд (Next.js, http://localhost:3000 в dev)
 * и API (http://localhost:4000) — разные origin даже локально.
 *
 * credentials: true — заранее, в расчёте на httpOnly-cookie аутентификацию
 * (см. CLAUDE.md проекта, паттерн silent-refresh), которой в этой задаче
 * ещё нет, но CORS-конфигурация не должна меняться в день, когда она
 * появится. Wildcard origin ('*') несовместим с credentials: true по
 * спецификации fetch/CORS (браузер отклонит такой ответ), поэтому
 * allowlist — единственный вариант, а не «пока сойдёт и так».
 *
 * methods ограничены тем, что реально обслуживает этот API сейчас —
 * расширять по мере появления новых эндпоинтов.
 */
export async function registerCors(app: FastifyInstance, env: AppEnv): Promise<void> {
  await app.register(cors, {
    origin: env.gameOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  });
}
