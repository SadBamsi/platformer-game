using UnityEngine;

namespace AgenticGame.Game
{
    /// <summary>
    /// Отрисовка воды (порт drawWater из PlatformerScene.ts): полупрозрачная
    /// толща от низа мира до поверхности и светлая волна по поверхности.
    ///
    /// Волна — пиксельная синусоида в плитке 32×4 пикселя (8 пикселей на
    /// блок, как у фона: период волны 4 блока), повторённая по ширине мира и
    /// бегущая по горизонтали. Текстуры строятся в коде — файлов не нужно.
    /// </summary>
    public sealed class WaterView : MonoBehaviour
    {
        private const int SortingOrder = 10; // над игроком и платформами, как в Phaser
        private const int WavePixelsPerUnit = 8;
        private const int WaveTileWidthPx = 32;
        private const int WaveTileHeightPx = 4;
        private const float WaveLengthBlocks = (float)WaveTileWidthPx / WavePixelsPerUnit;
        private const float WaveSpeedBlocksPerSec = 1.5f;

        private static readonly Color32 BodyColor = new(0x2a, 0x6f, 0x97, 140); // 0.55 непрозрачности
        private static readonly Color32 WaveColor = new(0x8e, 0xca, 0xe6, 217); // 0.85

        private Transform _body;
        private Transform _wave;
        private Texture2D _bodyTexture;
        private Texture2D _waveTexture;

        public static WaterView Create()
        {
            var view = new GameObject("Water").AddComponent<WaterView>();
            view.Build();
            return view;
        }

        private void Build()
        {
            _bodyTexture = NewTexture(1, 1, "WaterBody");
            _bodyTexture.SetPixel(0, 0, Color.white);
            _bodyTexture.Apply();
            var body = new GameObject("Body");
            body.transform.SetParent(transform, false);
            var bodyRenderer = body.AddComponent<SpriteRenderer>();
            // pivot внизу: масштаб по y = высота воды от низа мира.
            bodyRenderer.sprite = Sprite.Create(_bodyTexture, new Rect(0, 0, 1, 1), new Vector2(0.5f, 0f), 1f);
            bodyRenderer.color = BodyColor;
            bodyRenderer.sortingOrder = SortingOrder;
            _body = body.transform;

            _waveTexture = NewTexture(WaveTileWidthPx, WaveTileHeightPx, "WaterWave");
            var pixels = new Color32[WaveTileWidthPx * WaveTileHeightPx];
            for (int x = 0; x < WaveTileWidthPx; x++)
            {
                // Гребень 2 пикселя толщиной, амплитуда 1 пиксель вокруг середины.
                float phase = 2f * Mathf.PI * x / WaveTileWidthPx;
                int y = Mathf.RoundToInt(1f + Mathf.Sin(phase));
                pixels[y * WaveTileWidthPx + x] = Color.white;
                pixels[(y + 1) * WaveTileWidthPx + x] = Color.white;
            }
            _waveTexture.SetPixels32(pixels);
            _waveTexture.Apply();

            var wave = new GameObject("Wave");
            wave.transform.SetParent(transform, false);
            var waveRenderer = wave.AddComponent<SpriteRenderer>();
            waveRenderer.sprite = Sprite.Create(_waveTexture, new Rect(0, 0, WaveTileWidthPx, WaveTileHeightPx),
                new Vector2(0.5f, 0.5f), WavePixelsPerUnit, 0, SpriteMeshType.FullRect);
            waveRenderer.drawMode = SpriteDrawMode.Tiled;
            // На период шире мира: при сдвиге волны края не оголяются.
            waveRenderer.size = new Vector2(GameDimensions.GridColumns + WaveLengthBlocks * 2f,
                (float)WaveTileHeightPx / WavePixelsPerUnit);
            waveRenderer.color = WaveColor;
            waveRenderer.sortingOrder = SortingOrder + 1;
            _wave = wave.transform;
        }

        /// <summary>Рисует воду с поверхностью на ряду surfaceRow; низ мира — y = −1.</summary>
        public void Render(float surfaceRow)
        {
            const float worldBottom = -1f;
            const float ppu = GameDimensions.PixelsPerUnit;
            // Поверхность — по пикселю кадра, чтобы край воды не мерцал.
            float surface = Mathf.Round(surfaceRow * ppu) / ppu;
            float centerX = GameDimensions.GridColumns / 2f;

            _body.position = new Vector3(centerX, worldBottom, 0f);
            _body.localScale = new Vector3(GameDimensions.GridColumns, surface - worldBottom, 1f);

            float shift = Mathf.Repeat(Time.time * WaveSpeedBlocksPerSec, WaveLengthBlocks);
            float waveX = Mathf.Round((centerX - shift) * WavePixelsPerUnit) / WavePixelsPerUnit;
            _wave.position = new Vector3(waveX, surface, 0f);
        }

        private static Texture2D NewTexture(int width, int height, string name)
        {
            return new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = name,
            };
        }

        private void OnDestroy()
        {
            Destroy(_bodyTexture);
            Destroy(_waveTexture);
        }
    }
}
