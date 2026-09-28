using System.Collections.Generic;
using AgenticGame.Game;

namespace AgenticGame.Rising
{
    /// <summary>Тактика прыжка, найденная симулятором.</summary>
    public sealed class JumpStrategy
    {
        /// <summary>Центр игрока в момент прыжка, блоки.</summary>
        public double X0;
        public int Dir;
        /// <summary>Через сколько секунд после прыжка начать бег.</summary>
        public double RunDelay;
        /// <summary>Отпустить бег, когда центр дошёл сюда, блоки.</summary>
        public double StopX;
    }

    /// <summary>
    /// Детерминированная симуляция прыжка A→B — порт
    /// apps/game/src/game/rising/jumpSimulator.ts, источник правды для
    /// проходимости этапа. Все подробности допусков — там.
    ///
    /// Интеграция — semi-implicit Euler с шагом 1/60 с (как Arcade Physics и
    /// Time.fixedDeltaTime в Unity-версии): сначала vy += g·dt, потом y += vy·dt.
    /// Засчитывается только чистый прыжок: любое касание платформы, кроме
    /// приземления на B сверху, — провал.
    /// </summary>
    public static class JumpSimulator
    {
        private const double Dt = 1.0 / 60;
        private const double PlayerHalfWidth = GameDimensions.HitboxWidth / 2.0;
        private const double PlayerHeight = GameDimensions.HitboxHeight;
        private const double PlatformThickness = 1;
        /// <summary>Полный прыжок и прыжок на 5% слабее — тактика должна работать при обоих.</summary>
        private static readonly double[] JumpVelocityVariants = { 1, 0.95 };
        /// <summary>Опоздание с началом бега, с.</summary>
        private const double RunDelayJitter = 0.1;
        private const double TakeoffJitter = 0.25;
        /// <summary>Допуск на точку отрыва в обе стороны: ошибка игрока + проскок при остановке.</summary>
        private const double OvershootJitter = TakeoffJitter + 0.25;
        private const int MaxSteps = 180;
        private const double Eps = 1e-6;
        private const double Gravity = GameDimensions.Gravity;

        private static bool OverlapsBody(double cx, double feet, PlatformSpec p)
        {
            return cx + PlayerHalfWidth > p.X + Eps &&
                   cx - PlayerHalfWidth < p.X + p.Width - Eps &&
                   feet + PlayerHeight > p.Row - PlatformThickness + Eps &&
                   feet < p.Row - Eps;
        }

        private static bool Simulate(PlatformSpec a, PlatformSpec b, List<PlatformSpec> obstacles, double x0,
            int dir, double runDelay, double stopX, double jumpVelocity, double runSpeed)
        {
            double x = x0;
            double feet = a.Row;
            double vy = jumpVelocity;
            double t = 0;

            for (int step = 0; step < MaxSteps; step++)
            {
                t += Dt;

                // Ось X: любое касание боком — провал.
                bool reachedStop = dir == 1 ? x >= stopX : x <= stopX;
                double vx = t >= runDelay && !reachedStop ? dir * runSpeed : 0;
                double nx = x + vx * Dt;
                foreach (PlatformSpec p in obstacles)
                {
                    if (OverlapsBody(nx, feet, p)) return false;
                }
                x = nx;

                // Ось Y: падение на B — успех, на что-то другое или удар головой — провал.
                vy -= Gravity * Dt;
                double nfeet = feet + vy * Dt;
                foreach (PlatformSpec p in obstacles)
                {
                    if (!OverlapsBody(x, nfeet, p)) continue;
                    if (vy < 0) return ReferenceEquals(p, b);
                    return false;
                }
                feet = nfeet;

                if (feet < a.Row - 2) return false;
            }
            return false;
        }

        public static bool CanReach(PlatformSpec a, PlatformSpec b, IReadOnlyList<PlatformSpec> platforms)
        {
            return FindJumpStrategy(a, b, platforms) != null;
        }

        /// <summary>
        /// Перебирает точку отрыва по A, задержку бега и точку остановки над B;
        /// возвращает первую тактику, которая проходит при всех допусках, или null.
        /// </summary>
        public static JumpStrategy FindJumpStrategy(PlatformSpec a, PlatformSpec b,
            IReadOnlyList<PlatformSpec> platforms)
        {
            double minRow = a.Row - 2;
            double maxRow = a.Row + 10;
            var obstacles = new List<PlatformSpec>();
            foreach (PlatformSpec p in platforms)
            {
                if (!ReferenceEquals(p, a) && p.Row >= minRow && p.Row <= maxRow) obstacles.Add(p);
            }
            if (!obstacles.Contains(b)) obstacles.Add(b);
            obstacles.Add(a);

            int dir = b.X + b.Width / 2 >= a.X + a.Width / 2 ? 1 : -1;

            var takeoffs = new List<double>();
            for (double off = PlayerHalfWidth + OvershootJitter;
                 off <= a.Width - PlayerHalfWidth - OvershootJitter + Eps;
                 off += 0.25)
            {
                takeoffs.Add(dir == 1 ? a.X + a.Width - off : a.X + off);
            }
            var stops = new List<double>();
            for (double off = PlayerHalfWidth; off <= b.Width - PlayerHalfWidth + Eps; off += 0.5)
            {
                stops.Add(dir == 1 ? b.X + off : b.X + b.Width - off);
            }

            double runSpeed = GameDimensions.MoveSpeed;
            double[] delayJitters = { 0, RunDelayJitter };
            double[] takeoffJitters = { 0, OvershootJitter, -OvershootJitter };

            foreach (double x0 in takeoffs)
            {
                for (double runDelay = 0; runDelay <= 0.4 + Eps; runDelay += 0.05)
                {
                    foreach (double stopX in stops)
                    {
                        bool robust = true;
                        foreach (double jumpFactor in JumpVelocityVariants)
                        {
                            foreach (double delayJitter in delayJitters)
                            {
                                foreach (double takeoffJitter in takeoffJitters)
                                {
                                    if (!Simulate(a, b, obstacles, x0 - dir * takeoffJitter, dir,
                                            runDelay + delayJitter, stopX,
                                            GameDimensions.JumpVelocity * jumpFactor, runSpeed))
                                    {
                                        robust = false;
                                        break;
                                    }
                                }
                                if (!robust) break;
                            }
                            if (!robust) break;
                        }
                        if (robust)
                        {
                            return new JumpStrategy { X0 = x0, Dir = dir, RunDelay = runDelay, StopX = stopX };
                        }
                    }
                }
            }
            return null;
        }
    }
}
