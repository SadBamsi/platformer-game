namespace AgenticGame.Rising
{
    /// <summary>
    /// Платформа этапа в единицах сетки: X — левый край в блоках (растёт
    /// вправо), Row — верх (ходибельная поверхность) в рядах от земли (растёт
    /// вверх), толщина 1 ряд. В Unity 1 блок = 1 единица: платформа занимает
    /// y ∈ [Row − 1, Row].
    ///
    /// Класс, а не struct: генератор и симулятор, как и TS-версия, отличают
    /// платформы по ссылке (эта ли платформа — цель B прыжка).
    /// </summary>
    public sealed class PlatformSpec
    {
        public readonly double X;
        public readonly double Row;
        public readonly double Width;

        public PlatformSpec(double x, double row, double width)
        {
            X = x;
            Row = row;
            Width = width;
        }

        public double CenterX => X + Width / 2;

        public override string ToString() => $"(x {X:0.##}, ряд {Row:0.##}, ширина {Width:0.##})";
    }
}
