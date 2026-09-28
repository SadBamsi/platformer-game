import Fastify, { type FastifyInstance } from 'fastify';
import { TypeBoxValidatorCompiler } from '@fastify/type-provider-typebox';

import { loadEnv, type AppEnv } from './config/env.js';
import { registerCors } from './plugins/cors.js';
import { registerErrorHandling } from './plugins/error-handler.js';
import { scoresRoutes } from './routes/scores.route.js';
import { leaderboardRoutes } from './routes/leaderboard.route.js';
import { healthRoutes } from './routes/health.route.js';

/**
 * Собирает Fastify-приложение со всеми плагинами и роутами, НЕ вызывая
 * listen(). Используется:
 *   - src/index.ts — реальный процесс, добавляет listen() и graceful
 *     shutdown;
 *   - qa-test-expert — интеграционные тесты через app.inject(), без
 *     открытия реального сетевого порта (см. handoff в конце задачи).
 *
 * `env` — необязательный параметр именно для тестов: они могут собрать
 * приложение с собственным набором переменных (например, другим
 * GAME_ORIGIN или на in-memory/тестовой БД), не трогая process.env
 * глобально между тестами. По умолчанию читается реальный process.env
 * через loadEnv() — та же валидация, что и в проде, так что интеграционные
 * тесты падают на тех же ошибках конфигурации, что и реальный процесс.
 *
 * Валидатор запросов — TypeBoxValidatorCompiler (JIT-компилируемый,
 * штатная замена Ajv-по-умолчанию для схем, построенных через
 * @fastify/type-provider-typebox) — подключается здесь явно: сам по себе
 * TypeBox-объект схемы — это просто JSON Schema, Fastify провалидирует его
 * и через дефолтный Ajv, но проект уже выбрал typebox как стек (см.
 * package.json), так что используем совместимый с ним валидатор.
 */
export async function buildApp(env: AppEnv = loadEnv()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === 'test' ? 'silent' : env.nodeEnv === 'production' ? 'info' : 'debug',
      // На случай, если в будущем появятся auth-заголовки/cookie (см.
      // CLAUDE.md проекта, httpOnly-cookie + silent-refresh) — секреты
      // никогда не должны попасть в лог, даже случайно через req.headers.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
        remove: true,
      },
    },
  });

  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  registerErrorHandling(app);
  await registerCors(app, env);

  await app.register(scoresRoutes);
  await app.register(leaderboardRoutes);
  await app.register(healthRoutes);

  return app;
}
