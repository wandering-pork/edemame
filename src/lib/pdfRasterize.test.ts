import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-stub-url' }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

// rasterizeAndCompressPdf rebuilds a PDF from JPEG pages via pdf-lib's
// embedJpg/addPage/save. Producing genuinely pdf-lib-parseable JPEG bytes at
// arbitrary scripted sizes is fiddly (embedJpg validates real JPEG
// structure), so — per the spec's own recommended fallback for this file —
// pdf-lib is mocked too. The fake tracks exactly what the real module would
// need: embedded JPEG byte lengths (summed into the rebuilt "file size" the
// iteration policy reacts to), page dimensions, and the metadata calls.
const pdfLibInstances: any[] = [];
vi.mock('pdf-lib', () => {
  class FakePage {
    dims: [number, number];
    draws: any[] = [];
    constructor(dims: [number, number]) {
      this.dims = dims;
    }
    drawImage(img: any, opts: any) {
      this.draws.push({ img, opts });
    }
  }
  class FakePDFDocument {
    pages: FakePage[] = [];
    jpegSizes: number[] = [];
    meta: Record<string, unknown> = {};
    static async create() {
      const doc = new FakePDFDocument();
      pdfLibInstances.push(doc);
      return doc;
    }
    async embedJpg(bytes: Uint8Array) {
      this.jpegSizes.push(bytes.length);
      return { width: 1, height: 1 };
    }
    addPage(dims: [number, number]) {
      const page = new FakePage(dims);
      this.pages.push(page);
      return page;
    }
    setTitle(v: string) {
      this.meta.title = v;
    }
    setAuthor(v: string) {
      this.meta.author = v;
    }
    setCreator(v: string) {
      this.meta.creator = v;
    }
    setProducer(v: string) {
      this.meta.producer = v;
    }
    setSubject(v: string) {
      this.meta.subject = v;
    }
    setKeywords(v: string[]) {
      this.meta.keywords = v;
    }
    async save() {
      const total = this.jpegSizes.reduce((a, b) => a + b, 0);
      return new Uint8Array(total);
    }
  }
  return { PDFDocument: FakePDFDocument };
});

import { getDocument } from 'pdfjs-dist';
import { rasterizeAndCompressPdf } from './pdfRasterize';

function installCanvasFake(sizeFor: (width: number, height: number, quality: number) => number) {
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

function installFailingContextCanvas() {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return { width: 0, height: 0, getContext: () => null, toBlob: () => {} };
    },
  });
}

function fakePdf(numPages: number, viewportSize = { width: 595, height: 842 }) {
  const renders: { page: number; scale: number }[] = [];
  const doc: any = {
    numPages,
    getPage: async (i: number) => ({
      getViewport: ({ scale }: { scale: number }) => {
        renders.push({ page: i, scale });
        return { width: viewportSize.width * scale, height: viewportSize.height * scale };
      },
      render: () => ({ promise: Promise.resolve() }),
      cleanup: () => {},
    }),
    destroy: vi.fn(async () => {}),
  };
  vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(doc) } as any);
  return { doc, renders };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getDocument).mockReset();
  pdfLibInstances.length = 0;
});

describe('rasterizeAndCompressPdf', () => {
  it('returns immediately at 150 DPI when the first attempt already fits', async () => {
    const { renders, doc } = fakePdf(3);
    installCanvasFake(() => 1 * 1024 * 1024);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(3 * 1024 * 1024);
    expect(renders.length).toBe(3);
    for (const r of renders) expect(r.scale).toBeCloseTo(150 / 72, 5);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('records quality 0.8 on every page of a multi-page first-pass fit', async () => {
    const { renders } = fakePdf(3);
    const calls = installCanvasFake(() => 1 * 1024 * 1024);

    await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(calls.length).toBe(3);
    for (const c of calls) expect(c.quality).toBeCloseTo(0.8, 5);
    expect(renders.map((r) => r.page)).toEqual([1, 2, 3]);
  });

  it('walks the quality ladder before dropping DPI', async () => {
    fakePdf(1);
    const target = 4.9 * 1024 * 1024;
    const calls = installCanvasFake((_w, _h, q) => (q > 0.4 ? 9 * 1024 * 1024 : 4 * 1024 * 1024));

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), target);

    expect(calls.map((c) => c.quality)).toEqual([
      expect.closeTo(0.8, 5),
      expect.closeTo(0.65, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.4, 5),
    ]);
    for (const c of calls) expect(c.width / c.height).toBeCloseTo(595 / 842, 2);
    expect(result!.length).toBe(4 * 1024 * 1024);
  });

  it('drops DPI after the quality floor is hit, with a fresh quality budget', async () => {
    const { renders } = fakePdf(1);
    // Never actually meets the target within MAX_ATTEMPTS — forces the full
    // quality ladder, then one DPI step, to be observed.
    const calls = installCanvasFake(() => 9 * 1024 * 1024);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 1024);

    expect(calls.slice(0, 4).map((c) => c.quality)).toEqual([
      expect.closeTo(0.8, 5),
      expect.closeTo(0.65, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.4, 5),
    ]);
    for (const r of renders.slice(0, 4)) expect(r.scale).toBeCloseTo(150 / 72, 5);

    // Math.round(150 * 0.75) === 113
    expect(renders[4].scale).toBeCloseTo(113 / 72, 5);
    expect(calls[4].quality).toBeCloseTo(0.7, 5);

    // Never returns null just because the target was never met.
    expect(result).not.toBeNull();
  });

  it('never renders below MIN_DPI (72) and returns the smallest attempt seen, not the last', async () => {
    fakePdf(1);
    const sizes = [8_000_000, 3_000_000, 9_000_000, 9_000_000, 9_000_000, 9_000_000];
    let attempt = 0;
    const renders: number[] = [];
    installCanvasFake((w, h) => {
      renders.push(w);
      const size = sizes[attempt] ?? sizes[sizes.length - 1];
      attempt += 1;
      return size;
    });

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 1 * 1024 * 1024);

    // The discriminating assertion: 3 MB (the smallest seen) must win over
    // the later, larger 9 MB attempts and over the very last attempt too —
    // unlike compressImage (§1.5), which returns the *last* attempt.
    expect(result!.length).toBe(3_000_000);
    expect(attempt).toBeLessThanOrEqual(6);
  });

  it('caps at MAX_ATTEMPTS (6) and resolves', async () => {
    fakePdf(1);
    const calls = installCanvasFake(() => 9 * 1024 * 1024);

    await expect(rasterizeAndCompressPdf(new Uint8Array(10), 1024)).resolves.toBeDefined();
    expect(calls.length).toBeLessThanOrEqual(6);
  });

  it('renders each page in order with the page sizes preserved', async () => {
    const { renders } = fakePdf(5, { width: 595, height: 842 });
    const calls = installCanvasFake(() => 1024);

    await rasterizeAndCompressPdf(new Uint8Array(10), 10 * 1024 * 1024);

    expect(renders.map((r) => r.page)).toEqual([1, 2, 3, 4, 5]);
    expect(calls.length).toBe(5);
    const expectedWidth = Math.round(595 * (150 / 72));
    const expectedHeight = Math.round(842 * (150 / 72));
    for (const c of calls) {
      expect(c.width).toBe(expectedWidth);
      expect(c.height).toBe(expectedHeight);
    }
  });

  it('preserves mixed page orientations (portrait + landscape)', async () => {
    const renders: { page: number; scale: number }[] = [];
    const doc: any = {
      numPages: 2,
      getPage: async (i: number) => ({
        getViewport: ({ scale }: { scale: number }) => {
          renders.push({ page: i, scale });
          const base = i === 1 ? { width: 595, height: 842 } : { width: 842, height: 595 };
          return { width: base.width * scale, height: base.height * scale };
        },
        render: () => ({ promise: Promise.resolve() }),
        cleanup: () => {},
      }),
      destroy: vi.fn(async () => {}),
    };
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(doc) } as any);
    const calls = installCanvasFake(() => 1024);

    await rasterizeAndCompressPdf(new Uint8Array(10), 10 * 1024 * 1024);

    const scale = 150 / 72;
    expect(calls[0]).toMatchObject({ width: Math.round(595 * scale), height: Math.round(842 * scale) });
    expect(calls[1]).toMatchObject({ width: Math.round(842 * scale), height: Math.round(595 * scale) });
  });

  it('handles a zero-page PDF without throwing, returning a non-null result', async () => {
    const { doc } = fakePdf(0);
    const calls = installCanvasFake(() => 1024);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(result).not.toBeNull();
    expect(calls.length).toBe(0);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns null when pdf.js fails to parse the document', async () => {
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.reject(new Error('InvalidPDFException')) } as any);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(result).toBeNull();
  });

  it('returns null (not a rejection) when page.render() fails mid-way', async () => {
    const doc: any = {
      numPages: 3,
      getPage: async (i: number) => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
        render: () => ({ promise: i === 2 ? Promise.reject(new Error('render failed')) : Promise.resolve() }),
        cleanup: () => {},
      }),
      destroy: vi.fn(async () => {}),
    };
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(doc) } as any);
    installCanvasFake(() => 1024);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(result).toBeNull();
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns null when the 2D context is unavailable', async () => {
    fakePdf(1);
    installFailingContextCanvas();

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(result).toBeNull();
  });

  it('destroys the pdf.js document even when rendering fails partway through', async () => {
    const destroy = vi.fn(async () => {});
    const doc: any = {
      numPages: 3,
      getPage: async (i: number) => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
        render: () => ({ promise: i === 2 ? Promise.reject(new Error('boom')) : Promise.resolve() }),
        cleanup: () => {},
      }),
      destroy,
    };
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(doc) } as any);
    installCanvasFake(() => 1024);

    await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('strips output metadata and stamps the Edamame creator', async () => {
    fakePdf(1);
    installCanvasFake(() => 1024);

    await rasterizeAndCompressPdf(new Uint8Array(10), 5 * 1024 * 1024);

    expect(pdfLibInstances.length).toBe(1);
    const meta = pdfLibInstances[0].meta;
    expect(meta.title).toBe('');
    expect(meta.author).toBe('');
    expect(meta.subject).toBe('');
    expect(meta.producer).toBe('');
    expect(meta.keywords).toEqual([]);
    expect(meta.creator).toBe('Edamame Legal Flow');
  });

  it('exact-boundary: an attempt exactly at targetBytes is accepted without a further pass', async () => {
    fakePdf(1);
    const target = 3 * 1024 * 1024;
    const calls = installCanvasFake(() => target);

    const result = await rasterizeAndCompressPdf(new Uint8Array(10), target);

    expect(calls.length).toBe(1);
    expect(result!.length).toBe(target);
  });
});
