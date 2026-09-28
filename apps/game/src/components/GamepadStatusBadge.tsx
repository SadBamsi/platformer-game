'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { useGameStore } from '@/store/useGameStore';

/**
 * Браузер не отдаёт реальное состояние геймпада (navigator.getGamepads())
 * до первого пользовательского жеста на странице — защита от fingerprinting.
 * Поэтому до жеста показываем подсказку вместо «геймпад не найден», которая
 * иначе была бы ложной.
 */
export function GamepadStatusBadge(): ReactElement {
  const gamepadConnected = useGameStore((state) => state.gamepadConnected);
  const activeGamepadId = useGameStore((state) => state.activeGamepadId);
  const [hasUserGesture, setHasUserGesture] = useState(false);

  useEffect(() => {
    if (hasUserGesture) return;
    const markGesture = (): void => setHasUserGesture(true);
    window.addEventListener('pointerdown', markGesture, { once: true });
    window.addEventListener('keydown', markGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', markGesture);
      window.removeEventListener('keydown', markGesture);
    };
  }, [hasUserGesture]);

  if (!hasUserGesture) {
    return (
      <div className="gamepad-badge gamepad-badge--hint">
        Нажмите любую клавишу или кнопку на геймпаде, чтобы браузер показал его статус
      </div>
    );
  }

  return (
    <div
      className={`gamepad-badge ${gamepadConnected ? 'gamepad-badge--connected' : 'gamepad-badge--disconnected'}`}
    >
      {gamepadConnected ? `Геймпад подключён: ${activeGamepadId ?? 'неизвестно'}` : 'Геймпад не подключён'}
    </div>
  );
}
