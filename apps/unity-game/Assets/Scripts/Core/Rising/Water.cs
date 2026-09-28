using System;

namespace AgenticGame.Rising
{
    /// <summary>
    /// Состояние воды — порт apps/game/src/game/rising/Water.ts. Только время
    /// и уровень, без отрисовки (её делает WaterView). Уровень — в рядах от
    /// верха земли, как у платформ.
    /// </summary>
    public sealed class Water
    {
        /// <summary>Центр игрока на 0.75 ряда выше ног (рост 1.5).</summary>
        private const double PlayerCenterOffsetRows = 0.75;

        public readonly int HeightRows;
        public readonly double SpeedRowsPerSec;
        public readonly double StartDelaySeconds;

        private double _elapsedSeconds;

        public Water(int heightRows, double speedRowsPerSec, double startDelaySeconds)
        {
            HeightRows = heightRows;
            SpeedRowsPerSec = speedRowsPerSec;
            StartDelaySeconds = startDelaySeconds;
        }

        /// <summary>Вода этапа n: высота H(n), скорость H(n)/T(n), старт через 3 с.</summary>
        public static Water ForStage(int n) =>
            new(Difficulty.StageHeightRows(n), Difficulty.WaterSpeedRowsPerSec(n), Difficulty.WaterStartDelaySeconds);

        /// <summary>
        /// Продвигает время на dtSeconds. Ограничивать dt сверху (~0.1 с) —
        /// задача вызывающего: иначе после подвисания вода прыгнет скачком.
        /// </summary>
        public void Update(double dtSeconds)
        {
            _elapsedSeconds += Math.Max(0, dtSeconds);
        }

        /// <summary>Поверхность воды: v·max(0, t − задержка), не выше H.</summary>
        public double SurfaceRow
        {
            get
            {
                double activeSeconds = Math.Max(0, _elapsedSeconds - StartDelaySeconds);
                return Math.Min(HeightRows, Math.Max(0, SpeedRowsPerSec * activeSeconds));
            }
        }

        /// <summary>Утонул, когда вода дошла до центра игрока (нестрогое ≥, как в Phaser).</summary>
        public bool IsDrowned(double footRow) => SurfaceRow >= footRow + PlayerCenterOffsetRows;
    }
}
