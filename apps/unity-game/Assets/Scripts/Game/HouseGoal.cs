using System;
using UnityEngine;

namespace AgenticGame.Game
{
    /// <summary>
    /// Дом-цель — порт apps/game/src/game/rising/goal.ts (housePlacement).
    /// Картинка 32×32 пикселя занимает 3×3 блока; на платформе стоит линия
    /// низа сугроба (y = 29 от верха картинки). Касание засчитывается только
    /// по стенам дома (x 10..22 картинки), высотой 1.5 ряда над платформой.
    ///
    /// О касании сообщает событием Reached (один раз); что делать дальше,
    /// решает StageRunner.
    /// </summary>
    public sealed class HouseGoal : MonoBehaviour
    {
        private const int ImagePixels = 32;
        private const float SizeBlocks = 3f;
        private const int BaselineFromTopPx = 29;
        private const int WallLeftPx = 10;
        private const int WallRightPx = 22;
        private const float TriggerHeightRows = 1.5f;

        public bool IsReached { get; private set; }

        public event Action Reached;

        /// <summary>Ставит дом по центру платформы: left и width — блоки, top — ряд верха платформы.</summary>
        public static HouseGoal Create(Transform parent, float platformLeft, float platformWidth, float platformTop)
        {
            var house = new GameObject("House");
            house.transform.SetParent(parent, false);
            house.transform.position = new Vector3(platformLeft + platformWidth / 2f, platformTop, 0f);

            float pixelsPerUnit = ImagePixels / SizeBlocks;
            var pivot = new Vector2(0.5f, (float)(ImagePixels - BaselineFromTopPx) / ImagePixels);
            var renderer = house.AddComponent<SpriteRenderer>();
            renderer.sprite = PixelSprites.Single("house", pixelsPerUnit, pivot);
            renderer.sortingOrder = -1; // за игроком

            float wallsWidth = (WallRightPx - WallLeftPx) / pixelsPerUnit;
            var trigger = house.AddComponent<BoxCollider2D>();
            trigger.isTrigger = true;
            trigger.size = new Vector2(wallsWidth, TriggerHeightRows);
            trigger.offset = new Vector2(0f, TriggerHeightRows / 2f);

            return house.AddComponent<HouseGoal>();
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if (IsReached || other.GetComponent<PlayerController>() == null) return;
            IsReached = true;
            Reached?.Invoke();
        }
    }
}
