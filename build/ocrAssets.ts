import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Receipt scanning runs entirely on this device, so tesseract's worker, wasm cores and English
 * language data must come from our own origin. Nothing is committed: they are copied out of
 * node_modules at build time (and served from memory in dev) and each is checked against a
 * pinned SHA-256, so a changed dependency fails the build instead of shipping silently.
 *
 * To upgrade tesseract: bump the versions in package.json, run the build, and replace the
 * hashes below with the ones it reports.
 */
export interface OcrAsset {
  /** Path inside node_modules. */
  from: string;
  /** Path inside the built site. */
  to: string;
  sha256: string;
}

const LANG = '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';

export const OCR_ASSETS: OcrAsset[] = [
  {
    from: 'tesseract.js/dist/worker.min.js',
    to: 'ocr/worker.min.js',
    sha256: '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d',
  },
  // All three LSTM-only cores: tesseract.js picks the fastest one this browser can run
  // (relaxed SIMD, then SIMD, then plain wasm). Only one is downloaded per device. The .wasm.js
  // files embed the wasm, so no separate .wasm is needed.
  {
    from: 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    to: 'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js',
    sha256: '861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3',
  },
  {
    from: 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    to: 'ocr/core/tesseract-core-simd-lstm.wasm.js',
    sha256: 'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38',
  },
  {
    from: 'tesseract.js-core/tesseract-core-lstm.wasm.js',
    to: 'ocr/core/tesseract-core-lstm.wasm.js',
    sha256: 'eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680',
  },
  {
    from: LANG,
    to: 'ocr/lang/eng.traineddata.gz',
    sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  },
  {
    from: 'tesseract.js/LICENSE.md',
    to: 'ocr/licenses/tesseract.js.LICENSE.md',
    sha256: 'b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1',
  },
  {
    from: 'tesseract.js-core/LICENSE',
    to: 'ocr/licenses/tesseract.js-core.LICENSE',
    sha256: 'c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08',
  },
];

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.md': 'text/markdown; charset=utf-8',
  '.gz': 'application/gzip',
};

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Read every asset and verify its hash. Throws a clear error if one is missing or changed. */
export function loadOcrAssets(root: string, assets: OcrAsset[] = OCR_ASSETS): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const a of assets) {
    const file = resolve(root, 'node_modules', a.from);
    if (!existsSync(file)) {
      throw new Error(`OCR asset missing: ${a.from}. Run npm ci.`);
    }
    const data = readFileSync(file);
    const actual = sha256(data);
    if (actual !== a.sha256) {
      throw new Error(
        `OCR asset ${a.from} changed.\n  expected sha256 ${a.sha256}\n  actual   sha256 ${actual}`,
      );
    }
    out.set(a.to, data);
  }
  return out;
}

export function ocrAssets(): Plugin {
  let files = new Map<string, Buffer>();
  return {
    name: 'mealsplit-ocr-assets',
    configResolved(config) {
      files = loadOcrAssets(config.root);
    },
    // Dev server: serve the same files from memory.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const data = files.get(path);
        if (!data) return next();
        res.setHeader(
          'Content-Type',
          MIME[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream',
        );
        res.end(data);
      });
    },
    generateBundle() {
      for (const [fileName, source] of files) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
