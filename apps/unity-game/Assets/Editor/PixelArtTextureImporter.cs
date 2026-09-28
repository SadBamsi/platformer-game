using UnityEditor;
using UnityEngine;

namespace AgenticGame.Editor
{
    /// <summary>
    /// Настройки импорта для пиксель-арта из Assets/Resources/Sprites: без
    /// сглаживания (Point), без сжатия и mip-уровней — иначе пиксели плывут
    /// и появляются цветные артефакты. Срабатывает автоматически при импорте,
    /// руками в инспекторе ничего ставить не нужно.
    /// </summary>
    public sealed class PixelArtTextureImporter : AssetPostprocessor
    {
        private const string PixelArtFolder = "Assets/Resources/Sprites/";

        private void OnPreprocessTexture()
        {
            if (!assetPath.StartsWith(PixelArtFolder)) return;

            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Default;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.mipmapEnabled = false;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.alphaIsTransparency = true;
            importer.wrapMode = TextureWrapMode.Clamp;
        }
    }
}
