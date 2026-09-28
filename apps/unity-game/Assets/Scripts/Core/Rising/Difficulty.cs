using System;

namespace AgenticGame.Rising
{
    /// <summary>
    /// Кривая сложности — порт apps/game/src/game/rising/difficulty.ts
    /// (обоснования — apps/game/docs/rising-water.md, разделы 2.1 и 5).
    /// </summary>
    public static class Difficulty
    {
        /// <summary>
        /// Вода включена в Unity-версии (решение пользователя 24.09.2026).
        /// В Phaser-версии она пока выключена флагом WATER_ENABLED.
        /// </summary>
        public static readonly bool WaterEnabled = true;

        /// <summary>Задержка перед началом подъёма воды, с (rising-water.md §2.3).</summary>
        public const double WaterStartDelaySeconds = 3;

        /// <summary>Диапазон вертикального шага между платформами, ряды.</summary>
        public const double DyMinRows = 2;
        public const double DyMaxRows = 4;

        /// <summary>H(n): 60 рядов до этапа 10, дальше +4 за этап, потолок 120.</summary>
        public static int StageHeightRows(int n)
        {
            if (n <= 10) return 60;
            return Math.Min(120, 60 + 4 * (n - 10));
        }

        /// <summary>T(n): время подъёма воды на всю высоту этапа — 120 с на этапе 1, 60 с с этапа 10.</summary>
        public static double WaterRiseSeconds(int n)
        {
            return Math.Max(60, 120 - ((n - 1) * 60.0) / 9);
        }

        /// <summary>Скорость воды H(n)/T(n), ряд/с.</summary>
        public static double WaterSpeedRowsPerSec(int n)
        {
            return StageHeightRows(n) / WaterRiseSeconds(n);
        }

        /// <summary>width(n): от 6 блоков (этап 1) до 3 (этап 10), дальше 3.</summary>
        public static double PlatformWidthBlocks(int n)
        {
            if (n <= 10) return Math.Max(3, 6 - ((n - 1) * 3.0) / 9);
            return 3;
        }
    }
}
