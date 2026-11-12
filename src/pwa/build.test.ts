import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OCR_ASSETS } from '../../build/ocrAssets';
import { ocrVersion, precacheEntries, renderServiceWorker, versionOf } from '../../build/pwa';

const file = (fileName: string, content = fileName) => ({ fileName, content });
const template = readFileSync(new URL('../../build/sw.template.js', import.meta.url), 'utf8');

describe('precacheEntries', () => {
  const files = [
    file('index.html'),
    file('assets/index-abc.js'),
    file('assets/index-abc.js.map'),
    file('assets/index-def.css'),
    file('manifest.webmanifest'),
    file('icons/icon-192.png', 'png'),
    file('ocr/worker.min.js'),
    file('ocr/lang/eng.traineddata.gz'),
    file('sw.js'),
  ];

  it('lists the app shell, sorted', () => {
    expect(precacheEntries(files).map((e) => e.url)).toEqual([
      'assets/index-abc.js',
      'assets/index-def.css',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('leaves out the OCR files (cached on first scan), source maps and the worker itself', () => {
    const urls = precacheEntries(files).map((e) => e.url);
    expect(urls.some((u) => u.startsWith('ocr/'))).toBe(false);
    expect(urls.some((u) => u.endsWith('.map'))).toBe(false);
    expect(urls).not.toContain('sw.js');
  });

  it('gives the same answer whatever order the files arrive in', () => {
    expect(precacheEntries([...files].reverse())).toEqual(precacheEntries(files));
  });

  it('hashes byte content as well as text', () => {
    const png = (bytes: number[]) =>
      precacheEntries([{ fileName: 'a.png', content: new Uint8Array(bytes) }]);
    expect(png([1, 2, 3])).toHaveLength(1);
    expect(png([1, 2, 3])[0]?.hash).not.toBe(png([1, 2, 4])[0]?.hash);
  });
});

describe('versionOf', () => {
  const base = precacheEntries([file('index.html', 'a'), file('assets/x.js', 'b')]);

  it('is a short stable id', () => {
    expect(versionOf(base)).toMatch(/^[0-9a-f]{12}$/);
    expect(versionOf(base)).toBe(
      versionOf(precacheEntries([file('index.html', 'a'), file('assets/x.js', 'b')])),
    );
  });

  it('changes when any file changes, is added, or is renamed', () => {
    const v = versionOf(base);
    expect(
      versionOf(precacheEntries([file('index.html', 'a2'), file('assets/x.js', 'b')])),
    ).not.toBe(v);
    expect(
      versionOf(
        precacheEntries([file('index.html', 'a'), file('assets/x.js', 'b'), file('c.css')]),
      ),
    ).not.toBe(v);
    expect(
      versionOf(precacheEntries([file('index.html', 'a'), file('assets/y.js', 'b')])),
    ).not.toBe(v);
  });
});

describe('ocrVersion', () => {
  it('tracks the pinned OCR hashes', () => {
    expect(ocrVersion()).toMatch(/^[0-9a-f]{12}$/);
    expect(ocrVersion()).toBe(ocrVersion(OCR_ASSETS));
    expect(ocrVersion(OCR_ASSETS.slice(1))).not.toBe(ocrVersion());
  });
});

describe('renderServiceWorker', () => {
  const opts = { version: 'v123', ocrVersion: 'o456', precache: ['index.html', 'assets/a b.js'] };

  it('fills in the version, OCR version and precache list', () => {
    const out = renderServiceWorker(template, opts);
    expect(out).toContain("const VERSION = 'v123';");
    expect(out).toContain("const OCR_VERSION = 'o456';");
    expect(out).toContain('const PRECACHE = ["index.html","assets/a b.js"];');
    expect(out).not.toContain('__SW_VERSION__');
    expect(out).not.toContain('__OCR_VERSION__');
    expect(out).not.toContain('__PRECACHE__');
  });

  it('refuses a template that is missing a placeholder', () => {
    expect(() => renderServiceWorker('const VERSION = 1;', opts)).toThrow(/__SW_VERSION__/);
    expect(() => renderServiceWorker("const A = '__SW_VERSION__';", opts)).toThrow(
      /__OCR_VERSION__/,
    );
    expect(() => renderServiceWorker("'__SW_VERSION__' '__OCR_VERSION__'", opts)).toThrow(
      /__PRECACHE__/,
    );
  });
});
