// Photo -> text. tesseract.js is loaded on demand from a CDN for now;
// a later PR vendors a pinned copy locally and drops the CDN.

interface TesseractWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

interface TesseractLogger {
  status?: string;
  progress?: number;
}

interface TesseractGlobal {
  createWorker(
    lang: string,
    oem: number,
    opts: { logger: (m: TesseractLogger) => void },
  ): Promise<TesseractWorker>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

export type OcrStatus = (message: string, progress?: number) => void;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the OCR library. Check your connection.'));
    document.head.appendChild(s);
  });

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = URL.createObjectURL(file);
  });
}

/** Downscale and grayscale + contrast-stretch; helps on phone photos of thermal paper. */
async function prepImage(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let w: number;
  let h: number;
  let src: CanvasImageSource;
  if (bmp) {
    w = bmp.width;
    h = bmp.height;
    src = bmp;
  } else {
    const im = await loadImage(file);
    w = im.naturalWidth;
    h = im.naturalHeight;
    src = im;
  }
  const scale = Math.min(2200 / Math.max(w, h), Math.max(1, 1400 / Math.max(w, h)));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Canvas is not available.');
  g.drawImage(src, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = y;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const y = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / span));
    px[i] = px[i + 1] = px[i + 2] = y;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Run OCR on a receipt photo and return the recognised text. */
export async function scanReceipt(file: File, onStatus: OcrStatus): Promise<string> {
  onStatus('Loading text recognition…', 0.02);
  await loadScript(TESS);
  const canvas = await prepImage(file);
  const tesseract = window.Tesseract;
  if (!tesseract) throw new Error('Could not load the OCR library.');
  const worker = await tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onStatus('Reading receipt…', m.progress);
      else if (m.status) onStatus(`${m.status[0].toUpperCase()}${m.status.slice(1)}…`, 0.05);
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data.text;
}
