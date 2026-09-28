using AgenticGame.Rising;
using NUnit.Framework;

namespace AgenticGame.Tests
{
    /// <summary>Те же случаи, что у Water.ts и difficulty.ts в Phaser-версии.</summary>
    public sealed class WaterTests
    {
        private const double Tolerance = 1e-9;

        [Test]
        public void RiseTimeGoesFrom120To60AndStays()
        {
            Assert.AreEqual(120, Difficulty.WaterRiseSeconds(1), Tolerance);
            Assert.AreEqual(60, Difficulty.WaterRiseSeconds(10), Tolerance);
            Assert.AreEqual(60, Difficulty.WaterRiseSeconds(20), Tolerance);
        }

        [Test]
        public void SpeedIsHeightOverRiseTime()
        {
            Assert.AreEqual(60.0 / 120, Difficulty.WaterSpeedRowsPerSec(1), Tolerance);
            Assert.AreEqual(100.0 / 60, Difficulty.WaterSpeedRowsPerSec(20), Tolerance);
        }

        [Test]
        public void WaterWaitsForStartDelay()
        {
            var water = new Water(60, 1, 3);
            water.Update(2.9);
            Assert.AreEqual(0, water.SurfaceRow, Tolerance);
            water.Update(1.1);
            Assert.AreEqual(1, water.SurfaceRow, Tolerance);
        }

        [Test]
        public void WaterStopsAtStageHeight()
        {
            var water = new Water(60, 1, 3);
            water.Update(1000);
            Assert.AreEqual(60, water.SurfaceRow, Tolerance);
        }

        [Test]
        public void NegativeDeltaIsIgnored()
        {
            var water = new Water(60, 1, 0);
            water.Update(5);
            water.Update(-3);
            Assert.AreEqual(5, water.SurfaceRow, Tolerance);
        }

        [Test]
        public void DrownsWhenWaterReachesPlayerCenter()
        {
            var water = new Water(60, 1, 0);
            water.Update(10.75);
            Assert.IsTrue(water.IsDrowned(10), "вода ровно на центре игрока — утонул");
            Assert.IsFalse(water.IsDrowned(10.01), "центр чуть выше воды — жив");
        }

        [Test]
        public void StageOneWaterTakesTwoMinutesToFill()
        {
            Water water = Water.ForStage(1);
            water.Update(3 + 119.9);
            Assert.Less(water.SurfaceRow, 60);
            water.Update(0.2);
            Assert.AreEqual(60, water.SurfaceRow, Tolerance);
        }
    }
}
