import Phaser from "phaser";

export class Platform {
  readonly blocks: Phaser.Physics.Arcade.Image[];

  constructor(
    private readonly group: Phaser.Physics.Arcade.StaticGroup,
    private readonly textureKey: string,
    readonly widthBlocks: number,
    readonly heightBlocks: number,
  ) {
    this.blocks = Array.from(
      { length: widthBlocks * heightBlocks },
      () => group.create(0, 0, textureKey),
    );
  }

  resize(
    x: number,
    y: number,
    blockWidth: number,
    blockHeight: number,
  ): void {
    this.blocks.forEach((block, index) => {
      const column = index % this.widthBlocks;
      const row = Math.floor(index / this.widthBlocks);
      block.setPosition(
        (x + column + 0.5) * blockWidth,
        (y + row + 0.5) * blockHeight,
      );
      block.setDisplaySize(blockWidth, blockHeight);

      const body = block.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(blockWidth, blockHeight);
      body.updateFromGameObject();
    });
  }
}
