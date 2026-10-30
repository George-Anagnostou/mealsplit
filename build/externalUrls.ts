import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * mealsplit makes no third-party requests at runtime: no CDN scripts, fonts, models or data.
 * These helpers back the guard tests (src/ocr/offline.test.ts and e2e/offline.spec.ts).
 */

const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;

/** Hosts that only exist to serve files to other people's sites. Plain links (venmo.com) are fine. */
const CDN_HOST =
  /(^|\.)(jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|skypack\.dev|jspm\.io|googleapis\.com|gstatic\.com|bootstrapcdn\.com|cloudfront\.net|fastly\.net|azureedge\.net|statically\.io|githack\.com|rawgit\.com)$|^cdn[.-]/i;

/**
 * tesseract.js ships default CDN addresses for its worker, core and language data. They are dead
 * code here, since src/ocr passes all three paths, and they are only tolerated inside the build
 * output (never in our own source). e2e/ocr.spec.ts proves nothing is requested from them.
 */
const TESSERACT_UNUSED_DEFAULTS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@v',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@v',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/',
];

const isCdn = (url: string): boolean => {
  try {
    return CDN_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

interface FindOptions {
  /** HTML and CSS, where any http(s) URL means a request: flag them all, not just CDNs. */
  strict?: boolean;
  allowedPrefixes?: string[];
}

/** CDN URLs found in `text`. */
export function findCdnUrls(text: string, opts: FindOptions = {}): string[] {
  const allowed = opts.allowedPrefixes ?? [];
  return (text.match(URL_RE) ?? []).filter(
    (u) => !allowed.some((p) => u.startsWith(p)) && (opts.strict || isCdn(u)),
  );
}

const TEXT_FILE = /\.(ts|tsx|js|mjs|css|html|json|webmanifest|svg)$/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export interface Finding {
  file: string;
  url: string;
}

/** Scan source, index.html, public/ and (if built) dist/ under `root`. */
export function scanForCdnUrls(root: string, opts: { includeDist: boolean }): Finding[] {
  const out: Finding[] = [];
  const scan = (file: string, o: FindOptions = {}) => {
    const strict = /\.(html|css)$/.test(file);
    for (const url of findCdnUrls(readFileSync(file, 'utf8'), { strict, ...o })) {
      out.push({ file: relative(root, file), url });
    }
  };
  const roots: [string, FindOptions][] = [
    ['src', {}],
    ['public', {}],
  ];
  if (opts.includeDist) roots.push(['dist', { allowedPrefixes: TESSERACT_UNUSED_DEFAULTS }]);
  scan(join(root, 'index.html'));
  for (const [dir, o] of roots) {
    if (!existsSync(join(root, dir))) continue;
    for (const file of walk(join(root, dir))) {
      if (TEXT_FILE.test(file) && !/\.test\.ts$/.test(file)) scan(file, o);
    }
  }
  return out;
}
