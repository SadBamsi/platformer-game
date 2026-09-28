'use client';

import type { ReactElement } from 'react';
import { WATER_ENABLED } from '@/game/rising/difficulty';
import { useGameStore, type SessionStatus } from '@/store/useGameStore';

function sessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'playing':
      return 'В игре';
    case 'paused':
      return 'Пауза';
    case 'game-over':
      return 'Игра окончена';
    case 'idle':
      return 'Ожидание';
  }
}

/** Русское склонение слова «ряд» по числу (1 ряд, 2 ряда, 5 рядов). */
function rowsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'рядов';
  if (mod10 === 1) return 'ряд';
  if (mod10 >= 2 && mod10 <= 4) return 'ряда';
  return 'рядов';
}

/** HUD поверх игры: этап, счёт, жизни, индикатор воды, статус сессии. Читает useGameStore напрямую. */
export function Hud(): ReactElement {
  const score = useGameStore((state) => state.score);
  const lives = useGameStore((state) => state.lives);
  const stage = useGameStore((state) => state.stage);
  const waterDistanceRows = useGameStore((state) => state.waterDistanceRows);
  const sessionStatus = useGameStore((state) => state.sessionStatus);

  return (
    <div className="hud" aria-live="polite">
      <span className="hud__item">Этап: {stage}</span>
      <span className="hud__item">Счёт: {score}</span>
      <span className="hud__item">Жизни: {lives}</span>
      {WATER_ENABLED && (
        <span className="hud__item">
          Вода: {waterDistanceRows} {rowsWord(waterDistanceRows)} под тобой
        </span>
      )}
      <span className="hud__item hud__item--status">{sessionStatusLabel(sessionStatus)}</span>
    </div>
  );
}
