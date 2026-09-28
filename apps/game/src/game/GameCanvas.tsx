'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import Phaser from 'phaser';
import { InputManager } from '@/game/input';
import { createGameConfig } from './config';
import { GameEventBus } from './bridge/GameEventBus';
import { useGameStore } from '@/store/useGameStore';

/**
 * Клиентский хост Phaser-игры. Рендерится ТОЛЬКО через next/dynamic({ ssr: false })
 * (см. GameHost.tsx) — Phaser и InputManager обращаются к window/navigator, чего
 * нет при серверном рендере.
 *
 * Создание Phaser.Game намеренно отложено на requestAnimationFrame — это НЕ
 * косметика, а обход реальной гонки с React Strict Mode:
 * `Phaser.Game.destroy()` асинхронный (обрабатывается на следующем шаге
 * внутреннего игрового цикла ИМЕННО ЭТОГО инстанса; см. Phaser docs — «flags
 * the game for destruction on the next frame»). Strict Mode в dev делает
 * mount → cleanup → mount синхронно в одном тике, ДО того как браузер вообще
 * успевает отрисовать кадр. Если создавать Phaser.Game прямо в эффекте, то на
 * «фантомном» первом маунте инстанс создаётся и добавляет свой canvas в DOM,
 * cleanup вызывает destroy() — но тот срабатывает лишь на будущем шаге цикла
 * ЭТОГО инстанса, а второй (настоящий) маунт уже успевает создать свой
 * собственный Phaser.Game и добавить второй canvas в тот же контейнер. Хуже
 * того: если у первого инстанса ещё не запустился внутренний игровой цикл
 * (он стартует только после готовности TextureManager), обработать
 * `pendingDestroy` вообще некому — экземпляр зависает орфаном НАВСЕГДА,
 * подтверждено вручную в браузере (см. отчёт по инциденту с циклическим
 * импортом — там же выявлен и этот баг).
 * Откладывая создание на rAF, при «фантомном» маунте cleanup успевает
 * выставить cancelled = true и отменить rAF раньше, чем он вообще успевает
 * сработать — значит для фантомного маунта Phaser.Game не создаётся вовсе, и
 * уничтожать (асинхронно, с риском гонки) нечего. Настоящий маунт создаёт
 * ровно один инстанс на следующем реальном кадре.
 */
export function GameCanvas(): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let game: Phaser.Game | null = null;
    let inputManager: InputManager | null = null;
    let eventBus: GameEventBus | null = null;
    let unsubscribeGamepad: (() => void) | null = null;
    const eventCleanups: Array<() => void> = [];

    // Phaser.Game создаётся только при ненулевом размере контейнера. Иначе
    // WebGL-рендерер создаёт буфер кадра размером 0×0 и падает с
    // «Framebuffer status: Incomplete Attachment» (пункт 8 хэндоффа
    // 23.09.2026): так бывало, если страница грузилась в скрытой панели или
    // до раскладки flex-контейнера. ResizeObserver ждёт первого ненулевого
    // размера и отключается.
    let resizeObserver: ResizeObserver | null = null;
    const hasSize = (): boolean => container.clientWidth > 0 && container.clientHeight > 0;

    const createGame = (): void => {
      if (cancelled || game) return;

      inputManager = new InputManager();
      eventBus = new GameEventBus();

      const config = createGameConfig(container);
      game = new Phaser.Game(config);

      // Общие для всех сцен сервисы кладём в registry — официальный Phaser-способ
      // расшарить объекты между сценами без глобальных переменных (см. сцены,
      // которые читают их через this.registry.get(...)).
      game.registry.set('inputManager', inputManager);
      game.registry.set('eventBus', eventBus);

      // Только в dev: доступ к игре из консоли браузера для e2e-проверки
      // проходимости этапов (телепорт игрока, чтение сцены). В production-
      // сборке ветка вырезается, глобала нет.
      if (process.env.NODE_ENV === 'development') {
        (window as unknown as { __phaserGame?: Phaser.Game }).__phaserGame = game;
        void import('@/game/rising/jumpSimulator').then((jumpSimulator) => {
          (window as unknown as { __jumpSimulator?: typeof jumpSimulator }).__jumpSimulator =
            jumpSimulator;
        });
      }

      inputManager.attach();

      // onGamepadChange уведомляет только об ИЗМЕНЕНИЯХ, не при подписке — если геймпад
      // уже был активен (жест на нём случился раньше маунта), начальное значение нужно
      // прочитать напрямую, иначе GamepadStatusBadge молчал бы до следующего события.
      useGameStore.getState().setGamepadStatus(inputManager.state.gamepadConnected, inputManager.state.activeGamepadId);

      unsubscribeGamepad = inputManager.onGamepadChange((connected, id) => {
        useGameStore.getState().setGamepadStatus(connected, id);
      });

      const handleScoreChanged = (payload: { score: number }): void => {
        useGameStore.getState().setScore(payload.score);
      };
      const handleLivesChanged = (payload: { lives: number }): void => {
        useGameStore.getState().setLives(payload.lives);
      };
      const handleStageChanged = (payload: { stage: number }): void => {
        useGameStore.getState().setStage(payload.stage);
      };
      const handleWaterChanged = (payload: { distanceRows: number }): void => {
        useGameStore.getState().setWaterDistanceRows(payload.distanceRows);
      };
      const handleGameOver = (payload: {
        score: number;
        levelId: string;
        stageReached: number;
        durationMs: number;
      }): void => {
        useGameStore.getState().setSessionStatus('game-over');
        useGameStore.getState().setScore(payload.score);
        useGameStore.getState().setLastRun({
          score: payload.score,
          stageReached: payload.stageReached,
          durationMs: payload.durationMs,
        });
      };

      eventBus.on('score:changed', handleScoreChanged);
      eventCleanups.push(() => eventBus?.off('score:changed', handleScoreChanged));
      eventBus.on('lives:changed', handleLivesChanged);
      eventCleanups.push(() => eventBus?.off('lives:changed', handleLivesChanged));
      eventBus.on('stage:changed', handleStageChanged);
      eventCleanups.push(() => eventBus?.off('stage:changed', handleStageChanged));
      eventBus.on('water:changed', handleWaterChanged);
      eventCleanups.push(() => eventBus?.off('water:changed', handleWaterChanged));
      eventBus.on('game:over', handleGameOver);
      eventCleanups.push(() => eventBus?.off('game:over', handleGameOver));

      useGameStore.getState().setSessionStatus('playing');
    };

    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (hasSize()) {
        createGame();
        return;
      }
      resizeObserver = new ResizeObserver(() => {
        if (!hasSize()) return;
        resizeObserver?.disconnect();
        resizeObserver = null;
        createGame();
      });
      resizeObserver.observe(container);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();

      eventCleanups.forEach((cleanup) => cleanup());
      unsubscribeGamepad?.();
      inputManager?.detach();
      eventBus?.clear();
      // Если rAF выше не успел сработать (типичный «фантомный» маунт Strict Mode),
      // game здесь всё ещё null — уничтожать нечего, второй canvas просто не появится.
      game?.destroy(true);
    };
  }, []);

  return <div ref={containerRef} className="game-canvas-root" data-testid="game-canvas-root" />;
}
