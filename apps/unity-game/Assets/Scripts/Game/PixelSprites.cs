using System.Collections.Generic;
using UnityEngine;

namespace AgenticGame.Game
{
    /// <summary>
    /// Спрайты из Assets/Resources/Sprites (PNG, переведённые из SVG Phaser-версии
    /// ровно по пиксельной сетке). Режем кадры в коде, а не в Sprite Editor, —
    /// тогда нарезка живёт в репозитории и не зависит от ручных настроек импорта.
    /// </summary>
    public static class PixelSprites
    {
        private static readonly Dictionary<string, Sprite[]> Cache = new();

        /// <summary>
        /// Кадры листа слева направо. pivot (0.5, 0) — середина нижнего края:
        /// позиция объекта = точка между ногами.
        /// </summary>
        public static Sprite[] Frames(string name, int frameWidth, int frameHeight, int pixelsPerUnit)
        {
            string key = $"{name}:{frameWidth}x{frameHeight}@{pixelsPerUnit}";
            if (Cache.TryGetValue(key, out Sprite[] cached)) return cached;

            Texture2D texture = Resources.Load<Texture2D>($"Sprites/{name}");
            if (texture == null)
            {
                throw new MissingReferenceException($"PixelSprites: нет текстуры Resources/Sprites/{name}");
            }

            int count = texture.width / frameWidth;
            var frames = new Sprite[count];
            for (int i = 0; i < count; i++)
            {
                frames[i] = Sprite.Create(
                    texture,
                    new Rect(i * frameWidth, 0, frameWidth, frameHeight),
                    new Vector2(0.5f, 0f),
                    pixelsPerUnit,
                    0,
                    SpriteMeshType.FullRect);
                frames[i].name = $"{name}_{i}";
            }
            Cache[key] = frames;
            return frames;
        }

        /// <summary>Картинка целиком одним спрайтом.</summary>
        public static Sprite Single(string name, float pixelsPerUnit, Vector2 pivot)
        {
            string key = $"{name}:single@{pixelsPerUnit}:{pivot}";
            if (Cache.TryGetValue(key, out Sprite[] cached)) return cached[0];

            Texture2D texture = Resources.Load<Texture2D>($"Sprites/{name}");
            if (texture == null)
            {
                throw new MissingReferenceException($"PixelSprites: нет текстуры Resources/Sprites/{name}");
            }

            Sprite sprite = Sprite.Create(
                texture,
                new Rect(0, 0, texture.width, texture.height),
                pivot,
                pixelsPerUnit,
                0,
                SpriteMeshType.FullRect);
            sprite.name = name;
            Cache[key] = new[] { sprite };
            return sprite;
        }
    }
}
