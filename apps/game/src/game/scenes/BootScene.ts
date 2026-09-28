import Phaser from 'phaser';

/**
 * Самая первая сцена: место для будущей загрузки конфигов/фичефлагов до
 * основного preload. Сейчас сразу передаёт эстафету PreloadScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scale.refresh();
    this.scene.start('PreloadScene');
  }
}
