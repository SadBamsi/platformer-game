import Phaser from 'phaser';
import type { InputManager } from '@/game/input';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  PLAYER_FRAME_WIDTH_PX,
  PLAYER_HITBOX_HEIGHT_PX,
  PLAYER_HITBOX_OFFSET_X_PX,
  PLAYER_HITBOX_OFFSET_Y_PX,
  PLAYER_HITBOX_WIDTH_PX,
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  PLAYER_MOVE_SPEED_BLOCKS_PER_SEC,
} from '@/game/dimensions';

/**
 * Во сколько раз обрезается вертикальная скорость при раннем отпускании JUMP
 * (variable jump height). Реагирует на СЫРОЙ justReleased — см. README слоя ввода.
 */
const JUMP_CUT_MULTIPLIER = 0.5;

/**
 * Игрок — физический спрайт на сгенерированной прямоугольной текстуре
 * (см. PreloadScene.generateRectTexture).
 *
 * Coyote time и jump buffering НЕ реализуются здесь — этим занимается
 * InputManager: state.justPressed('JUMP') уже прощающий (см. src/game/input/README.md,
 * раздел «Coyote time и jump buffer»). Дублировать эту логику в Player нельзя —
 * получится двойное прощение (окно открывается дважды подряд).
 * Единственное, что Player обязан отдавать наружу — актуальное «на земле ли
 * сейчас» через isGrounded(), которое PlatformerScene передаёт в
 * inputManager.setGrounded() КАЖДЫЙ кадр ДО inputManager.update().
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'girl-sprite', '0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setBounce(0.05, 0);
  }

  resizeForGrid(blockWidth: number, blockHeight: number): void {
    this.setDisplaySize(blockWidth, blockHeight * 1.5);

    // Body.setSize() (physics/arcade/Body.js) трактует width/height как
    // размеры в ИСХОДНЫХ пикселях кадра и сам умножает их на scaleX/scaleY
    // спрайта, выставленные строкой выше через setDisplaySize. Поэтому сюда
    // передаются пиксели кадра (dimensions.ts), а не уже смасштабированные
    // блоки — иначе хитбокс масштабировался бы дважды (level-design.md, 5.3).
    // Хитбокс — не весь кадр, а ноги и корпус девочки (dimensions.ts,
    // PLAYER_HITBOX_*): иначе пустые поля кадра цепляются за край платформы.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_HITBOX_WIDTH_PX, PLAYER_HITBOX_HEIGHT_PX, false);
    this.applyHitboxOffset();
  }

  /**
   * Смещение хитбокса в пикселях кадра (Body сам умножает его на масштаб).
   * При отражении картинки влево ноги оказываются зеркально — сдвигаем и
   * хитбокс, иначе он уедет с ног на пустое поле кадра.
   */
  private applyHitboxOffset(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const offsetX = this.flipX
      ? PLAYER_FRAME_WIDTH_PX - PLAYER_HITBOX_OFFSET_X_PX - PLAYER_HITBOX_WIDTH_PX
      : PLAYER_HITBOX_OFFSET_X_PX;
    body.setOffset(offsetX, PLAYER_HITBOX_OFFSET_Y_PX);
  }

  /** Стоит ли игрок на земле прямо сейчас — источник для inputManager.setGrounded(). */
  isGrounded(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    return body.blocked.down || body.touching.down;
  }

  override update(inputManager: InputManager): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const { state } = inputManager;

    const blockWidth = this.scene.scale.width / GRID_COLUMNS;
    const blockHeight = this.scene.scale.height / GRID_ROWS;
    const moveSpeed = blockWidth * PLAYER_MOVE_SPEED_BLOCKS_PER_SEC;
    const jumpVelocity = -(blockHeight * PLAYER_JUMP_VELOCITY_COEFFICIENT);

    body.setVelocityX(state.moveX * moveSpeed);

    if (!this.isGrounded()) {
      this.play(body.velocity.y < 0 ? "girl-jump" : "girl-fall", true);
    } else if (state.moveX !== 0) {
      this.play("girl-run", true);
    } else {
      this.play("girl-idle", true);
    }

    const wasFlipped = this.flipX;
    if (state.moveX < 0) this.setFlipX(true);
    if (state.moveX > 0) this.setFlipX(false);
    if (this.flipX !== wasFlipped) this.applyHitboxOffset();

    // justPressed('JUMP') уже включает coyote time + jump buffering слоя ввода.
    if (state.justPressed('JUMP')) {
      body.setVelocityY(jumpVelocity);
      this.scene.sound.play("jump-sound");
    }

    // Variable jump height: обрезаем скорость по РЕАЛЬНОМУ отпусканию кнопки,
    // а не по буферизованной логике прыжка — поэтому здесь justReleased, не justPressed.
    if (state.justReleased('JUMP') && body.velocity.y < 0) {
      body.setVelocityY(body.velocity.y * JUMP_CUT_MULTIPLIER);
    }
  }
}
