import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // transpilePackages: ['@agentic-game/types'] раньше был нужен, т.к. пакет был
  // source-only (exports указывал на ./src/index.ts). Теперь packages/types
  // собирается в dist/*.js + dist/*.d.ts обычным tsc (см. packages/types/package.json,
  // exports указывает на ./dist/index.js) — это уже готовый ESM-JS, который Next
  // потребляет как любой обычный npm-пакет, транспилировать нечего.
  // Нужно для infra/Dockerfile.game — standalone-сборка тащит только необходимые
  // node_modules и не требует полного workspace внутри финального образа.
  output: 'standalone',
};

export default nextConfig;
