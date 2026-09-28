import { afterEach, describe, expect, it } from 'vitest';
import { GamepadSource } from '@/game/input/GamepadSource';
import { DEFAULT_TUNING } from '@/game/input/tuning';
import { BUTTON, clearGetGamepads, makeFakeGamepad, stubGetGamepads } from './testGamepad';

describe('GamepadSource', () => {
  let source: GamepadSource;

  afterEach(() => {
    source?.detach();
    clearGetGamepads();
  });

  it('без navigator.getGamepads (jsdom по умолчанию) возвращает пустой снапшот, не бросает исключение', () => {
    source = new GamepadSource();
    expect(() => source.poll(DEFAULT_TUNING)).not.toThrow();
    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.connected).toBe(false);
    expect(snapshot.gamepadId).toBeNull();
  });

  it('находит первый непустой слот в разреженном массиве геймпадов', () => {
    stubGetGamepads(() => [null, null, makeFakeGamepad({ pressedButtons: [BUTTON.BOTTOM_FACE] })]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.actionDown.JUMP).toBe(true);
  });

  it('триггер трактуется как нажатый через value > triggerActivationThreshold, даже если pressed=false', () => {
    stubGetGamepads(() => [
      makeFakeGamepad({ buttonValues: { [BUTTON.RIGHT_TRIGGER]: 0.5 } }),
    ]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    // RIGHT_TRIGGER — одна из кнопок-биндингов DASH (см. ActionMap.ts).
    expect(snapshot.actionDown.DASH).toBe(true);
  });

  it('value триггера ниже порога НЕ считается нажатием, если pressed тоже false', () => {
    stubGetGamepads(() => [
      makeFakeGamepad({ buttonValues: { [BUTTON.RIGHT_TRIGGER]: 0.05 } }), // < 0.15 по умолчанию
    ]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.actionDown.DASH).toBe(false);
  });

  it('Nintendo Switch Pro Controller: CONFIRM/CANCEL переопределены (физическая B=подтвердить, A=отмена)', () => {
    stubGetGamepads(() => [
      makeFakeGamepad({
        id: '057e-2009-Nintendo Switch Pro Controller',
        pressedButtons: [BUTTON.RIGHT_FACE], // физическая "B" на большинстве раскладок
      }),
    ]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    // По override для Switch Pro: RIGHT_FACE -> CONFIRM (не CANCEL, как в standard-биндинге).
    expect(snapshot.actionDown.CONFIRM).toBe(true);
    expect(snapshot.actionDown.CANCEL).toBe(false);
  });

  it('устройство без Switch Pro паттерна использует обычный standard-биндинг (RIGHT_FACE -> CANCEL)', () => {
    stubGetGamepads(() => [
      makeFakeGamepad({ id: 'Xbox Wireless Controller', pressedButtons: [BUTTON.RIGHT_FACE] }),
    ]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.actionDown.CANCEL).toBe(true);
    expect(snapshot.actionDown.CONFIRM).toBe(false);
  });

  it('отключение геймпада между кадрами возвращает пустой снапшот, а не последнее известное состояние', () => {
    let connected = true;
    stubGetGamepads(() => (connected ? [makeFakeGamepad({ pressedButtons: [BUTTON.BOTTOM_FACE] })] : []));
    source = new GamepadSource();

    const before = source.poll(DEFAULT_TUNING);
    expect(before.connected).toBe(true);

    connected = false;
    const after = source.poll(DEFAULT_TUNING);
    expect(after.connected).toBe(false);
    expect(after.actionDown.JUMP).toBe(false);
  });

  it('переподключение на новый индекс подхватывается заново (не держится за старый индекс 0)', () => {
    // Геймпад пропадает из индекса 0, но появляется в индексе 2 (например,
    // ОС/браузер переиспользовал слот 0 для другого устройства).
    let pads: Array<Gamepad | null> = [makeFakeGamepad({ pressedButtons: [BUTTON.BOTTOM_FACE] })];
    stubGetGamepads(() => pads);
    source = new GamepadSource();

    expect(source.poll(DEFAULT_TUNING).connected).toBe(true);

    pads = [null, null, makeFakeGamepad({ pressedButtons: [BUTTON.DPAD_LEFT] })];
    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.actionDown.MOVE_LEFT).toBe(true);
  });

  it('leftStickX/leftStickY читаются из axes[0]/axes[1] (STANDARD_AXIS)', () => {
    stubGetGamepads(() => [makeFakeGamepad({ axes: [0.42, -0.7, 0, 0] })]);
    source = new GamepadSource();

    const snapshot = source.poll(DEFAULT_TUNING);
    expect(snapshot.leftStickX).toBeCloseTo(0.42, 10);
    expect(snapshot.leftStickY).toBeCloseTo(-0.7, 10);
  });
});
