# Ассеты

Бинарных ассетов (спрайты, звуки, шрифты) в каркасе пока нет — весь визуал
рисуется примитивами Phaser (`Graphics.fillRect` + `generateTexture`, см.
`src/game/scenes/PreloadScene.ts`).

Когда появится арт, сюда лягут:

- `sprites/` — спрайтшиты игрока и врагов (например, `player.png` +
  `player.json` для `this.load.spritesheet` / `this.load.atlas`)
- `tilesets/` — тайлсеты уровней для Tiled (`.png` + `.json`)
- `audio/` — звуки прыжка, сбора монет, музыка фона (`.mp3`/`.ogg`)
- `fonts/` — битмап-шрифты для HUD, если системных будет недостаточно

`PreloadScene.create()` — единственное место, где должна появиться загрузка
этих файлов через `this.load.*`.
