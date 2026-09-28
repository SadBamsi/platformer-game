import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardSource } from '@/game/input/KeyboardSource';

describe('KeyboardSource', () => {
  let source: KeyboardSource;

  afterEach(() => {
    source?.detach();
  });

  it('attach()/poll() отражают нажатую клавишу как соответствующее действие', () => {
    source = new KeyboardSource();
    source.attach();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(source.poll().actionDown.MOVE_LEFT).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    expect(source.poll().actionDown.MOVE_LEFT).toBe(false);
  });

  it('потеря фокуса окна (blur) очищает все зажатые клавиши — защита от "залипания" без keyup', () => {
    source = new KeyboardSource();
    source.attach();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(source.poll().actionDown.JUMP).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(source.poll().actionDown.JUMP).toBe(false);
  });

  it('detach() тоже очищает зажатые клавиши', () => {
    source = new KeyboardSource();
    source.attach();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    source.detach();
    source.attach();
    expect(source.poll().actionDown.JUMP).toBe(false);
  });

  it('detach() идемпотентен', () => {
    source = new KeyboardSource();
    expect(() => source.detach()).not.toThrow();
    source.attach();
    expect(() => source.detach()).not.toThrow();
    expect(() => source.detach()).not.toThrow();
  });

  it('игнорирует keydown, если фокус находится в текстовом поле (input)', () => {
    source = new KeyboardSource();
    source.attach();

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
    Object.defineProperty(event, 'target', { value: input });
    window.dispatchEvent(event);

    expect(source.poll().actionDown.JUMP).toBe(false);

    document.body.removeChild(input);
  });

  it('Escape одновременно активирует PAUSE и CANCEL', () => {
    source = new KeyboardSource();
    source.attach();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const state = source.poll().actionDown;
    expect(state.PAUSE).toBe(true);
    expect(state.CANCEL).toBe(true);
  });
});
