using System;
using System.Globalization;
using System.IO;
using System.Linq;
using AgenticGame.Rising;
using NUnit.Framework;
using UnityEngine;

namespace AgenticGame.Tests
{
    /// <summary>
    /// Сверка C#-порта генератора с Phaser-версией. phaser-stages.txt выгружен
    /// из apps/game (generateStage(1..20) и первые числа createRng(1)); формат
    /// строки этапа: n|H|ширина|x,ряд,ширина;…|выход x,ряд,ширина.
    /// Совпадение означает, что этапы в Unity те же, что в браузере, и
    /// проходимость, проверенная там сквозными прохождениями, сохраняется.
    /// </summary>
    public sealed class StageGeneratorTests
    {
        private const double Tolerance = 1e-9;

        private static string[] FixtureLines() =>
            File.ReadAllLines(Path.Combine(Application.dataPath, "Tests/EditMode/phaser-stages.txt"))
                .Where(line => line.Length > 0)
                .ToArray();

        private static double Parse(string value) => double.Parse(value, CultureInfo.InvariantCulture);

        private static double[] ParsePlatform(string value) => value.Split(',').Select(Parse).ToArray();

        [Test]
        public void SeededRandomMatchesPhaser()
        {
            string[] parts = FixtureLines().First(line => line.StartsWith("rng1|")).Split('|');
            double[] expected = parts[1].Split(',').Select(Parse).ToArray();
            var rng = new SeededRandom(1);
            foreach (double value in expected)
            {
                Assert.AreEqual(value, rng.Next(), 0);
            }
        }

        [Test]
        public void StageMatchesPhaser([NUnit.Framework.Range(1, 20)] int n)
        {
            string[] parts = FixtureLines().First(line => line.StartsWith($"{n}|")).Split('|');
            Stage stage = StageGenerator.Generate(n);

            Assert.AreEqual(int.Parse(parts[1]), stage.HeightRows, "высота этапа");
            Assert.AreEqual(int.Parse(parts[2]), stage.PlatformWidth, "ширина платформ");

            double[][] expected = parts[3].Split(';').Select(ParsePlatform).ToArray();
            Assert.AreEqual(expected.Length, stage.Platforms.Count, "число платформ");
            for (int i = 0; i < expected.Length; i++)
            {
                AssertPlatform(expected[i], stage.Platforms[i], $"платформа {i}");
            }
            AssertPlatform(ParsePlatform(parts[4]), stage.Exit, "выход");
        }

        [Test]
        public void GenerateRejectsNonPositiveStage()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => StageGenerator.Generate(0));
        }

        private static void AssertPlatform(double[] expected, PlatformSpec actual, string label)
        {
            Assert.AreEqual(expected[0], actual.X, Tolerance, $"{label}: x");
            Assert.AreEqual(expected[1], actual.Row, Tolerance, $"{label}: ряд");
            Assert.AreEqual(expected[2], actual.Width, Tolerance, $"{label}: ширина");
        }
    }
}
