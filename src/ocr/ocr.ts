// Photo -> text, entirely on this device. tesseract.js and its files are loaded only when a
// photo is chosen (dynamic import), and every file comes from this app's own origin.
import { prepImage } from './image';
import {
  describeOcrError,
  describeProgress,
  type OcrProgress,
  ocrUrls,
  ScanCancelled,
} from './plan';

export { ScanCancelled } from './plan';

export type OnProgress = (p: OcrProgress) => void;

/**
 * Run OCR on a receipt photo and return the recognised text.
 * Pass an AbortSignal to cancel: the worker is terminated and this rejects with ScanCancelled.
 * Any other failure rejects with an Error whose message is fit to show to the user.
 */
export async function scanReceipt(
  file: File,
  onProgress: OnProgress,
  signal?: AbortSignal,
): Promise<string> {
  const cancelled = new Promise<never>((_, reject) => {
    if (signal?.aborted) reject(new ScanCancelled());
    signal?.addEventListener('abort', () => reject(new ScanCancelled()), { once: true });
  });
  cancelled.catch(() => {}); // only observed through the races below

  let best = 0;
  const report = (p: OcrProgress) => {
    best = Math.max(best, p.progress);
    onProgress({ message: p.message, progress: best });
  };

  let worker: { terminate(): Promise<unknown> } | undefined;
  try {
    report({ message: 'Preparing photo…', progress: 0.02 });
    const canvas = await Promise.race([prepImage(file), cancelled]);

    report({ message: 'Loading text recognition…', progress: 0.06 });
    const { default: tesseract } = await Promise.race([import('tesseract.js'), cancelled]);
    const urls = ocrUrls(import.meta.env.BASE_URL, document.baseURI);

    const starting = tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
      ...urls,
      gzip: true,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: (m) => {
        const p = describeProgress(m.status, m.progress);
        if (p) report(p);
      },
    });
    // If the user cancels while the worker is still starting, shut it down once it exists.
    starting.then(
      (w) => {
        if (signal?.aborted) void w.terminate();
      },
      () => {},
    );
    const w = await Promise.race([starting, cancelled]);
    worker = w;

    await Promise.race([
      w.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      }),
      cancelled,
    ]);
    const { data } = await Promise.race([w.recognize(canvas), cancelled]);
    canvas.width = canvas.height = 0; // let iOS reclaim the pixels
    return data.text;
  } catch (err) {
    if (err instanceof ScanCancelled) throw err;
    throw new Error(describeOcrError(err));
  } finally {
    // Terminating ends the worker thread at once, mid-recognition if need be.
    void worker?.terminate();
  }
}
