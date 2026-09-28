namespace AgenticGame.Rising
{
    /// <summary>
    /// mulberry32 — порт apps/game/src/game/rising/random.ts. Бит в бит тот же
    /// генератор, что в Phaser-версии: seed = номер этапа, поэтому этап n в
    /// Unity совпадает с этапом n в браузере (проверяет StageGeneratorTests).
    /// Арифметика в uint с переполнением по модулю 2³² = Math.imul и |0 в JS.
    /// </summary>
    public sealed class SeededRandom
    {
        private uint _state;

        public SeededRandom(uint seed)
        {
            _state = seed;
        }

        /// <summary>Следующее число в [0, 1).</summary>
        public double Next()
        {
            unchecked
            {
                _state += 0x6d2b79f5;
                uint t = (_state ^ (_state >> 15)) * (1u | _state);
                t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
    }
}
