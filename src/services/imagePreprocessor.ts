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

  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale using luminance formula
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Increase contrast: stretch values around midpoint
    const contrast = 1.5; // contrast multiplier
    let adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    adjusted = Math.max(0, Math.min(255, adjusted));

    // Apply threshold for binarization (helps MRZ reading)
    const threshold = 128;
    const final = adjusted > threshold ? 255 : 0;

    data[i] = final;
    data[i + 1] = final;
    data[i + 2] = final;
    // Alpha channel (data[i+3]) stays unchanged
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
      'image/png'
    );
  });
}
