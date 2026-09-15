import { describe, it, expect, vi, afterEach } from 'vitest';
import { compressImage, isRasterImage, needsFormatConversion, isUncompressibleImage } from './imageCompress';

function installCanvasFake(sizeFor: (w: number, h: number, quality: number) => number) {
  const calls: { width: number; height: number; quality: number; size: number }[] = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      const canvas: any = {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
        toBlob: (cb: (b: Blob | null) => void, _type: string, quality: number) => {
          const size = sizeFor(canvas.width, canvas.height, quality);
          calls.push({ width: canvas.width, height: canvas.height, quality, size });
          cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }));
        },
      };
      return canvas;
    },
  });
  return calls;
}

function installFailingCanvas() {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
        toBlob: (cb: (b: Blob | null) => void) => cb(null),
      };
    },
  });
}

function installNoContextCanvas() {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return { width: 0, height: 0, getContext: () => null, toBlob: () => {} };
    },
  });
}

function installBitmapFake(width: number, height: number) {
  const closed = { value: false };
  vi.stubGlobal('createImageBitmap', async () => ({
    width,
    height,
    close: () => {
      closed.value = true;
    },
  }));
  return closed;
}

function installFailingBitmap() {
  vi.stubGlobal('createImageBitmap', async () => {
    throw new Error('decode failed');
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compressImage', () => {
  it('already under target — single encode, no downscale', async () => {
    installBitmapFake(1200, 800);
    const calls = installCanvasFake(() => 200_000);
    const blob = new Blob([new Uint8Array(200_000)], { type: 'image/jpeg' });

    const result = await compressImage(blob, 512_000);

    expect(calls.length).toBe(1);
    expect(calls[0].quality).toBeCloseTo(0.85, 5);
    expect(calls[0].width).toBe(1200);
    expect(calls[0].height).toBe(800);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.blob.size).toBe(200_000);
  });

  it('is still a re-encode, not the original blob, even when under target', async () => {
    installBitmapFake(1200, 800);
    installCanvasFake(() => 200_000);
    const blob = new Blob([new Uint8Array(200_000)], { type: 'image/png' });

    const result = await compressImage(blob, 512_000);

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blob).not.toBe(blob);
  });

  it('walks the quality ladder before touching dimensions', async () => {
    installBitmapFake(4000, 3000);
    const calls = installCanvasFake((_w, _h, q) => (q > 0.5 ? 900_000 : 400_000));
    const blob = new Blob([new Uint8Array(5_000_000)]);

    const result = await compressImage(blob, 512_000);

    expect(calls.length).toBe(4);
    expect(calls.map((c) => c.quality)).toEqual([
      expect.closeTo(0.85, 5),
      expect.closeTo(0.7, 5),
      expect.closeTo(0.55, 5),
      expect.closeTo(0.4, 5),
    ]);
    for (const c of calls) {
      expect(c.width).toBe(4000);
      expect(c.height).toBe(3000);
    }
    expect(result.width).toBe(4000);
    expect(result.blob.size).toBe(400_000);
  });

  it('falls through to downscaling once the quality floor is hit, with a fresh quality budget', async () => {
    installBitmapFake(4000, 3000);
    const calls = installCanvasFake((w) => (w > 3000 ? 900_000 : 300_000));
    const blob = new Blob([new Uint8Array(5_000_000)]);

    const result = await compressImage(blob, 512_000);

    expect(calls.slice(0, 4).map((c) => c.quality)).toEqual([
      expect.closeTo(0.85, 5),
      expect.closeTo(0.7, 5),
      expect.closeTo(0.55, 5),
      expect.closeTo(0.4, 5),
    ]);
    for (const c of calls.slice(0, 4)) {
      expect(c.width).toBe(4000);
      expect(c.height).toBe(3000);
    }
    expect(calls[4].width).toBe(3200);
    expect(calls[4].height).toBe(2400);
    expect(calls[4].quality).toBeCloseTo(0.75, 5);

    // The scale-down at attempt 5 (3200px) is still > 3000px per the scripted
    // sizeFor, so the loop keeps going until the next 0.8 step (2560px) —
    // the last recorded call is what the function actually returns.
    const last = calls[calls.length - 1];
    expect(result.width).toBe(last.width);
    expect(result.height).toBe(last.height);
    expect(result.blob.size).toBe(last.size);
    expect(last.size).toBe(300_000);
  });

  it('cannot reach target — stops at the dimension floor and returns the last (oversized) attempt unflagged', async () => {
    installBitmapFake(600, 400);
    const calls = installCanvasFake(() => 2_000_000);
    const blob = new Blob([new Uint8Array(2_000_000)]);

    const result = await compressImage(blob, 512_000);

    expect(calls.length).toBeLessThan(10);
    const last = calls[calls.length - 1];
    expect([0.4, 0.75]).toContain(Number(last.quality.toFixed(2)));
    expect(result.blob.size).toBe(2_000_000);
    expect(result.width).toBe(last.width);
  });

  it('tiny image — never upscales, never breaks', async () => {
    installBitmapFake(10, 10);
    const calls = installCanvasFake(() => 300);
    const blob = new Blob([new Uint8Array(300)]);

    const result = await compressImage(blob, 512_000);

    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ width: 10, height: 10 });
    expect(calls[0].quality).toBeCloseTo(0.85, 5);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it('extreme aspect ratio — long edge governs the floor, height never rounds to zero', async () => {
    installBitmapFake(8000, 20);
    const calls = installCanvasFake(() => 2_000_000);
    const blob = new Blob([new Uint8Array(2_000_000)]);

    await compressImage(blob, 512_000);

    for (const c of calls) {
      expect(c.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('caps at MAX_ATTEMPTS and resolves without hanging', async () => {
    installBitmapFake(20000, 20000);
    const calls = installCanvasFake(() => 2_000_000);
    const blob = new Blob([new Uint8Array(2_000_000)]);

    await expect(compressImage(blob, 512_000)).resolves.toBeDefined();
    expect(calls.length).toBeLessThanOrEqual(10);
  });

  it('always closes the bitmap, on success', async () => {
    const closed = installBitmapFake(1200, 800);
    installCanvasFake(() => 200_000);
    const blob = new Blob([new Uint8Array(200_000)]);

    await compressImage(blob, 512_000);

    expect(closed.value).toBe(true);
  });

  it('always closes the bitmap, even when encoding throws', async () => {
    const closed = installBitmapFake(1200, 800);
    installFailingCanvas();
    const blob = new Blob([new Uint8Array(200_000)]);

    await expect(compressImage(blob, 512_000)).rejects.toThrow('Canvas encoding failed');
    expect(closed.value).toBe(true);
  });

  it('rejects when the encoder callback receives null', async () => {
    installBitmapFake(1200, 800);
    installFailingCanvas();
    const blob = new Blob([new Uint8Array(200_000)]);

    await expect(compressImage(blob, 512_000)).rejects.toThrow('Canvas encoding failed');
  });

  it('rejects when the 2D context is unavailable', async () => {
    installBitmapFake(1200, 800);
    installNoContextCanvas();
    const blob = new Blob([new Uint8Array(200_000)]);

    await expect(compressImage(blob, 512_000)).rejects.toThrow('Canvas 2D context unavailable');
  });

  it('propagates a bitmap decode failure', async () => {
    installFailingBitmap();
    installCanvasFake(() => 200_000);
    const blob = new Blob([new Uint8Array(200_000)]);

    await expect(compressImage(blob, 512_000)).rejects.toThrow();
  });

  it('exact-boundary target — breaks on the first pass when the size equals targetBytes', async () => {
    installBitmapFake(1200, 800);
    const calls = installCanvasFake(() => 512_000);
    const blob = new Blob([new Uint8Array(512_000)]);

    const result = await compressImage(blob, 512_000);

    expect(calls.length).toBe(1);
    expect(result.blob.size).toBe(512_000);
  });
});

describe('isRasterImage', () => {
  it.each([
    ['image/jpeg', 'a.jpg', true],
    ['image/png', 'a.png', true],
    ['image/bmp', 'a.bmp', true],
    ['image/gif', 'a.gif', true],
    ['image/webp', 'a.webp', true],
    ['image/heic', 'a.heic', true],
    ['image/tiff', 'a.tiff', true],
    ['', 'PHOTO.JPEG', true],
    ['', 'x.tif', true],
    ['image/anything-new', 'x.zzz', true],
    ['', 'a.jpeg', true],
    ['application/pdf', 'a.pdf', false],
    ['', 'a.docx', false],
    ['', 'noextension', false],
    ['', 'a.jpg.txt', false],
    ['text/plain', 'a.txt', false],
  ])('isRasterImage(%s, %s) === %s', (fileType, fileName, expected) => {
    expect(isRasterImage(fileType, fileName)).toBe(expected);
  });
});

describe('needsFormatConversion', () => {
  it.each([
    ['image/bmp', 'x.bmp', true],
    ['image/gif', 'x.gif', true],
    ['', 'photo.BMP', true],
    ['', 'anim.GIF', true],
    ['image/bmp', 'x.png', true],
    ['image/jpeg', 'legacy.bmp', true],
    ['image/jpeg', 'x.jpg', false],
    ['image/png', 'x.png', false],
    ['image/webp', 'x.webp', false],
    ['image/tiff', 'x.tiff', false],
  ])('needsFormatConversion(%s, %s) === %s', (fileType, fileName, expected) => {
    expect(needsFormatConversion(fileType, fileName)).toBe(expected);
  });
});

describe('isUncompressibleImage', () => {
  it.each([
    ['image/heic', 'a.heic', true],
    ['image/heif', 'a.heif', true],
    ['image/tiff', 'a.tiff', true],
    ['', 'scan.TIF', true],
    ['', 'iphone.HEIC', true],
    ['image/heic', 'a.jpg', true],
    ['image/jpeg', 'a.tiff', true],
    ['image/jpeg', 'a.jpg', false],
    ['image/png', 'a.png', false],
    ['image/bmp', 'a.bmp', false],
    ['image/gif', 'a.gif', false],
    ['image/webp', 'a.webp', false],
  ])('isUncompressibleImage(%s, %s) === %s', (fileType, fileName, expected) => {
    expect(isUncompressibleImage(fileType, fileName)).toBe(expected);
  });

  it('HEIC is classified as a raster image but flagged uncompressible at the same time', () => {
    expect(isRasterImage('image/heic', 'a.heic')).toBe(true);
    expect(isUncompressibleImage('image/heic', 'a.heic')).toBe(true);
  });
});
