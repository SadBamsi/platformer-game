using UnityEngine;

namespace AgenticGame.Game
{
    /// <summary>
    /// Параллакс-фон — порт apps/game/src/game/entities/ParallaxBackground.ts.
    ///
    /// Небо — ступенчатый ночной градиент (8 полос), растянутый на весь кадр и
    /// прикреплённый к камере. Звёзды и два слоя облаков — плитки 256×256
    /// (bg_*.png, растр тех же SVG), 8 пикселей рисунка на блок, как в Phaser:
    /// одна плитка = 32×32 блока.
    ///
    /// Каждый слой — SpriteRenderer в режиме Tiled высотой в две плитки. Он
    /// едет за камерой, а внутри плитки сдвигается на scrollFactor · cameraY
    /// по модулю высоты плитки — так слой бесконечен по вертикали при любой
    /// высоте этапа.
    ///
    /// Позиция считается после CameraFollow (порядок выполнения 100 &gt; 0),
    /// иначе фон отставал бы от уровня на кадр.
    /// </summary>
    [DefaultExecutionOrder(100)]
    public sealed class ParallaxBackground : MonoBehaviour
    {
        private const int BackgroundPixelsPerUnit = 8;
        private const float TileUnits = 256f / BackgroundPixelsPerUnit;
        private const int BaseSortingOrder = -40;

        /// <summary>Слои: имя текстуры и доля скорости камеры (0 — стоит, 1 — едет с уровнем).</summary>
        private static readonly (string name, float scrollFactor)[] Layers =
        {
            ("bg_stars", 0.05f),
            ("bg_clouds_far", 0.2f),
            ("bg_clouds_near", 0.5f),
        };

        /// <summary>Полосы неба сверху вниз (SKY_BANDS из Phaser-версии).</summary>
        private static readonly Color32[] SkyBands =
        {
            new(0x0b, 0x0e, 0x1f, 0xff), new(0x0d, 0x11, 0x24, 0xff),
            new(0x10, 0x14, 0x2a, 0xff), new(0x12, 0x17, 0x30, 0xff),
            new(0x14, 0x1a, 0x36, 0xff), new(0x17, 0x1d, 0x3c, 0xff),
            new(0x1a, 0x21, 0x44, 0xff), new(0x1c, 0x24, 0x50, 0xff),
        };

        private Transform _camera;
        private Transform _sky;
        private Transform[] _layers;

        public static ParallaxBackground Create(Camera camera)
        {
            var background = new GameObject("ParallaxBackground").AddComponent<ParallaxBackground>();
            background._camera = camera.transform;
            background.Build();
            background.LateUpdate();
            return background;
        }

        private void Build()
        {
            _sky = CreateSky().transform;

            _layers = new Transform[Layers.Length];
            for (int i = 0; i < Layers.Length; i++)
            {
                Sprite tile = PixelSprites.Single(Layers[i].name, BackgroundPixelsPerUnit, new Vector2(0.5f, 0.5f));
                var layer = new GameObject(Layers[i].name);
                layer.transform.SetParent(transform, false);

                var renderer = layer.AddComponent<SpriteRenderer>();
                renderer.sprite = tile;
                renderer.drawMode = SpriteDrawMode.Tiled;
                // Ширина = ширина кадра, высота = две плитки: кадр (18 блоков)
                // закрыт при любом сдвиге внутри плитки (0..32 блока).
                renderer.size = new Vector2(GameDimensions.GridColumns, TileUnits * 2f);
                renderer.sortingOrder = BaseSortingOrder + i + 1;
                _layers[i] = layer.transform;
            }
        }

        /// <summary>Небо: текстура 1×8 (по пикселю на полосу), растянутая на кадр.</summary>
        private GameObject CreateSky()
        {
            var texture = new Texture2D(1, SkyBands.Length, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = "SkyBands",
            };
            // У текстуры строка 0 — нижняя, а полосы заданы сверху вниз.
            for (int i = 0; i < SkyBands.Length; i++)
            {
                texture.SetPixel(0, SkyBands.Length - 1 - i, SkyBands[i]);
            }
            texture.Apply();

            Sprite sprite = Sprite.Create(texture, new Rect(0, 0, 1, SkyBands.Length), new Vector2(0.5f, 0.5f), 1f,
                0, SpriteMeshType.FullRect);

            var sky = new GameObject("Sky");
            sky.transform.SetParent(transform, false);
            sky.transform.localScale = new Vector3(GameDimensions.GridColumns,
                (float)GameDimensions.GridRows / SkyBands.Length, 1f);
            var renderer = sky.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;
            renderer.sortingOrder = BaseSortingOrder;
            return sky;
        }

        private void LateUpdate()
        {
            if (_camera == null) return;
            Vector3 camera = _camera.position;
            _sky.position = new Vector3(camera.x, camera.y, 0f);

            for (int i = 0; i < _layers.Length; i++)
            {
                // Слой смещается относительно камеры на -scrollFactor · cameraY;
                // берём остаток от высоты плитки, чтобы сдвиг не рос бесконечно.
                float shift = Mathf.Repeat(camera.y * Layers[i].scrollFactor, TileUnits);
                float offset = TileUnits / 2f - shift;
                // Ровно по пикселю кадра (1/32 блока): пиксели фона не дрожат.
                offset = Mathf.Round(offset * GameDimensions.PixelsPerUnit) / GameDimensions.PixelsPerUnit;
                _layers[i].position = new Vector3(camera.x, camera.y + offset, 0f);
            }
        }
    }
}
