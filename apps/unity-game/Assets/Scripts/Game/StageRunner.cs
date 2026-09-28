using System.Collections;
using System.Diagnostics;
using AgenticGame.Rising;
using AgenticGame.Ui;
using UnityEngine;
using UnityEngine.InputSystem;
using Debug = UnityEngine.Debug;

namespace AgenticGame.Game
{
    /// <summary>
    /// Запускает вертикальные этапы: при нажатии Play сам строит этап 1 из
    /// StageGenerator (тот же seed и та же раскладка, что в Phaser-версии),
    /// игрока, камеру и фон. В сцене ничего настраивать не нужно.
    ///
    /// Координаты как в PlatformerScene.ts: верх земли — y = 0, платформа с
    /// верхом на ряду r занимает y ∈ [r − 1, r], потолок мира — на ряду H − 1.
    ///
    /// Касание дома: игрок замирает, появляется надпись «PIERAMOHA!», через
    /// 3 с строится следующий этап (как STAGE_CLEAR_DELAY_MS в Phaser).
    ///
    /// Вода (как в PlatformerScene.ts): через 3 с после старта этапа
    /// поднимается со скоростью H(n)/T(n). Дошла до центра игрока — минус
    /// жизнь и этап заново (тот же seed). Жизни кончились — «KANIEC HULNI»,
    /// прыжок начинает игру с этапа 1 и трёх жизней.
    ///
    /// Для проверки в редакторе: ] — следующий этап, [ — предыдущий.
    /// </summary>
    public sealed class StageRunner : MonoBehaviour
    {
        private const int GrassPixelsPerUnit = 16; // grass.png — 16×16 пикселей на блок
        private const int StartingLives = 3;
        /// <summary>Шаг времени воды не больше этого: после подвисания вода не прыгает скачком.</summary>
        private const float MaxWaterDeltaSeconds = 0.1f;
        /// <summary>Столько после «KANIEC HULNI» прыжок ещё не перезапускает: случайное нажатие не считается.</summary>
        private const float GameOverInputDelaySeconds = 0.5f;

        private Camera _camera;
        private Sprite _grass;
        private Transform _level;
        private PlayerController _player;
        private Coroutine _nextStage;
        private StageClearBanner _banner;
        private WaterView _waterView;
        private Water _water;
        private InputAction _jump;
        private bool _stageCleared;
        private bool _gameOver;
        private float _gameOverAt;

        public int StageNumber { get; private set; }
        public int Lives { get; private set; } = StartingLives;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void ConfigurePhysics()
        {
            Time.fixedDeltaTime = GameDimensions.FixedTimestep;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (FindAnyObjectByType<StageRunner>() != null) return;
            new GameObject("StageRunner").AddComponent<StageRunner>();
        }

        private void Start()
        {
            _camera = Camera.main;
            if (_camera == null)
            {
                _camera = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)).GetComponent<Camera>();
                _camera.tag = "MainCamera";
            }
            _grass = PixelSprites.Single("grass", GrassPixelsPerUnit, new Vector2(0.5f, 0.5f));
            ParallaxBackground.Create(_camera);
            _banner = StageClearBanner.Create(_camera);
            _waterView = WaterView.Create();
            _waterView.gameObject.SetActive(Difficulty.WaterEnabled);
            _jump = InputSystem.actions.FindAction("Player/Jump", throwIfNotFound: true);
            LoadStage(1);
        }

        private void Update()
        {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
            Keyboard keyboard = Keyboard.current;
            if (keyboard != null && keyboard.rightBracketKey.wasPressedThisFrame) LoadStage(StageNumber + 1);
            if (keyboard != null && keyboard.leftBracketKey.wasPressedThisFrame && StageNumber > 1)
            {
                LoadStage(StageNumber - 1);
            }
#endif
            if (_gameOver)
            {
                if (Time.time >= _gameOverAt + GameOverInputDelaySeconds && _jump.WasPressedThisFrame())
                {
                    Lives = StartingLives;
                    LoadStage(1);
                }
                return;
            }
            if (_stageCleared || !Difficulty.WaterEnabled) return;

            _water.Update(Mathf.Min(Time.deltaTime, MaxWaterDeltaSeconds));
            _waterView.Render((float)_water.SurfaceRow);
            if (_water.IsDrowned(_player.transform.position.y)) LoseLife();
        }

        private void LoseLife()
        {
            Lives -= 1;
            Debug.Log($"StageRunner: вода догнала на этапе {StageNumber}, осталось жизней: {Lives}");
            if (Lives > 0)
            {
                LoadStage(StageNumber);
                return;
            }
            _gameOver = true;
            _gameOverAt = Time.time;
            _player.Freeze();
            _banner.ShowGameOver(StageNumber);
        }

        public void LoadStage(int n)
        {
            if (_nextStage != null)
            {
                StopCoroutine(_nextStage);
                _nextStage = null;
            }
            _banner.Hide();
            if (_level != null) Destroy(_level.gameObject);
            if (_player != null) Destroy(_player.gameObject);

            var timer = Stopwatch.StartNew();
            Stage stage = StageGenerator.Generate(n);
            Debug.Log($"StageRunner: этап {n} — {stage.Platforms.Count} платформ, высота {stage.HeightRows} рядов, " +
                      $"построен за {timer.ElapsedMilliseconds} мс");

            StageNumber = n;
            _stageCleared = false;
            _gameOver = false;
            _water = Water.ForStage(n);
            _waterView.Render((float)_water.SurfaceRow);
            _level = new GameObject($"Stage {n}").transform;
            BuildLevel(stage);

            // Игрок стоит в середине зоны спавна (spawn.x + 1, как в PlatformerScene).
            _player = PlayerController.Create(new Vector2((float)(stage.SpawnX + 1), 0f));
            CameraFollow.Setup(_camera, _player.transform, -1f, stage.HeightRows - 1);
        }

        private void BuildLevel(Stage stage)
        {
            int h = stage.HeightRows;
            CreatePlatform(0, 0, GameDimensions.GridColumns, "Ground");
            foreach (PlatformSpec p in stage.Platforms)
            {
                CreatePlatform((float)p.X, (float)p.Row, (float)p.Width, "Platform");
            }
            PlatformSpec exit = stage.Exit;
            CreatePlatform((float)exit.X, (float)exit.Row, (float)exit.Width, "Exit");

            HouseGoal house = HouseGoal.Create(_level, (float)exit.X, (float)exit.Width, (float)exit.Row);
            house.Reached += OnHouseReached;

            // Стены от низа земли (−1) до потолка, потолок — низом на ряду H − 1.
            float wallHeight = h + 1f;
            float wallCenterY = -1f + wallHeight / 2f;
            CreateWall(new Vector2(-0.5f, wallCenterY), new Vector2(1f, wallHeight), "WallLeft");
            CreateWall(new Vector2(GameDimensions.GridColumns + 0.5f, wallCenterY), new Vector2(1f, wallHeight),
                "WallRight");
            CreateWall(new Vector2(GameDimensions.GridColumns / 2f, h - 0.5f),
                new Vector2(GameDimensions.GridColumns + 2f, 1f), "Ceiling");
        }

        private void OnHouseReached()
        {
            Debug.Log($"StageRunner: этап {StageNumber} пройден — PIERAMOHA!");
            _stageCleared = true;
            _player.Freeze();
            _banner.ShowStageClear(StageNumber);
            _nextStage = StartCoroutine(NextStageAfterDelay());
        }

        private IEnumerator NextStageAfterDelay()
        {
            yield return new WaitForSeconds(StageClearText.DelaySeconds);
            _nextStage = null;
            LoadStage(StageNumber + 1);
        }

        /// <summary>Платформа толщиной 1 блок, верх на ряду top. Трава повторяется по ширине.</summary>
        private void CreatePlatform(float x, float top, float width, string name)
        {
            var platform = new GameObject(name);
            platform.transform.SetParent(_level, false);
            platform.transform.position = new Vector3(x + width / 2f, top - 0.5f, 0f);

            var renderer = platform.AddComponent<SpriteRenderer>();
            renderer.sprite = _grass;
            renderer.drawMode = SpriteDrawMode.Tiled;
            renderer.size = new Vector2(width, 1f);

            var collider = platform.AddComponent<BoxCollider2D>();
            collider.size = new Vector2(width, 1f);
        }

        private void CreateWall(Vector2 center, Vector2 size, string name)
        {
            var wall = new GameObject(name);
            wall.transform.SetParent(_level, false);
            wall.transform.position = center;
            var collider = wall.AddComponent<BoxCollider2D>();
            collider.size = size;
        }
    }
}
