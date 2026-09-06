import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

/**
 * Last-resort compression for scanned/image-heavy PDFs that lossless
 * recompression (pdfBundle.ts's mergePdfs) can't shrink further — pdf-lib
 * has no API to reach into an existing PDF's embedded image XObjects and
 * downsample them in place. Instead, each page is rendered to a canvas via
 * pdf.js and re-encoded as a JPEG at a reduced DPI/quality (mirroring
 * imageCompress.ts's approach), then reassembled into a new PDF with pdf-lib.
 *
 * This flattens the page to a raster image — any selectable text layer is
 * lost — which is the accepted tradeoff for scanned documents that were
 * already just a photo of a piece of paper. Only used as a fallback when the
 * losslessly-recompressed PDF is still over target size.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/** Never render below this DPI, even to hit the target size. */
const MIN_DPI = 72;
/** Never drop JPEG quality below this, even to hit the target size. */
const MIN_QUALITY = 0.4;
const MAX_ATTEMPTS = 6;

async function renderAllPages(bytes: Uint8Array, dpi: number, quality: number): Promise<{ jpegs: Uint8Array[]; sizes: { width: number; height: number }[] }> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const jpegs: Uint8Array[] = [];
  const sizes: { width: number; height: number }[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      // eslint-disable-next-line no-await-in-loop
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: ctx, viewport }).promise;
      // eslint-disable-next-line no-await-in-loop
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))), 'image/jpeg', quality);
      });
      // eslint-disable-next-line no-await-in-loop
      jpegs.push(new Uint8Array(await blob.arrayBuffer()));
      sizes.push({ width: canvas.width, height: canvas.height });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return { jpegs, sizes };
}

async function buildPdfFromJpegs(jpegs: Uint8Array[], sizes: { width: number; height: number }[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (let i = 0; i < jpegs.length; i++) {
    const img = await out.embedJpg(jpegs[i]);
    const page = out.addPage([sizes[i].width, sizes[i].height]);
    page.drawImage(img, { x: 0, y: 0, width: sizes[i].width, height: sizes[i].height });
  }
  out.setTitle('');
  out.setAuthor('');
  out.setCreator('Edamame Legal Flow');
  out.setProducer('');
  out.setSubject('');
  out.setKeywords([]);
  return out.save({ useObjectStreams: true });
}

/**
 * Rasterize every page of a PDF and re-encode as reduced-DPI/quality JPEGs,
 * iterating down from 150 DPI until the rebuilt PDF fits targetBytes or the
 * DPI/quality floor is hit. Returns null if pdf.js can't parse/render the
 * PDF (e.g. it's corrupt or password-protected) — caller should fall back
 * to the original bytes in that case.
 */
export async function rasterizeAndCompressPdf(bytes: Uint8Array, targetBytes: number): Promise<Uint8Array | null> {
  try {
    let dpi = 150;
    let quality = 0.8;
    let best: Uint8Array | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const { jpegs, sizes } = await renderAllPages(bytes, dpi, quality);
      // eslint-disable-next-line no-await-in-loop
      const rebuilt = await buildPdfFromJpegs(jpegs, sizes);
      if (!best || rebuilt.length < best.length) best = rebuilt;
      if (rebuilt.length <= targetBytes) return rebuilt;

      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.15);
      } else if (dpi > MIN_DPI) {
        dpi = Math.max(MIN_DPI, Math.round(dpi * 0.75));
        quality = 0.7; // fresh quality budget after dropping resolution
      } else {
        break; // nothing more we can safely do
      }
    }
    return best;
  } catch {
    return null;
  }
}
