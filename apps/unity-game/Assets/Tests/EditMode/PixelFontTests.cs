using System;
using AgenticGame.Ui;
using NUnit.Framework;

namespace AgenticGame.Tests
{
    public sealed class PixelFontTests
    {
        [Test]
        public void TitleLayoutMatchesPhaserMetrics()
        {
            PixelTextLayout layout = PixelFont.Layout(StageClearText.Title);
            // 10 символов × (5 + 1) − 1 = 59 клеток, высота 7.
            Assert.AreEqual(59, layout.Width);
            Assert.AreEqual(7, layout.Height);
            Assert.IsTrue(layout.Cells.Contains((0, 0)), "у P закрашен левый верхний угол");
        }

        [Test]
        public void LayoutIgnoresCase()
        {
            CollectionAssert.AreEqual(PixelFont.Layout("PIERAMOHA").Cells, PixelFont.Layout("pieramoha").Cells);
        }

        [Test]
        public void SubtitleForEveryStageUsesKnownGlyphs([NUnit.Framework.Range(1, 30)] int stage)
        {
            Assert.DoesNotThrow(() => PixelFont.Layout(StageClearText.Subtitle(stage)));
        }

        [Test]
        public void UnknownGlyphThrows()
        {
            Assert.Throws<ArgumentException>(() => PixelFont.Layout("Ł"));
        }
    }
}
