'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

/**
 * ssr: false обязателен: Phaser и InputManager используют window/navigator,
 * которых нет на этапе серверного рендера. В Next.js 16 App Router
 * dynamic(..., { ssr: false }) допустим только внутри клиентского компонента —
 * поэтому этот файл сам помечен 'use client', а play/page.tsx остаётся
 * серверным и просто рендерит <GameHost />.
 */
const GameCanvas = dynamic(() => import('./GameCanvas').then((mod) => mod.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="game-canvas-loading" role="status">
      Загрузка игры…
    </div>
  ),
});

export function GameHost(): ReactElement {
  return <GameCanvas />;
}
