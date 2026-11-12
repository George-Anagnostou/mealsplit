import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findCdnUrls, scanForCdnUrls } from '../../build/externalUrls';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('no third-party requests at runtime', () => {
  it('finds CDN URLs', () => {
    expect(findCdnUrls('<script src="https://cdn.jsdelivr.net/npm/x@1/x.js">')).toEqual([
      'https://cdn.jsdelivr.net/npm/x@1/x.js',
    ]);
    for (const u of [
      'https://unpkg.com/x',
      'https://cdnjs.cloudflare.com/ajax/libs/x.js',
      'https://fonts.googleapis.com/css?family=Inter',
      'https://fonts.gstatic.com/s/inter.woff2',
      'https://cdn.example.com/a.js',
      'https://esm.sh/react',
      'https://d111.cloudfront.net/a.js',
    ]) {
      expect(findCdnUrls(`fetch("${u}")`)).toHaveLength(1);
    }
  });

  it('lets plain links through, but not in HTML or CSS where a URL is a request', () => {
    expect(
      findCdnUrls('const u = `https://venmo.com/?txn=charge`; // http://www.w3.org/2000/svg'),
    ).toEqual([]);
    expect(
      findCdnUrls('<link rel="stylesheet" href="https://example.com/a.css">', { strict: true }),
    ).toHaveLength(1);
    expect(findCdnUrls('@import url(https://example.com/a.css)', { strict: true })).toHaveLength(1);
  });

  it('honours an allowlist of exact prefixes', () => {
    const u = 'https://cdn.jsdelivr.net/npm/tesseract.js@v7/x.js';
    expect(
      findCdnUrls(u, { allowedPrefixes: ['https://cdn.jsdelivr.net/npm/tesseract.js@v'] }),
    ).toEqual([]);
    expect(
      findCdnUrls(u, { allowedPrefixes: ['https://cdn.jsdelivr.net/npm/other'] }),
    ).toHaveLength(1);
  });

  it('source, index.html and public/ have no CDN URLs', () => {
    expect(scanForCdnUrls(root, { includeDist: false })).toEqual([]);
  });

  // Needs a build. e2e/offline.spec.ts runs the same scan unconditionally, after building.
  it.skipIf(!existsSync(resolve(root, 'dist')))('the build output has no CDN URLs', () => {
    expect(scanForCdnUrls(root, { includeDist: true })).toEqual([]);
  });
});
