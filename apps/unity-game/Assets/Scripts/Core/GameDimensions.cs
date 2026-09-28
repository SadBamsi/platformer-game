namespace AgenticGame.Game
{
    /// <summary>
    /// Числа игры, перенесённые из Phaser-версии (apps/game/src/game/dimensions.ts,
    /// apps/game/src/game/input/tuning.ts). В Unity 1 блок = 1 единица мира,
    /// поэтому коэффициенты «при blockHeight» здесь — просто значения в единицах.
    ///
    /// Высота прыжка h = v²/(2g) = 25²/(2·62.5) = 5 блоков, подъём t = v/g = 0.4 с
    /// (apps/game/docs/level-design.md, раздел 2.3). Меняются только вместе.
    /// </summary>
    public static class GameDimensions
    {
        /// <summary>Видимая область: 32×18 блоков.</summary>
        public const int GridColumns = 32;
        public const int GridRows = 18;

        /// <summary>Пикселей спрайта девочки на блок (кадр 32×48 = 1×1.5 блока).</summary>
        public const int PixelsPerUnit = 32;

        /// <summary>Гравитация, блок/с².</summary>
        public const float Gravity = 62.5f;
        /// <summary>Начальная скорость прыжка, блок/с.</summary>
        public const float JumpVelocity = 25f;
        /// <summary>Скорость бега, блок/с (220/32 из Phaser-версии).</summary>
        public const float MoveSpeed = 220f / 32f;
        /// <summary>Во сколько раз режется скорость подъёма при раннем отпускании прыжка.</summary>
        public const float JumpCutMultiplier = 0.5f;

        /// <summary>Прыжок ещё засчитывается столько секунд после схода с края.</summary>
        public const float CoyoteTime = 0.10f;
        /// <summary>Нажатие прыжка до приземления запоминается на столько секунд.</summary>
        public const float JumpBufferTime = 0.12f;

        /// <summary>
        /// Шаг физики. Числа прыжка подбирались под 60 Гц (Arcade Physics), а у Unity
        /// по умолчанию 50 Гц — выставляется при старте (GameBootstrap).
        /// </summary>
        public const float FixedTimestep = 1f / 60f;

        /// <summary>
        /// Хитбокс в пикселях кадра 32×48 (как PLAYER_HITBOX_* в dimensions.ts):
        /// ноги и корпус девочки, а не весь кадр — иначе пустые поля кадра
        /// цепляются за край платформы.
        /// </summary>
        public const int FrameWidthPx = 32;
        public const int FrameHeightPx = 48;
        public const int HitboxWidthPx = 12;
        public const int HitboxHeightPx = 42;
        /// <summary>Левый край хитбокса в кадре, когда девочка смотрит вправо.</summary>
        public const int HitboxOffsetXPx = 13;

        public const float HitboxWidth = (float)HitboxWidthPx / PixelsPerUnit;
        public const float HitboxHeight = (float)HitboxHeightPx / PixelsPerUnit;

        /// <summary>
        /// На сколько центр кадра левее центра хитбокса, когда девочка смотрит
        /// вправо: центр хитбокса 13 + 12/2 = 19, центр кадра 16 → 3 пикселя.
        /// </summary>
        public const float SpriteOffsetX =
            (FrameWidthPx / 2f - (HitboxOffsetXPx + HitboxWidthPx / 2f)) / PixelsPerUnit;
    }
}
