// The pure parts of OCR: image sizing, where the files live, progress, error wording.
// Everything touching the DOM or tesseract.js is in image.ts and ocr.ts.

/** Photos bigger than this (on the long side) are shrunk before OCR: faster, and iOS runs out of memory otherwise. */
export const MAX_SIDE = 2200;
/** Smaller images (screenshots) are scaled up to this, since tesseract reads tiny text poorly. */
export const MIN_SIDE = 1400;

/** The canvas size to OCR at. Keeps the aspect ratio; never changes images already in range. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(width > 0 && height > 0)) throw new RangeError('Image has no size');
  const scale = Math.min(MAX_SIDE / long, Math.max(1, MIN_SIDE / long));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface OcrUrls {
  workerPath: string;
  corePath: string;
  langPath: string;
}

/**
 * Where tesseract.js finds its files. All three are absolute URLs on this app's own origin
 * (a worker resolves relative paths against its own script, not the page). `corePath` and
 * `langPath` are directories: tesseract.js picks the core file there by feature detection.
 */
export function ocrUrls(baseUrl: string, documentUrl: string): OcrUrls {
  const root = new URL(`${baseUrl.replace(/\/?$/, '/')}ocr/`, documentUrl);
  return {
    workerPath: new URL('worker.min.js', root).href,
    corePath: new URL('core/', root).href.replace(/\/$/, ''),
    langPath: new URL('lang/', root).href.replace(/\/$/, ''),
  };
}

export interface OcrProgress {
  message: string;
  /** 0 to 1 across the whole scan. */
  progress: number;
}

// tesseract.js reports `status` and a 0..1 `progress` per stage; each stage gets a slice of the bar.
// Loading is most of the first scan (about 4 MB of core plus 3 MB of data), reading is the rest.
const STAGES: Record<string, { message: string; from: number; to: number }> = {
  'loading tesseract core': { message: 'Loading text recognition…', from: 0.08, to: 0.3 },
  'initializing tesseract': { message: 'Starting…', from: 0.3, to: 0.34 },
  'loading language traineddata': { message: 'Loading English data…', from: 0.34, to: 0.55 },
  'initializing api': { message: 'Starting…', from: 0.55, to: 0.6 },
  'recognizing text': { message: 'Reading receipt…', from: 0.6, to: 0.98 },
};

/** Map a tesseract.js log message to a message and overall progress. Unknown statuses return null. */
export function describeProgress(status: string, stageProgress: number): OcrProgress | null {
  const stage = STAGES[status];
  if (!stage) return null;
  const p = Math.min(1, Math.max(0, Number.isFinite(stageProgress) ? stageProgress : 0));
  return { message: stage.message, progress: stage.from + (stage.to - stage.from) * p };
}

/** A scan the user cancelled. Not an error: the UI says "cancelled" and leaves the text alone. */
export class ScanCancelled extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelled';
  }
}

/** Plain-language reason for a failed scan. tesseract.js sometimes rejects with a bare string. */
export function describeOcrError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : typeof err === 'string' ? err : '').trim();
  if (/importScripts|NetworkError|Failed to fetch|Load failed|\b404\b|worker/i.test(raw)) {
    return 'Could not load the text recognition files. Check your connection and try again.';
  }
  if (/memory/i.test(raw)) return 'The photo is too large for this device. Try a smaller one.';
  return raw || 'Something went wrong reading the photo.';
}
