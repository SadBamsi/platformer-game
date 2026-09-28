import type { ReactElement } from 'react';
import { GameHost } from '@/game/GameHost';
import { Hud } from '@/components/Hud';
import { GamepadStatusBadge } from '@/components/GamepadStatusBadge';
import { ScoreSubmitForm } from '@/components/ScoreSubmitForm';

/**
 * Серверный компонент-хост: сам не рендерит ничего клиент-специфичного,
 * а делегирует Phaser-канвас клиентскому GameHost (dynamic ssr:false внутри).
 * ScoreSubmitForm — клиентский компонент ('use client'), сам решает,
 * показываться ли (только при sessionStatus === 'game-over'), поэтому его
 * можно рендерить здесь безусловно.
 */
export default function PlayPage(): ReactElement {
  return (
    <main className="play-page">
      <div className="play-page__topbar">
        <Hud />
        <GamepadStatusBadge />
      </div>
      <GameHost />
      <ScoreSubmitForm />
    </main>
  );
}
