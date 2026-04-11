/**
 * Image Preprocessor for Passport OCR
 *
 * All processing happens client-side in the browser.
 * No images are ever sent to a server.
 */

export async function preprocessPassportImage(file: File): Promise<Blob> {
  const imageBitmap = await createImageBitmap(file);

  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas 2D context');
  }

  // Draw the original image
  ctx.drawImage(imageBitmap, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Enhanced contrast without aggressive binarization
  // This preserves text readability while improving OCR accuracy
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale using luminance formula
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Moderate contrast enhancement (1.2 instead of 1.5)
    const contrast = 1.2;
    let adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    adjusted = Math.max(0, Math.min(255, adjusted));

    // Convert to grayscale but preserve gradients
    // Do NOT apply hard threshold - this destroys readability
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
    // Alpha channel stays unchanged
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/png',
      0.95 // High quality JPEG
    );
  });
}
