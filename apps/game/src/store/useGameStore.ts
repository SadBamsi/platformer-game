import { create } from 'zustand';

export type SessionStatus = 'idle' | 'playing' | 'paused' | 'game-over';

/** Снимок последнего завершённого забега — источник данных для ScoreSubmitForm. */
export interface LastRun {
  score: number;
  stageReached: number;
  durationMs: number;
}

interface GameState {
  score: number;
  lives: number;
  levelId: string | null;
  /** Текущий этап режима «Вода поднимается» (rising-water.md). */
  stage: number;
  /** Расстояние от игрока до поверхности воды, целые ряды (GameEventBus 'water:changed'). */
  waterDistanceRows: number;
  gamepadConnected: boolean;
  activeGamepadId: string | null;
  sessionStatus: SessionStatus;
  /** Данные для формы отправки счёта на экране game over. */
  lastRun: LastRun | null;
  setScore: (score: number) => void;
  addScore: (delta: number) => void;
  setLives: (lives: number) => void;
  setStage: (stage: number) => void;
  setWaterDistanceRows: (distanceRows: number) => void;
  setGamepadStatus: (connected: boolean, id: string | null) => void;
  setSessionStatus: (status: SessionStatus) => void;
  startSession: (levelId: string) => void;
  resetSession: () => void;
  setLastRun: (run: LastRun) => void;
}

/**
 * Рантайм-состояние игровой сессии. Обновляется НЕ напрямую из Phaser-сцен,
 * а через события GameEventBus (см. src/game/bridge/GameEventBus.ts) и
 * коллбэк InputManager.onGamepadChange — так игровой слой не тянет за собой
 * React и остаётся тестируемым отдельно от UI.
 */
export const useGameStore = create<GameState>((set) => ({
  score: 0,
  lives: 3,
  levelId: null,
  stage: 1,
  waterDistanceRows: 0,
  gamepadConnected: false,
  activeGamepadId: null,
  sessionStatus: 'idle',
  lastRun: null,
  setScore: (score) => set({ score }),
  addScore: (delta) => set((state) => ({ score: state.score + delta })),
  setLives: (lives) => set({ lives }),
  setStage: (stage) => set({ stage }),
  setWaterDistanceRows: (waterDistanceRows) => set({ waterDistanceRows }),
  setGamepadStatus: (connected, id) => set({ gamepadConnected: connected, activeGamepadId: id }),
  setSessionStatus: (status) => set({ sessionStatus: status }),
  startSession: (levelId) => set({ levelId, score: 0, lives: 3, stage: 1, sessionStatus: 'playing' }),
  resetSession: () => set({ levelId: null, score: 0, lives: 3, stage: 1, sessionStatus: 'idle' }),
  setLastRun: (lastRun) => set({ lastRun }),
}));
