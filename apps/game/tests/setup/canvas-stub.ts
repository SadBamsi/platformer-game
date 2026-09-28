/**
 * jsdom не реализует HTMLCanvasElement.getContext() без нативного пакета
 * `canvas` (не установлен в этом проекте — см. комментарий в
 * vitest.config.ts: "нет WebGL в jsdom"). Проблема шире, чем WebGL:
 * ПРОСТО импорт пакета `phaser` (`import Phaser from 'phaser'`) выполняет на
 * верхнем уровне модуля `device/CanvasFeatures.js` → `checkInverseAlpha()`,
 * который синхронно создаёт canvas, зовёт `getContext('2d')` и сразу пишет
 * в `context.fillStyle` — без стаба это падает с TypeError ДО того, как
 * тестируемый код вообще выполнится, независимо от того, инстанцируем ли мы
 * реальную Phaser.Scene (см. отчёт волны 3, раздел про ограничения окружения).
 *
 * Этот файл — минимальный fake CanvasRenderingContext2D, достаточный, чтобы
 * cам факт импорта `phaser` не падал в jsdom. Ни рендеринг, ни WebGL этим
 * НЕ включаются — тесты, использующие этот стаб, по-прежнему не проверяют
 * визуальный вывод (для этого — браузерная верификация в отчёте волны 3).
 *
 * Импортировать ПЕРВОЙ строкой (до любого импорта, транзитивно тянущего
 * 'phaser') в тестовых файлах, которым нужен доступ к prototype-методам
 * классов, наследующих Phaser.Scene/Sprite.
 */

class FakeCanvasRenderingContext2D {
  fillStyle = '';
  strokeStyle = '';
  globalCompositeOperation = 'source-over';
  lineWidth = 1;

  fillRect(): void {}
  clearRect(): void {}
  strokeRect(): void {}
  drawImage(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  setTransform(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  clip(): void {}
  measureText(): { width: number } {
    return { width: 0 };
  }

  getImageData(_x: number, _y: number, w: number, h: number): ImageData {
    return {
      data: new Uint8ClampedArray(4 * Math.max(w, 1) * Math.max(h, 1)),
      width: w,
      height: h,
      colorSpace: 'srgb',
    } as ImageData;
  }

  putImageData(): void {}

  createImageData(w: number, h: number): ImageData {
    return this.getImageData(0, 0, w, h);
  }
}

const canvasProto = globalThis.HTMLCanvasElement?.prototype as
  | (HTMLCanvasElement & { getContext: unknown })
  | undefined;

if (canvasProto) {
  canvasProto.getContext = function (type: string) {
    if (type === '2d') {
      return new FakeCanvasRenderingContext2D();
    }
    // WebGL сознательно не стабится — этот файл существует только чтобы
    // пережить импорт пакета 'phaser', не чтобы имитировать рендер.
    return null;
  } as unknown as typeof canvasProto.getContext;
}

export {};
