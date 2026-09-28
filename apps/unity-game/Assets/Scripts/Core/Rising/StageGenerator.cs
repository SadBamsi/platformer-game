using System;
using System.Collections.Generic;
using AgenticGame.Game;

namespace AgenticGame.Rising
{
    /// <summary>Этап: путь снизу вверх без земли и без выхода (они отдельно).</summary>
    public sealed class Stage
    {
        public int N;
        /// <summary>H(n), ряды. Потолок мира — на ряду H − 1.</summary>
        public int HeightRows;
        /// <summary>Ширина всех обычных платформ этапа, блоки.</summary>
        public int PlatformWidth;
        public List<PlatformSpec> Platforms;
        /// <summary>Левый край зоны спавна на земле, блоки.</summary>
        public double SpawnX;
        /// <summary>Платформа выхода — на ней стоит дом.</summary>
        public PlatformSpec Exit;
    }

    /// <summary>
    /// Процедурный seeded-генератор этапов — порт
    /// apps/game/src/game/rising/stageGenerator.ts (правила —
    /// apps/game/docs/rising-water.md, разделы 4 и 5). Seed = номер этапа, и
    /// порт повторяет TS-версию до порядка вызовов генератора случайных чисел,
    /// поэтому этапы совпадают с Phaser-версией (StageGeneratorTests сверяет
    /// с выгрузкой из неё).
    ///
    /// Путь петляет по всей ширине мира к дальним целям; каждый новый шаг
    /// проверяется аналитическими правилами 4.1–4.3 и симуляцией прыжка,
    /// включая перепроверку уже построенных прыжков ниже.
    /// </summary>
    public static class StageGenerator
    {
        public const double SpawnZoneWidth = 2;
        public const double SpawnX = 2;

        private const double RunUpZoneMinWidth = 2;
        private const double CeilingOverBRows = 1.5 + 0.5;
        private static readonly double FlightCorridorRows = JumpReach.HApexRows + 0.5;
        private static readonly double DyHardMax = JumpReach.HApexRows - 0.1;
        private const int ExitZoneRows = 3;
        /// <summary>Запас под потолком мира над выходом: прыжок к выходу + рост игрока + запас.</summary>
        private static readonly int TopHeadroomRows =
            (int)Math.Ceiling(JumpReach.HApexRows - Difficulty.DyMinRows + 1.5 + 0.5);
        private const int RecheckDepthRows = 10;
        private const double TargetReachedBlocks = 3;
        private const int GridColumns = GameDimensions.GridColumns;

        public static double ExitZoneMaxRow(int heightRows) => heightRows - 1 - TopHeadroomRows;

        public static double ExitZoneMinRow(int heightRows) => ExitZoneMaxRow(heightRows) - (ExitZoneRows - 1);

        /// <summary>Верхняя граница мира как препятствие: «платформа» во всю ширину, низ на ряду H − 1.</summary>
        private static PlatformSpec WorldCeiling(int heightRows) =>
            new PlatformSpec(-1, heightRows, GridColumns + 2);

        private static double OverlapLength(double x1, double w1, double x2, double w2) =>
            Math.Max(0, Math.Min(x1 + w1, x2 + w2) - Math.Max(x1, x2));

        private static bool RangesOverlap(double x1, double w1, double x2, double w2) =>
            OverlapLength(x1, w1, x2, w2) > 0;

        private static double Clamp(double value, double min, double max) => Math.Min(max, Math.Max(min, value));

        /// <summary>Правила 4.1–4.3 для перехода A→B. null — переход допустим, иначе причина.</summary>
        private static string CheckTransition(PlatformSpec a, PlatformSpec b, IReadOnlyList<PlatformSpec> others)
        {
            double dy = b.Row - a.Row;
            if (dy <= 0) return $"B (ряд {b.Row}) не выше A (ряд {a.Row})";
            if (dy > DyHardMax) return $"dy={dy:0.00} выше физического предела {DyHardMax:0.00}";

            double rightD = b.X + 0.5 - (a.X + a.Width - 0.5);
            double leftD = a.X + 0.5 - (b.X + b.Width - 0.5);
            bool goingRight = rightD >= leftD;
            double xTakeoff = goingRight ? a.X + a.Width - 0.5 : a.X + 0.5;
            double xLand = goingRight ? b.X + 0.5 : b.X + b.Width - 0.5;
            double d = goingRight ? rightD : leftD;

            // 4.1: свободная от B часть A не уже 2 блоков.
            double freeWidth = a.Width - OverlapLength(a.X, a.Width, b.X, b.Width);
            if (freeWidth < RunUpZoneMinWidth) return $"зона разбега на A всего {freeWidth:0.00} блока";

            // 4.2a: ничего не нависает над B ниже роста игрока.
            foreach (PlatformSpec p in others)
            {
                if (p.Row > b.Row && p.Row <= b.Row + CeilingOverBRows && RangesOverlap(p.X, p.Width, b.X, b.Width))
                {
                    return $"платформа на ряду {p.Row} нависает над B";
                }
            }

            // 4.2b: коридор полёта A→B свободен.
            double corridorMinX = Math.Min(xTakeoff, xLand);
            double corridorMaxX = Math.Max(xTakeoff, xLand);
            foreach (PlatformSpec p in others)
            {
                if (p.Row > a.Row && p.Row <= a.Row + FlightCorridorRows &&
                    RangesOverlap(p.X, p.Width, corridorMinX, corridorMaxX - corridorMinX))
                {
                    return $"платформа на ряду {p.Row} перекрывает коридор полёта";
                }
            }

            // 4.3: дальность в безопасном окне.
            (double min, double max) = JumpReach.SafeReachRange(dy);
            if (d < min || d > max) return $"дальность {d:0.00} вне [{min:0.00}, {max:0.00}]";

            return null;
        }

        /// <summary>Проверяет весь этап: каждое звено пути и положение выхода. null — этап проходим.</summary>
        public static string ValidateStage(Stage stage)
        {
            var exit = new PlatformSpec(stage.Exit.X, stage.Exit.Row, stage.Exit.Width);
            var spawnZone = new PlatformSpec(stage.SpawnX, 0, SpawnZoneWidth);
            var allObstacles = new List<PlatformSpec>(stage.Platforms) { exit };
            var chain = new List<PlatformSpec> { spawnZone };
            chain.AddRange(stage.Platforms);
            chain.Add(exit);

            for (int i = 0; i < chain.Count - 1; i++)
            {
                PlatformSpec a = chain[i];
                PlatformSpec b = chain[i + 1];
                List<PlatformSpec> others = allObstacles.FindAll(p => !ReferenceEquals(p, a) && !ReferenceEquals(p, b));
                string reason = CheckTransition(a, b, others);
                if (reason != null) return $"звено {i} (ряд {a.Row}→{b.Row}): {reason}";

                var withCeiling = new List<PlatformSpec>(allObstacles) { WorldCeiling(stage.HeightRows) };
                if (!JumpSimulator.CanReach(a, b, withCeiling))
                {
                    return $"звено {i} (ряд {a.Row}→{b.Row}): симуляция прыжка не долетает до B";
                }
            }

            double zoneMin = ExitZoneMinRow(stage.HeightRows);
            double zoneMax = ExitZoneMaxRow(stage.HeightRows);
            if (stage.Exit.Row < zoneMin || stage.Exit.Row > zoneMax)
            {
                return $"выход (ряд {stage.Exit.Row}) вне верхней зоны [{zoneMin}, {zoneMax}]";
            }
            return null;
        }

        /// <summary>
        /// Подбирает следующую платформу из A в сторону side (до 60 случайных
        /// попыток). minRow/maxRow — только для шага к выходу.
        /// </summary>
        private static PlatformSpec PickStep(PlatformSpec a, double platformWidth, int side, SeededRandom rng,
            IReadOnlyList<PlatformSpec> existing, double? minRow, double? maxRow,
            Func<PlatformSpec, bool> verify)
        {
            const int localAttempts = 60;
            for (int i = 0; i < localAttempts; i++)
            {
                double dy;
                if (minRow.HasValue && maxRow.HasValue)
                {
                    double targetRow = minRow.Value + rng.Next() * (maxRow.Value - minRow.Value);
                    dy = targetRow - a.Row;
                    if (dy < Difficulty.DyMinRows || dy > Difficulty.DyMaxRows) continue;
                }
                else
                {
                    dy = Difficulty.DyMinRows + rng.Next() * (Difficulty.DyMaxRows - Difficulty.DyMinRows);
                }

                (double min, double max) = JumpReach.SafeReachRange(dy);
                if (max <= min) continue;
                double d = min + rng.Next() * (max - min);
                double bRow = a.Row + dy;

                double bx;
                if (side == 1)
                {
                    double xTakeoff = a.X + a.Width - 0.5;
                    double xLand = xTakeoff + d;
                    bx = xLand - 0.5;
                }
                else
                {
                    double xTakeoff = a.X + 0.5;
                    double xLand = xTakeoff - d;
                    bx = xLand - platformWidth + 0.5;
                }
                bx = Clamp(bx, 0, GridColumns - platformWidth);

                var candidate = new PlatformSpec(bx, bRow, platformWidth);
                if (CheckTransition(a, candidate, existing) == null && (verify == null || verify(candidate)))
                {
                    return candidate;
                }
            }
            return null;
        }

        /// <summary>
        /// Кандидат проходит, если до него можно допрыгнуть с последней
        /// платформы и он не ломает уже построенные прыжки ниже.
        /// </summary>
        private static Func<PlatformSpec, bool> MakeVerifier(List<PlatformSpec> chain, List<PlatformSpec> platforms,
            int heightRows)
        {
            return candidate =>
            {
                var withCandidate = new List<PlatformSpec>(platforms) { candidate, WorldCeiling(heightRows) };
                PlatformSpec current = chain[chain.Count - 1];
                if (!JumpSimulator.CanReach(current, candidate, withCandidate)) return false;
                for (int i = chain.Count - 2; i >= 0; i--)
                {
                    PlatformSpec a = chain[i];
                    if (a.Row < candidate.Row - RecheckDepthRows) break;
                    if (!JumpSimulator.CanReach(a, chain[i + 1], withCandidate)) return false;
                }
                return true;
            };
        }

        /// <summary>Цель для центра платформы на противоположной половине мира.</summary>
        private static double PickFarTarget(double fromCenterX, double platformWidth, SeededRandom rng)
        {
            double minCenter = platformWidth / 2;
            double maxCenter = GridColumns - platformWidth / 2;
            double mid = GridColumns / 2.0;
            double lo = fromCenterX < mid ? mid + 4 : minCenter;
            double hi = fromCenterX < mid ? maxCenter : mid - 4;
            return lo + rng.Next() * Math.Max(0, hi - lo);
        }

        /// <summary>Один проход построения снизу вверх. null — сорвался подбор шага.</summary>
        private static Stage GeneratePath(int n, int heightRows, int platformWidth, SeededRandom rng)
        {
            var platforms = new List<PlatformSpec>();
            var spawnZone = new PlatformSpec(SpawnX, 0, SpawnZoneWidth);
            var chain = new List<PlatformSpec> { spawnZone };
            PlatformSpec current = spawnZone;
            int side = 1;
            double targetCenterX = PickFarTarget(spawnZone.CenterX, platformWidth, rng);

            double topZoneMin = ExitZoneMinRow(heightRows);
            double topZoneMax = ExitZoneMaxRow(heightRows);
            int maxSteps = (int)Math.Ceiling(heightRows / Difficulty.DyMinRows) + 10;
            int steps = 0;

            while (current.Row + Difficulty.DyMaxRows < topZoneMin)
            {
                if (steps >= maxSteps) return null;
                steps += 1;

                if (Math.Abs(current.CenterX - targetCenterX) < TargetReachedBlocks)
                {
                    targetCenterX = PickFarTarget(current.CenterX, platformWidth, rng);
                }
                side = targetCenterX >= current.CenterX ? 1 : -1;

                Func<PlatformSpec, bool> verify = MakeVerifier(chain, platforms, heightRows);
                PlatformSpec step = PickStep(current, platformWidth, side, rng, platforms, null, null, verify);
                int actualSide = side;
                if (step == null)
                {
                    actualSide = -side;
                    step = PickStep(current, platformWidth, actualSide, rng, platforms, null, null, verify);
                }
                if (step == null) return null;

                platforms.Add(step);
                chain.Add(step);
                current = step;
                side = actualSide;
            }

            double exitMin = Math.Max(topZoneMin, current.Row + Difficulty.DyMinRows);
            double exitMax = Math.Min(topZoneMax, current.Row + Difficulty.DyMaxRows);
            Func<PlatformSpec, bool> verifyExit = MakeVerifier(chain, platforms, heightRows);
            PlatformSpec exitStep = PickStep(current, platformWidth, side, rng, platforms, exitMin, exitMax, verifyExit)
                ?? PickStep(current, platformWidth, -side, rng, platforms, exitMin, exitMax, verifyExit);
            if (exitStep == null) return null;

            return new Stage
            {
                N = n,
                HeightRows = heightRows,
                PlatformWidth = platformWidth,
                Platforms = platforms,
                SpawnX = SpawnX,
                Exit = new PlatformSpec(exitStep.X, exitStep.Row, exitStep.Width),
            };
        }

        /// <summary>
        /// Этап n (seed = n): всегда один и тот же. При нарушении правил
        /// перестраивает тем же генератором случайных чисел, до maxAttempts раз.
        /// </summary>
        public static Stage Generate(int n, int maxAttempts = 20000)
        {
            if (n < 1) throw new ArgumentOutOfRangeException(nameof(n), n, "номер этапа должен быть >= 1");

            int heightRows = Difficulty.StageHeightRows(n);
            // Округление как Math.round в JS (половина — вверх), а не банковское.
            int platformWidth = (int)Math.Floor(Difficulty.PlatformWidthBlocks(n) + 0.5);
            var rng = new SeededRandom((uint)n);

            for (int attempt = 0; attempt < maxAttempts; attempt++)
            {
                Stage candidate = GeneratePath(n, heightRows, platformWidth, rng);
                if (candidate != null && ValidateStage(candidate) == null) return candidate;
            }
            throw new InvalidOperationException(
                $"StageGenerator: не удалось построить проходимый этап {n} за {maxAttempts} попыток");
        }
    }
}
