using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace AgenticGame.Game
{
    /// <summary>
    /// Камера вертикального этапа: по X стоит по центру мира (ширина мира =
    /// ширина экрана, 32 блока), по Y плавно едет за игроком и не выходит за
    /// низ и верх мира.
    ///
    /// Pixel Perfect Camera (URP): кадр рисуется в эталонном разрешении
    /// 32×18 блоков по 32 пикселя (1024×576) и растягивается на окно с
    /// сохранением пропорций (StretchFill + UpscaleRenderTexture) — видно
    /// ровно столько же, сколько в Phaser-версии, пиксели одинаковые.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class CameraFollow : MonoBehaviour
    {
        /// <summary>Доля пути до цели за кадр при 60 к/с (как lerp 0.1 в Phaser).</summary>
        private const float FollowLerpAt60Fps = 0.1f;

        private Transform _target;
        private float _worldBottom;
        private float _worldTop;

        public static CameraFollow Setup(Camera camera, Transform target, float worldBottom, float worldTop)
        {
            camera.orthographic = true;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color32(0x1d, 0x23, 0x33, 0xff);

            var pixelPerfect = camera.GetComponent<PixelPerfectCamera>();
            if (pixelPerfect == null) pixelPerfect = camera.gameObject.AddComponent<PixelPerfectCamera>();
            pixelPerfect.assetsPPU = GameDimensions.PixelsPerUnit;
            pixelPerfect.refResolutionX = GameDimensions.GridColumns * GameDimensions.PixelsPerUnit;
            pixelPerfect.refResolutionY = GameDimensions.GridRows * GameDimensions.PixelsPerUnit;
            pixelPerfect.cropFrame = PixelPerfectCamera.CropFrame.StretchFill;
            pixelPerfect.gridSnapping = PixelPerfectCamera.GridSnapping.UpscaleRenderTexture;

            var follow = camera.GetComponent<CameraFollow>();
            if (follow == null) follow = camera.gameObject.AddComponent<CameraFollow>();
            follow._target = target;
            follow._worldBottom = worldBottom;
            follow._worldTop = worldTop;
            follow.transform.position = new Vector3(GameDimensions.GridColumns / 2f, follow.TargetY(), -10f);
            return follow;
        }

        private float TargetY()
        {
            float halfView = GameDimensions.GridRows / 2f;
            // Смотрим на центр девочки (0.75 блока над ногами), а не на ноги.
            float desired = _target.position.y + 0.75f;
            float min = _worldBottom + halfView;
            float max = Mathf.Max(min, _worldTop - halfView);
            return Mathf.Clamp(desired, min, max);
        }

        private void LateUpdate()
        {
            if (_target == null) return;
            // Сглаживание, не зависящее от частоты кадров.
            float t = 1f - Mathf.Pow(1f - FollowLerpAt60Fps, Time.deltaTime * 60f);
            Vector3 position = transform.position;
            position.x = GameDimensions.GridColumns / 2f;
            position.y = Mathf.Lerp(position.y, TargetY(), t);
            transform.position = position;
        }
    }
}
