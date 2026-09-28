import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Конфиг vitest для @agentic-game/game.
 *
 * environment: 'jsdom' — слой ввода (src/game/input/**) и другие клиентские
 * модули обращаются к window/navigator; jsdom эмулирует их без реального
 * браузера. Phaser/канвас-рендер здесь НЕ тестируется юнит-тестами (нет
 * WebGL в jsdom) — для этого есть браузерная верификация через Playwright
 * MCP (см. apps/game/e2e/ и отчёт qa-test-expert).
 *
 * resolve.alias — зеркалит "paths" из tsconfig.json ("@/*" -> "./src/*"),
 * иначе тесты не смогут импортировать модули игры через тот же алиас, что
 * использует остальной код.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
