/**
 * Типизированная шина событий между Phaser-сценами и React.
 * Сцены эмитят события сюда вместо прямого вызова React-обработчиков/стора —
 * так игровой слой не тянет за собой React-рендер и остаётся тестируемым
 * независимо от UI (см. PlatformerScene.ts и GameCanvas.tsx, где события
 * транслируются в useGameStore).
 */
export interface GameEventMap {
  'score:changed': { score: number };
  'lives:changed': { lives: number };
  'level:completed': { levelId: string; durationMs: number };
  /**
   * stageReached/durationMs добавлены для контракта лидерборда режима «Вода
   * поднимается» (rising-water.md, план «Волна C» — расширение game:over).
   */
  'game:over': { score: number; levelId: string; stageReached: number; durationMs: number };
  /** Новый этап начался (спавн/рестарт с этим номером). */
  'stage:changed': { stage: number };
  /**
   * Расстояние от игрока до поверхности воды, целые ряды. Эмитится ТОЛЬКО
   * при изменении целого значения (не каждый кадр) — см. PlatformerScene.
   */
  'water:changed': { distanceRows: number };
}

type Listener<T> = (payload: T) => void;

/**
 * Внутреннее хранилище стирает конкретный тип payload до unknown.
 * Причина: при generic K запись вида `Map<K, Set<Listener<GameEventMap[K]>>>`
 * не типизируется — TypeScript требует, чтобы присваиваемое значение подходило
 * под ПЕРЕСЕЧЕНИЕ типов всех ключей GameEventMap одновременно (известное
 * ограничение сужения по generic-индексу, см. microsoft/TypeScript#31445).
 * Публичные on/off/emit ниже остаются полностью типобезопасными — стирание
 * происходит только на границе через `as unknown as ErasedListener`, что не
 * запрещённый `any`, а управляемое сужение до unknown с немедленным возвратом
 * к точному типу на публичном API.
 */
type ErasedListener = Listener<unknown>;

export class GameEventBus {
  private readonly listeners = new Map<keyof GameEventMap, Set<ErasedListener>>();

  /** Подписаться на событие. Возвращает функцию отписки. */
  on<K extends keyof GameEventMap>(event: K, listener: Listener<GameEventMap[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set<ErasedListener>();
    set.add(listener as unknown as ErasedListener);
    this.listeners.set(event, set);
    return () => this.off(event, listener);
  }

  off<K extends keyof GameEventMap>(event: K, listener: Listener<GameEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as unknown as ErasedListener);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  /** Снять всех слушателей — вызывается при destroy() игры в GameCanvas.tsx. */
  clear(): void {
    this.listeners.clear();
  }
}
