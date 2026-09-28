using System;
using AgenticGame.Game;

namespace AgenticGame.Rising
{
    /// <summary>
    /// Аналитическая дальность прыжка — порт apps/game/src/game/rising/jumpReach.ts
    /// (rising-water.md, раздел 3). Быстрый фильтр генератора; источник правды
    /// о проходимости — JumpSimulator.
    /// </summary>
    public static class JumpReach
    {
        private const double V = GameDimensions.JumpVelocity;
        private const double G = GameDimensions.Gravity;
        private const double RunSpeed = GameDimensions.MoveSpeed;
        private const double TUp = V / G;

        /// <summary>Высота апекса прыжка v²/2g = 5 рядов.</summary>
        public const double HApexRows = V * V / (2 * G);

        /// <summary>dx_max(dy): наибольшая дальность прыжка на высоту dy, блоки.</summary>
        public static double MaxHorizontalReach(double dy)
        {
            double underRoot = Math.Max(0, 2 * (HApexRows - dy) / G);
            return RunSpeed * (TUp + Math.Sqrt(underRoot));
        }

        /// <summary>x_min(dy): где траектория впервые достигает высоты dy, блоки.</summary>
        public static double MinHorizontalReach(double dy)
        {
            double underRoot = Math.Max(0, V * V - 2 * G * dy);
            return RunSpeed * (V - Math.Sqrt(underRoot)) / G;
        }

        /// <summary>Допустимая дистанция D: x_min(dy)+0.05 ≤ D ≤ 0.7·dx_max(dy).</summary>
        public static (double min, double max) SafeReachRange(double dy)
        {
            return (MinHorizontalReach(dy) + 0.05, 0.7 * MaxHorizontalReach(dy));
        }
    }
}
