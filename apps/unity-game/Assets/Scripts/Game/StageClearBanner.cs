using System.Collections.Generic;
using AgenticGame.Ui;
using UnityEngine;

namespace AgenticGame.Game
{
    /// <summary>
    /// Надписи поверх этапа (победа и конец игры). Надпись о победе — порт drawStageClearBanner из
    /// PlatformerScene.ts: полупрозрачное затемнение, «PIERAMOHA!» жёлтым и
    /// «ETAP N PROJDZIENY» белым, у каждой буквы тень на клетку вниз-вправо.
    ///
    /// Строка рисуется в текстуру «1 тексель = 1 клетка шрифта» и
    /// показывается спрайтом, прикреплённым к камере. Размер клетки и
    /// положение — целые пиксели эталонного кадра 1024×576 (Pixel Perfect
    /// Camera), поэтому буквы ровные при любом размере окна.
    /// </summary>
    public sealed class StageClearBanner : MonoBehaviour
    {
        private const int SortingOrder = 100;
        private static readonly Color32 DimColor = new(0x0b, 0x0e, 0x1f, 115); // 0.45 непрозрачности
        private static readonly Color32 ShadowColor = new(0x1d, 0x23, 0x33, 0xff);
        private static readonly Color32 TitleColor = new(0xff, 0xd0, 0x43, 0xff);
        private static readonly Color32 SubtitleColor = new(0xff, 0xff, 0xff, 0xff);
        private static readonly Color32 GameOverColor = new(0xff, 0x6b, 0x6b, 0xff);

        private readonly List<Object> _generated = new();

        public static StageClearBanner Create(Camera camera)
        {
            var banner = new GameObject("StageClearBanner").AddComponent<StageClearBanner>();
            banner.transform.SetParent(camera.transform, false);
            // Камера смотрит вдоль +z с z = −10: надпись ставим в плоскость уровня.
            banner.transform.localPosition = new Vector3(0f, 0f, 10f);
            banner.gameObject.SetActive(false);
            return banner;
        }

        /// <summary>«PIERAMOHA!» и «ETAP N PROJDZIENY».</summary>
        public void ShowStageClear(int stage)
        {
            Show(StageClearText.Title, TitleColor, StageClearText.Subtitle(stage));
        }

        /// <summary>Жизни кончились: «KANIEC HULNI», достигнутый этап и подсказка.</summary>
        public void ShowGameOver(int stage)
        {
            Show(GameOverText.Title, GameOverColor, GameOverText.Subtitle(stage), GameOverText.Hint);
        }

        /// <summary>
        /// Крупный заголовок и строки под ним вдвое мельче, всё по центру кадра.
        /// Как в Phaser: заголовок ~70% ширины кадра.
        /// </summary>
        private void Show(string titleText, Color32 titleColor, params string[] lineTexts)
        {
            Clear();

            const int ppu = GameDimensions.PixelsPerUnit;
            int viewWidth = GameDimensions.GridColumns * ppu;
            int viewHeight = GameDimensions.GridRows * ppu;

            CreateDim();

            PixelTextLayout title = PixelFont.Layout(titleText);
            var lines = new PixelTextLayout[lineTexts.Length];
            for (int i = 0; i < lines.Length; i++) lines[i] = PixelFont.Layout(lineTexts[i]);

            int titleCell = Mathf.Max(2, Mathf.FloorToInt(viewWidth * 0.7f / title.Width));
            int lineCell = Mathf.Max(1, titleCell / 2);
            int titleGap = titleCell * 3;
            int lineGap = lineCell * 3;
            int totalHeight = title.Height * titleCell;
            for (int i = 0; i < lines.Length; i++)
            {
                totalHeight += (i == 0 ? titleGap : lineGap) + lines[i].Height * lineCell;
            }
            int y = Mathf.RoundToInt((viewHeight - totalHeight) / 2f);

            CreateLine("Title", title, titleCell, y, titleColor, viewWidth, viewHeight);
            y += title.Height * titleCell;
            for (int i = 0; i < lines.Length; i++)
            {
                y += i == 0 ? titleGap : lineGap;
                CreateLine($"Line{i}", lines[i], lineCell, y, SubtitleColor, viewWidth, viewHeight);
                y += lines[i].Height * lineCell;
            }

            gameObject.SetActive(true);
        }

        public void Hide()
        {
            gameObject.SetActive(false);
            Clear();
        }

        private void OnDestroy() => Clear();

        /// <summary>Затемнение на весь кадр: белый тексель 1×1, растянутый и перекрашенный.</summary>
        private void CreateDim()
        {
            Texture2D texture = NewTexture(1, 1, "BannerDim");
            texture.SetPixel(0, 0, Color.white);
            texture.Apply();

            SpriteRenderer renderer = NewSprite("Dim", texture, new Vector2(0.5f, 0.5f), 1f);
            renderer.color = DimColor;
            renderer.transform.localScale = new Vector3(GameDimensions.GridColumns, GameDimensions.GridRows, 1f);
        }

        /// <summary>Строка текста; y — верх строки в пикселях кадра от его верхнего края.</summary>
        private void CreateLine(string name, PixelTextLayout layout, int cell, int y, Color32 color,
            int viewWidth, int viewHeight)
        {
            // +1 клетка по ширине и высоте — под тень.
            int width = layout.Width + 1;
            int height = layout.Height + 1;
            Texture2D texture = NewTexture(width, height, $"Banner{name}");
            var pixels = new Color32[width * height];
            // У текстуры строка 0 — нижняя, у раскладки — верхняя.
            foreach ((int x, int cy) in layout.Cells)
            {
                pixels[(height - 1 - (cy + 1)) * width + x + 1] = ShadowColor;
            }
            foreach ((int x, int cy) in layout.Cells)
            {
                pixels[(height - 1 - cy) * width + x] = color;
            }
            texture.SetPixels32(pixels);
            texture.Apply();

            // Центрируем по ширине самого текста (без тени), как в Phaser.
            int left = Mathf.RoundToInt((viewWidth - layout.Width * cell) / 2f);
            const float ppu = GameDimensions.PixelsPerUnit;
            SpriteRenderer renderer = NewSprite(name, texture, new Vector2(0f, 1f), ppu / cell);
            renderer.transform.localPosition = new Vector3((left - viewWidth / 2f) / ppu,
                (viewHeight / 2f - y) / ppu, 0f);
        }

        private Texture2D NewTexture(int width, int height, string name)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = name,
            };
            _generated.Add(texture);
            return texture;
        }

        private SpriteRenderer NewSprite(string name, Texture2D texture, Vector2 pivot, float pixelsPerUnit)
        {
            Sprite sprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), pivot,
                pixelsPerUnit, 0, SpriteMeshType.FullRect);
            _generated.Add(sprite);

            var child = new GameObject(name);
            child.transform.SetParent(transform, false);
            var renderer = child.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;
            renderer.sortingOrder = SortingOrder + transform.childCount;
            return renderer;
        }

        private void Clear()
        {
            foreach (Transform child in transform) Destroy(child.gameObject);
            foreach (Object generated in _generated) Destroy(generated);
            _generated.Clear();
        }
    }
}
