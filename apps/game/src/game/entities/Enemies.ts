import Phaser from "phaser";
import {
  ENEMY_HITBOX_PX,
  ENEMY_KINDS,
  enemyOrigin,
  enemyPose,
  placeEnemies,
  type Enemy,
  type EnemyKind,
} from "@/game/rising/enemies";
import type { Stage } from "@/game/rising/stageGenerator";

/** Кадров в листе врага и скорость их смены, кадр/с (шаг у ходячих, взмах щупалец у Карчка). */
export const ENEMY_FRAME_COUNT = 2;
const ENEMY_ANIMATION_FPS: Record<EnemyKind, number> = { stump: 5, moss: 4, roots: 3 };

/** Шаг физики Arcade по умолчанию (fps 60), секунды: для первой скорости до первого шага. */
const STEP_SECONDS = 1 / 60;

export function enemyTextureKey(kind: EnemyKind): string {
  return `enemy-${kind}`;
}

/**
 * Враги этапа на Arcade Physics (правила и траектории — rising/enemies.ts).
 *
 * Каждый враг — динамическое тело без гравитации и неподвижное для
 * столкновений (immovable): игрок не может его сдвинуть, а сам враг,
 * двигаясь, выталкивает игрока — так он толкает и сталкивает с платформы.
 * Жизнь при этом не отнимается.
 *
 * Двигаем скоростью, а не телепортом: при разделении тел Arcade смотрит на
 * смещение за шаг (Body._dx), и тело, перенесённое setPosition, не толкает
 * стоящего игрока, а застревает в нём. Скорость подбирается так, чтобы за
 * следующий шаг физики тело пришло в точку enemyPose, — путь не «уплывает»
 * от расчётного и одинаков при рестарте и резизе.
 *
 * Считаем на каждом шаге физики (событие WORLD_STEP), а не на кадре
 * отрисовки: физика шагает 60 раз в секунду, а экран бывает 120 Гц. Когда
 * скорость ставилась на кадр в 1/120 с, а тело двигалось на шаг в 1/60 с,
 * враг проскакивал цель вдвое и дёргался туда-обратно — на экране он
 * «двоился» (замечание пользователя 29.09.2026). Часы врагов — сумма шагов
 * физики, поэтому на паузе и после победы (мир на паузе) они стоят сами.
 *
 * С платформами враги не сталкиваются: их путь уже проложен вокруг
 * платформ (Махнач) или по ним (Пнявік), а Карчок летает в пустом ряду.
 */
export class Enemies {
  readonly group: Phaser.Physics.Arcade.Group;
  private readonly members: Array<{ enemy: Enemy; sprite: Phaser.Physics.Arcade.Sprite }>;
  private blockWidth = 1;
  private blockHeight = 1;
  /** Время этапа по часам физики, секунды. */
  private seconds = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    stage: Stage,
    /** Перевод ряда (от земли вверх) в пиксель Y мира — из сцены. */
    private readonly rowToPixelY: (row: number, blockHeight: number) => number,
  ) {
    for (const kind of ENEMY_KINDS) {
      scene.textures.get(enemyTextureKey(kind)).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.group = scene.physics.add.group({ allowGravity: false, immovable: true });
    this.members = placeEnemies(stage).map((enemy) => {
      const origin = enemyOrigin(enemy.kind);
      const sprite = scene.physics.add.sprite(0, 0, enemyTextureKey(enemy.kind), "0");
      sprite.setOrigin(origin.x, origin.y);
      this.group.add(sprite);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      return { enemy, sprite };
    });

    const world = scene.physics.world;
    world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, this.onWorldStep, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, this.onWorldStep, this);
    });
  }

  get count(): number {
    return this.members.length;
  }

  /** Размер блока изменился (старт этапа, резиз окна): масштаб, хитбоксы и позиции заново. */
  layout(blockWidth: number, blockHeight: number): void {
    const seconds = this.seconds;
    this.blockWidth = blockWidth;
    this.blockHeight = blockHeight;
    for (const { enemy, sprite } of this.members) {
      sprite.setDisplaySize(blockWidth, blockHeight);
      // Как у игрока: setSize/setOffset — в пикселях кадра, масштаб Body
      // применяет сам (Body.setSize умножает на scaleX/scaleY спрайта).
      const box = ENEMY_HITBOX_PX[enemy.kind];
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setSize(box.width, box.height, false);
      body.setOffset(box.x, box.y);
      // Точка привязки картинки — центр хитбокса, поэтому позиция спрайта
      // и есть центр тела.
      // body.reset() ставит тело по левому верхнему углу картинки, без
      // смещения хитбокса (Body.reset → getTopLeft); настоящее место тело
      // возьмёт у спрайта на следующем preUpdate. Поэтому первую скорость
      // считаем от расчётной точки, а не от body.center.
      const target = this.targetPx(enemy, seconds);
      body.reset(target.x, target.y);
      this.aim(enemy, body, target, seconds, STEP_SECONDS);
      this.applyPose(enemy, sprite, seconds);
    }
  }

  /** Шаг физики закончился: часы вперёд и скорость на следующий шаг. */
  private onWorldStep(delta: number): void {
    this.seconds += delta;
    for (const { enemy, sprite } of this.members) {
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      this.aim(enemy, body, body.center, this.seconds, delta);
      this.applyPose(enemy, sprite, this.seconds);
    }
  }

  /** Скорость, с которой тело из from за delta секунд придёт в расчётную точку момента seconds + delta. */
  private aim(
    enemy: Enemy,
    body: Phaser.Physics.Arcade.Body,
    from: { x: number; y: number },
    seconds: number,
    delta: number,
  ): void {
    const target = this.targetPx(enemy, seconds + delta);
    body.setVelocity((target.x - from.x) / delta, (target.y - from.y) / delta);
  }

  /** Все враги стоят (этап пройден, пауза). */
  stop(): void {
    for (const { sprite } of this.members) (sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private targetPx(enemy: Enemy, seconds: number): { x: number; y: number } {
    const pose = enemyPose(enemy, seconds);
    return { x: pose.x * this.blockWidth, y: this.rowToPixelY(pose.row, this.blockHeight) };
  }

  private applyPose(enemy: Enemy, sprite: Phaser.Physics.Arcade.Sprite, seconds: number): void {
    const pose = enemyPose(enemy, seconds);
    // Нарисованы лицом влево — вправо отражаем.
    sprite.setFlipX(pose.facingRight);
    sprite.setRotation(pose.rotation);
    const frame = Math.floor(seconds * ENEMY_ANIMATION_FPS[enemy.kind]) % ENEMY_FRAME_COUNT;
    sprite.setFrame(String(frame));
  }
}
