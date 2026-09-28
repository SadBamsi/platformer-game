/**
 * InputManager.ts
 * ------------------------------------------------------------------------
 * Сливает клавиатуру и геймпад в единое состояние логических действий,
 * с edge-детекцией (justPressed/justReleased) и техниками прощения ввода
 * (coyote time, jump buffering) для JUMP.
 *
 * ВАЖНЫЙ КОНТРАКТ ДЛЯ ПОТРЕБИТЕЛЯ (nextjs-frontend-engineer), см. также README:
 *   1. attach() — один раз при маунте игрового экрана.
 *   2. КАЖДЫЙ кадр, ДО игровой логики:
 *        inputManager.setGrounded(playerWasGroundedInPreviousPhysicsStep);
 *        inputManager.update(timestampMs);
 *      Порядок важен: setGrounded ДО update, иначе coyote/buffer будут
 *      работать на устаревшем значении grounded.
 *   3. Игровая логика читает inputManager.state (isDown/justPressed/...).
 *   4. detach() при размонтировании. Идемпотентен — безопасно вызвать дважды
 *      (React Strict Mode монтирует эффекты дважды в dev).
 *
 * ОСОБЫЙ СЛУЧАЙ: state.justPressed('JUMP') — это НЕ сырой edge нажатия
 * кнопки прыжка. Он уже учитывает coyote time и jump buffering (см. update()
 * ниже). Для всех остальных действий justPressed/justReleased — обычный
 * сырой edge. state.isDown('JUMP') и state.justReleased('JUMP') ОСТАЮТСЯ
 * сырыми (не прощающими) — они нужны, например, для variable jump height
 * (обрезание скорости прыжка по отпусканию кнопки должно реагировать на
 * реальное отпускание, а не на буферизованную логику).
 *
 * Если setGrounded() никогда не вызывается фронтендом, grounded по умолчанию
 * = false. Это осознанный выбор: в этом случае coyote-окно никогда не
 * откроется, и JUMP просто не будет срабатывать (видимый, "громкий" баг),
 * а не откроется постоянно на true (что дало бы бесконечный прыжок в
 * воздухе — гораздо более коварный и незаметный баг).
 */

import {
  ALL_ACTIONS,
  createActionRecord,
  type ActionRecord,
  type GameAction,
} from './ActionMap';
import { GamepadSource, type GamepadFrameSnapshot } from './GamepadSource';
import { KeyboardSource } from './KeyboardSource';
import { processStickAxis } from './deadzone';
import { DEFAULT_TUNING, type InputTuning } from './tuning';

export interface InputState {
  isDown(action: GameAction): boolean;
  /** true ровно один кадр. Для JUMP уже включает coyote time и jump buffering. */
  justPressed(action: GameAction): boolean;
  /** true ровно один кадр. Всегда сырой edge, даже для JUMP. */
  justReleased(action: GameAction): boolean;
  /** Горизонтальная ось после мёртвой зоны и кривой отклика, -1..1. */
  readonly moveX: number;
  readonly gamepadConnected: boolean;
  /** id активного геймпада или null. */
  readonly activeGamepadId: string | null;
}

export type GamepadChangeListener = (connected: boolean, id: string | null) => void;

/**
 * Реализация InputState через инъекцию функций-читателей вместо ссылки на
 * InputManager целиком. Каждая функция — замыкание (arrow function),
 * созданное в конструкторе InputManager: оно лексически захватывает `this`
 * того InputManager без присваивания `this` в локальную переменную, поэтому
 * приватные поля InputManager остаются приватными и не нужен ни
 * `no-this-alias`-алиасинг, ни служебные публичные read*-методы на
 * InputManager сверх контракта.
 */
class InputStateImpl implements InputState {
  public constructor(
    private readonly getIsDown: (action: GameAction) => boolean,
    private readonly getJustPressed: (action: GameAction) => boolean,
    private readonly getJustReleased: (action: GameAction) => boolean,
    private readonly getMoveX: () => number,
    private readonly getGamepadConnected: () => boolean,
    private readonly getActiveGamepadId: () => string | null,
  ) {}

  isDown(action: GameAction): boolean {
    return this.getIsDown(action);
  }

  justPressed(action: GameAction): boolean {
    return this.getJustPressed(action);
  }

  justReleased(action: GameAction): boolean {
    return this.getJustReleased(action);
  }

  get moveX(): number {
    return this.getMoveX();
  }

  get gamepadConnected(): boolean {
    return this.getGamepadConnected();
  }

  get activeGamepadId(): string | null {
    return this.getActiveGamepadId();
  }
}

export class InputManager {
  private readonly tuning: InputTuning;
  private readonly gamepadSource = new GamepadSource();
  private readonly keyboardSource = new KeyboardSource();
  private readonly gamepadChangeListeners = new Set<GamepadChangeListener>();

  /** Публичный вид состояния — см. комментарий у InputStateImpl выше. */
  private readonly stateView: InputState;

  private attached = false;

  // Состояние действий за текущий и предыдущий кадр (для edge-детекции).
  private currentFrame: ActionRecord = createActionRecord(false);
  private previousFrame: ActionRecord = createActionRecord(false);

  // JUMP — единственное действие с особой (прощающей) семантикой justPressed.
  private jumpFiresThisFrame = false;

  private moveXValue = 0;
  private gamepadConnectedValue = false;
  private activeGamepadIdValue: string | null = null;

  // Вход от игровой логики: "стоит ли игрок на земле в начале этого кадра".
  private grounded = false;
  private wasGroundedLastUpdate = false;

  // Окно coyote time: абсолютная временная метка (мс), до которой прыжок
  // ещё считается разрешённым после ухода с земли. null — окно закрыто.
  private coyoteUntilMs: number | null = null;
  // Окно jump buffer: абсолютная временная метка (мс), до которой ранее
  // нажатый прыжок ещё будет исполнен по приземлению. null — буфер пуст.
  private jumpBufferedUntilMs: number | null = null;

  public constructor(options?: Partial<InputTuning>) {
    this.tuning = { ...DEFAULT_TUNING, ...options };

    this.stateView = new InputStateImpl(
      (action) => this.currentFrame[action],
      (action) => {
        if (action === 'JUMP') {
          return this.jumpFiresThisFrame;
        }
        return this.currentFrame[action] && !this.previousFrame[action];
      },
      // Всегда сырой edge, даже для JUMP — см. комментарий в шапке файла.
      (action) => !this.currentFrame[action] && this.previousFrame[action],
      () => this.moveXValue,
      () => this.gamepadConnectedValue,
      () => this.activeGamepadIdValue,
    );
  }

  /** Навесить слушатели window. Идемпотентен. */
  public attach(): void {
    if (this.attached) return;
    if (typeof window === 'undefined') return; // SSR-гвард
    this.gamepadSource.attach();
    this.keyboardSource.attach();
    this.attached = true;
  }

  /** Снять все слушатели. Идемпотентен (безопасно вызвать без предварительного attach). */
  public detach(): void {
    if (!this.attached) return;
    this.gamepadSource.detach();
    this.keyboardSource.detach();
    this.attached = false;

    // Сбрасываем состояние действий, чтобы после повторного attach() не
    // "унаследовать" нажатое-на-момент-detach состояние как justPressed.
    this.currentFrame = createActionRecord(false);
    this.previousFrame = createActionRecord(false);
    this.jumpFiresThisFrame = false;
    this.moveXValue = 0;
    this.coyoteUntilMs = null;
    this.jumpBufferedUntilMs = null;
  }

  /**
   * Вход от игровой физики: стоит ли игрок на земле. Должен вызываться
   * КАЖДЫЙ кадр ПЕРЕД update() — иначе coyote time и jump buffering не будут
   * работать (см. комментарий в шапке файла).
   */
  public setGrounded(value: boolean): void {
    this.grounded = value;
  }

  /**
   * Вызывается ровно один раз за кадр, до игровой логики.
   * timestampMs — монотонная временная метка кадра (например performance.now()
   * или timestamp из requestAnimationFrame/сцены Phaser) — используется для
   * окон coyote time и jump buffer.
   */
  public update(timestampMs: number): void {
    if (typeof window === 'undefined') return; // SSR-гвард

    const gamepadSnapshot = this.gamepadSource.poll(this.tuning);
    const keyboardSnapshot = this.keyboardSource.poll();

    this.syncGamepadConnectionState(gamepadSnapshot);

    const mergedFrame = this.mergeActionRecords(gamepadSnapshot, keyboardSnapshot);
    this.moveXValue = this.computeMoveX(gamepadSnapshot, keyboardSnapshot);

    this.advanceJumpForgiveness(mergedFrame, timestampMs);

    // Сдвиг кадра: текущий становится предыдущим для следующего вызова.
    this.previousFrame = this.currentFrame;
    this.currentFrame = mergedFrame;
    this.wasGroundedLastUpdate = this.grounded;
  }

  /** Подписка на изменение присутствия/id геймпада. Возвращает функцию отписки. */
  public onGamepadChange(cb: GamepadChangeListener): () => void {
    this.gamepadChangeListeners.add(cb);
    return () => {
      this.gamepadChangeListeners.delete(cb);
    };
  }

  public get state(): InputState {
    return this.stateView;
  }

  // -- приватная реализация --------------------------------------------------

  private mergeActionRecords(
    gamepad: GamepadFrameSnapshot,
    keyboard: { actionDown: ActionRecord },
  ): ActionRecord {
    const merged = createActionRecord(false);
    for (const action of ALL_ACTIONS) {
      merged[action] = gamepad.actionDown[action] || keyboard.actionDown[action];
    }
    return merged;
  }

  /**
   * Геймпад имеет приоритет для аналоговой оси, если стик реально отклонён
   * за пределы мёртвой зоны (processedStick.x !== 0). Иначе используется
   * цифровой ввод с клавиатуры. Это позволяет переключаться между
   * устройствами прямо посреди сессии без явного "режима": если игрок
   * отпустил стик и нажал клавишу — управление тут же переходит клавиатуре,
   * и наоборот.
   *
   * Компромисс: если оба источника активны одновременно (стик отклонён И
   * зажата клавиша), геймпад побеждает произвольно — это редкий edge case,
   * не влияющий на обычную игру одним устройством за раз.
   */
  private computeMoveX(
    gamepad: GamepadFrameSnapshot,
    keyboard: { actionDown: ActionRecord },
  ): number {
    const processedStick = processStickAxis(
      gamepad.leftStickX,
      gamepad.leftStickY,
      this.tuning.deadzone,
      this.tuning.stickResponseCurveExponent,
    );

    if (processedStick.x !== 0) {
      return processedStick.x;
    }

    const keyboardX =
      (keyboard.actionDown.MOVE_RIGHT ? 1 : 0) - (keyboard.actionDown.MOVE_LEFT ? 1 : 0);
    return keyboardX;
  }

  private syncGamepadConnectionState(snapshot: GamepadFrameSnapshot): void {
    const changed =
      snapshot.connected !== this.gamepadConnectedValue ||
      snapshot.gamepadId !== this.activeGamepadIdValue;

    this.gamepadConnectedValue = snapshot.connected;
    this.activeGamepadIdValue = snapshot.gamepadId;

    if (changed) {
      for (const listener of this.gamepadChangeListeners) {
        listener(snapshot.connected, snapshot.gamepadId);
      }
    }
  }

  /**
   * Считает jumpFiresThisFrame с учётом coyote time и jump buffering.
   * Порядок операций важен:
   *   1. Обновить coyote-окно по факту ухода/нахождения на земле в ЭТОМ кадре.
   *   2. Определить сырой edge нажатия JUMP.
   *   3. Если edge есть и есть разрешение (grounded или coyote-окно открыто) —
   *      прыжок срабатывает немедленно, coyote-окно закрывается (использовано).
   *   4. Если edge есть, но разрешения нет — запомнить нажатие в jump-буфер.
   *   5. Если прыжок ещё не сработал в этом кадре, но буфер не пуст и
   *      игрок сейчас на земле — прыжок срабатывает по буферу.
   *   6. Истёкший буфер (время вышло, а земли так и не было) — очищается.
   */
  private advanceJumpForgiveness(mergedFrame: ActionRecord, timestampMs: number): void {
    // 1. coyote-окно
    if (this.wasGroundedLastUpdate && !this.grounded) {
      // Игрок был на земле на прошлом кадре и уже не на ней сейчас — ушёл с платформы.
      this.coyoteUntilMs = timestampMs + this.tuning.coyoteTimeMs;
    }
    if (this.grounded) {
      // На земле разрешение и так есть напрямую, отдельное окно не нужно.
      this.coyoteUntilMs = null;
    }

    // 2. сырой edge
    const rawJumpPressedEdge = mergedFrame.JUMP && !this.currentFrame.JUMP;

    this.jumpFiresThisFrame = false;

    const hasJumpPermission =
      this.grounded || (this.coyoteUntilMs !== null && timestampMs < this.coyoteUntilMs);

    // 3-4.
    if (rawJumpPressedEdge) {
      if (hasJumpPermission) {
        this.jumpFiresThisFrame = true;
        this.coyoteUntilMs = null; // окно использовано — не даём сработать повторно
      } else {
        this.jumpBufferedUntilMs = timestampMs + this.tuning.jumpBufferMs;
      }
    }

    // 5-6.
    if (!this.jumpFiresThisFrame && this.jumpBufferedUntilMs !== null) {
      if (timestampMs > this.jumpBufferedUntilMs) {
        this.jumpBufferedUntilMs = null; // буфер истёк без приземления
      } else if (this.grounded) {
        this.jumpFiresThisFrame = true;
        this.jumpBufferedUntilMs = null; // сработал по приземлению
      }
    }
  }
}
