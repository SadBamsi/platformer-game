import { defineConfig } from 'vitest/config';

/**
 * Конфиг vitest для @agentic-game/api.
 *
 * environment по умолчанию 'node' — это Fastify-процесс, DOM не нужен.
 *
 * tests/unit/**  — валидация контракта и контроллеры (без реальной БД,
 *                  см. комментарии в самих файлах про то, как это достигается).
 * tests/integration/** — через buildApp() + app.inject(), требуют реальный
 *                  Postgres (DATABASE_URL) — см. README в tests/integration/.
 *
 * testTimeout увеличен относительно дефолта: интеграционные тесты делают
 * реальные запросы к Postgres в Docker, дефолтных 5с vitest иногда не
 * хватает на первый запрос после холодного старта пула соединений.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    testTimeout: 15_000,
    restoreMocks: true,
  },
});
