import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { scanForCdnUrls } from '../build/externalUrls';

// The same scan as src/ocr/offline.test.ts, but here the build always exists.
test('the build output, source and index.html contain no CDN URLs', () => {
  expect(
    scanForCdnUrls(fileURLToPath(new URL('..', import.meta.url)), { includeDist: true }),
  ).toEqual([]);
});
