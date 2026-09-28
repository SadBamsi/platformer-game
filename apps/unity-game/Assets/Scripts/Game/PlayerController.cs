using UnityEngine;
using UnityEngine.InputSystem;

namespace AgenticGame.Game
{
    /// <summary>
    /// Девочка: бег, прыжок, анимация. Числа — из Phaser-версии (GameDimensions).
    ///
    /// Ввод — общие действия проекта Unity 6 (Assets/Settings/InputSystem_Actions):
    /// Player/Move (WASD, стрелки, стик) и Player/Jump (пробел, кнопка A/крест).
    ///
    /// Позиция объекта — точка между ногами (низ хитбокса). Хитбокс симметричен
    /// относительно неё, а зеркальность рисунка учитывается сдвигом спрайта
    /// (GameDimensions.SpriteOffsetX): физика не зависит от того, куда смотрит
    /// девочка.
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D), typeof(BoxCollider2D))]
    public sealed class PlayerController : MonoBehaviour
    {
        private const float GroundProbeDistance = 0.05f;
        /// <summary>Поверхность считается опорой, если её нормаль смотрит вверх.</summary>
        private const float GroundNormalMinY = 0.7f;

        private Rigidbody2D _body;
        private BoxCollider2D _collider;
        private SpriteRenderer _renderer;
        private Sprite[] _frames;
        private AudioSource _audio;
        private AudioClip _jumpSound;

        private InputAction _move;
        private InputAction _jump;

        private readonly RaycastHit2D[] _groundHits = new RaycastHit2D[4];
        private ContactFilter2D _groundFilter;

        private float _lastGroundedTime = float.NegativeInfinity;
        private float _jumpBufferedUntil = float.NegativeInfinity;
        private bool _jumpCutRequested;
        private bool _facingLeft;
        private float _animationTime;

        public bool IsGrounded { get; private set; }

        /// <summary>Создаёт игрока со всеми компонентами в точке feet (низ хитбокса).</summary>
        public static PlayerController Create(Vector2 feet)
        {
            var root = new GameObject("Player");
            root.transform.position = feet;

            var body = root.AddComponent<Rigidbody2D>();
            body.gravityScale = GameDimensions.Gravity / Mathf.Abs(Physics2D.gravity.y);
            body.freezeRotation = true;
            body.interpolation = RigidbodyInterpolation2D.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;

            var collider = root.AddComponent<BoxCollider2D>();
            collider.size = new Vector2(GameDimensions.HitboxWidth, GameDimensions.HitboxHeight);
            collider.offset = new Vector2(0f, GameDimensions.HitboxHeight / 2f);
            // Без трения: иначе игрок «прилипает» к боку платформы, когда жмёт в неё в прыжке.
            collider.sharedMaterial = new PhysicsMaterial2D("PlayerNoFriction") { friction = 0f, bounciness = 0f };

            var spriteObject = new GameObject("Sprite");
            spriteObject.transform.SetParent(root.transform, false);
            spriteObject.AddComponent<SpriteRenderer>();

            var audio = root.AddComponent<AudioSource>();
            audio.playOnAwake = false;
            audio.spatialBlend = 0f; // 2D-звук: громкость не зависит от расстояния до камеры

            return root.AddComponent<PlayerController>();
        }

        private void Awake()
        {
            _body = GetComponent<Rigidbody2D>();
            _collider = GetComponent<BoxCollider2D>();
            _renderer = GetComponentInChildren<SpriteRenderer>();
            _frames = PixelSprites.Frames("girl", GameDimensions.FrameWidthPx, GameDimensions.FrameHeightPx,
                GameDimensions.PixelsPerUnit);
            _renderer.sprite = _frames[0];
            _audio = GetComponent<AudioSource>();
            _jumpSound = Resources.Load<AudioClip>("Audio/jump");
            ApplyFacing();

            _groundFilter = new ContactFilter2D { useTriggers = false };

            _move = InputSystem.actions.FindAction("Player/Move", throwIfNotFound: true);
            _jump = InputSystem.actions.FindAction("Player/Jump", throwIfNotFound: true);
        }

        private void OnEnable()
        {
            _move?.Enable();
            _jump?.Enable();
        }

        private void Update()
        {
            // Нажатия читаем в Update (каждый кадр), а применяем в FixedUpdate:
            // иначе короткое нажатие между шагами физики теряется.
            if (_jump.WasPressedThisFrame()) _jumpBufferedUntil = Time.time + GameDimensions.JumpBufferTime;
            if (_jump.WasReleasedThisFrame()) _jumpCutRequested = true;

            float moveX = _move.ReadValue<Vector2>().x;
            if (moveX < -0.1f && !_facingLeft) SetFacing(true);
            else if (moveX > 0.1f && _facingLeft) SetFacing(false);

            Animate(moveX);
        }

        private void FixedUpdate()
        {
            IsGrounded = ProbeGround();
            if (IsGrounded) _lastGroundedTime = Time.time;

            Vector2 velocity = _body.linearVelocity;
            velocity.x = Mathf.Clamp(_move.ReadValue<Vector2>().x, -1f, 1f) * GameDimensions.MoveSpeed;

            // Буфер прыжка + койот-тайм: нажатие чуть раньше приземления или чуть
            // позже схода с края всё равно даёт прыжок.
            bool jumpBuffered = Time.time <= _jumpBufferedUntil;
            bool canJump = Time.time - _lastGroundedTime <= GameDimensions.CoyoteTime;
            if (jumpBuffered && canJump && velocity.y <= 0.01f)
            {
                velocity.y = GameDimensions.JumpVelocity;
                _jumpBufferedUntil = float.NegativeInfinity;
                _lastGroundedTime = float.NegativeInfinity;
                _jumpCutRequested = false;
                if (_audio != null && _jumpSound != null) _audio.PlayOneShot(_jumpSound);
            }

            // Переменная высота прыжка: отпустил кнопку на подъёме — подъём режется.
            if (_jumpCutRequested)
            {
                if (velocity.y > 0f) velocity.y *= GameDimensions.JumpCutMultiplier;
                _jumpCutRequested = false;
            }

            _body.linearVelocity = velocity;
        }

        /// <summary>Останавливает игрока на месте (этап пройден): физика и управление выключаются.</summary>
        public void Freeze()
        {
            _body.linearVelocity = Vector2.zero;
            _body.simulated = false;
            _renderer.sprite = _frames[0];
            enabled = false;
        }

        /// <summary>Под ногами твёрдая поверхность: короткий «бросок» хитбокса вниз.</summary>
        private bool ProbeGround()
        {
            int count = _collider.Cast(Vector2.down, _groundFilter, _groundHits, GroundProbeDistance);
            for (int i = 0; i < count; i++)
            {
                if (_groundHits[i].normal.y >= GroundNormalMinY) return true;
            }
            return false;
        }

        private void SetFacing(bool left)
        {
            _facingLeft = left;
            ApplyFacing();
        }

        private void ApplyFacing()
        {
            _renderer.flipX = _facingLeft;
            // Рисунок в кадре не по центру: сдвигаем спрайт так, чтобы ноги стояли
            // над хитбоксом; при отражении — в другую сторону.
            float offset = _facingLeft ? -GameDimensions.SpriteOffsetX : GameDimensions.SpriteOffsetX;
            _renderer.transform.localPosition = new Vector3(offset, 0f, 0f);
        }

        /// <summary>Кадры как в Phaser-версии: стоит 0–1 (3 к/с), бежит 2–5 (10 к/с), прыжок 6, падение 7.</summary>
        private void Animate(float moveX)
        {
            _animationTime += Time.deltaTime;
            int frame;
            if (!IsGrounded)
            {
                frame = _body.linearVelocity.y > 0f ? 6 : 7;
            }
            else if (Mathf.Abs(moveX) > 0.1f)
            {
                frame = 2 + (int)(_animationTime * 10f) % 4;
            }
            else
            {
                frame = (int)(_animationTime * 3f) % 2;
            }
            _renderer.sprite = _frames[frame];
        }
    }
}
