/**
 * Client-side raster image compression for the Auto-Packager.
 *
 * Uses the browser's Canvas API (createImageBitmap + canvas.toBlob) — no
 * external dependency needed, consistent with this being a client-only SPA.
 * Always re-encodes to JPEG: this both compresses (resize + quality) and
 * converts legacy formats (BMP/GIF) to the format DoHA prefers for ImmiAccount
 * uploads, per the Auto-Packager spec (issue #2).
 */

export interface CompressImageResult {
  blob: Blob;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

/** Never shrink the long edge below this many px, even to hit the target size. */
const MIN_DIMENSION = 500;
/** Never drop JPEG quality below this, even to hit the target size. */
const MIN_QUALITY = 0.4;
const MAX_ATTEMPTS = 10;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
      'image/jpeg',
      quality,
    );
  });
}

function drawScaled(bitmap: ImageBitmap, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // JPEG has no alpha channel — paint white first so transparent PNG/GIF/BMP
  // sources don't turn black.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Compress/convert a raster image to JPEG under targetBytes.
 * Iteratively lowers quality first, then scale, alternating until the
 * target is met or we hit the quality/dimension floor.
 */
export async function compressImage(blob: Blob, targetBytes: number): Promise<CompressImageResult> {
  const bitmap = await createImageBitmap(blob);
  try {
    let scale = 1;
    let quality = 0.85;
    let best: Blob = blob;
    let bestDims = { width: bitmap.width, height: bitmap.height };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const canvas = drawScaled(bitmap, scale);
      // eslint-disable-next-line no-await-in-loop
      const out = await canvasToBlob(canvas, quality);
      best = out;
      bestDims = { width: canvas.width, height: canvas.height };
      if (out.size <= targetBytes) break;

      const longEdge = Math.max(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.15);
      } else if (longEdge > MIN_DIMENSION) {
        scale *= 0.8;
        quality = 0.75; // give a fresh quality budget after shrinking
      } else {
        break; // nothing more we can safely do
      }
    }

    return { blob: best, width: bestDims.width, height: bestDims.height, mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

/** True if the given mime type or file name looks like a raster image the packager can handle. */
export function isRasterImage(fileType: string, fileName: string): boolean {
  if (/^image\//.test(fileType)) return true;
  return /\.(jpe?g|png|bmp|gif|webp)$/i.test(fileName);
}

/** True for legacy raster formats DoHA/ImmiAccount don't want — always convert to JPG. */
export function needsFormatConversion(fileType: string, fileName: string): boolean {
  return /^image\/(bmp|gif)$/i.test(fileType) || /\.(bmp|gif)$/i.test(fileName);
}
