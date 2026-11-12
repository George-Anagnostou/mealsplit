import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { OCR_ASSETS } from './ocrAssets.ts';

/**
 * Builds the service worker. build/sw.template.js is the worker; this fills in three values:
 *
 *  - the precache list: every file the app shell needs (index.html, the hashed JS/CSS, the
 *    manifest and icons), so the whole shell is cached when the worker installs;
 *  - a version, derived from the content of those files, which names the shell cache. Any change
 *    to the app produces a new worker file, which is how the browser knows to update;
 *  - the version of the OCR files, which names their (separate, long-lived) cache.
 *
 * No dependencies, so it runs on the same Node versions as the rest of the build.
 */
export interface FileEntry {
  /** Path inside the built site, forward slashes, e.g. `assets/index-abc.js`. */
  fileName: string;
  content: string | Uint8Array;
}

export const SW_FILE = 'sw.js';
export const OCR_PREFIX = 'ocr/';

const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/**
 * The shell: everything except the OCR files (fetched on first scan), source maps, and the
 * worker itself. Sorted, so the same input always gives the same list and version.
 */
export function precacheEntries(files: FileEntry[]): { url: string; hash: string }[] {
  const seen = new Map<string, string>();
  for (const f of files) {
    const name = f.fileName;
    if (name === SW_FILE || name.startsWith(OCR_PREFIX) || name.endsWith('.map')) continue;
    seen.set(name, hash(f.content));
  }
  return [...seen]
    .map(([url, h]) => ({ url, hash: h }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/** A short id for a set of files: changes whenever a name or any content changes. */
export function versionOf(entries: { url: string; hash: string }[]): string {
  return hash(entries.map((e) => `${e.url}:${e.hash}`).join('\n')).slice(0, 12);
}

export function ocrVersion(assets = OCR_ASSETS): string {
  return versionOf(assets.map((a) => ({ url: a.to, hash: a.sha256 })));
}

export function renderServiceWorker(
  template: string,
  opts: { version: string; ocrVersion: string; precache: string[] },
): string {
  const fill = (src: string, token: string, value: string) => {
    if (!src.includes(token)) throw new Error(`sw.template.js is missing the ${token} placeholder`);
    return src.split(token).join(value);
  };
  let out = fill(template, '__SW_VERSION__', opts.version);
  out = fill(out, '__OCR_VERSION__', opts.ocrVersion);
  out = fill(out, '/*__PRECACHE__*/ []', JSON.stringify(opts.precache));
  return out;
}

function walkRelative(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  const visit = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, d.name);
      if (d.isDirectory()) visit(full);
      else
        out.push({
          fileName: relative(root, full).split(sep).join('/'),
          content: readFileSync(full),
        });
    }
  };
  visit(root);
  return out;
}

export function pwa(): Plugin {
  let publicDir: string | false = false;
  return {
    name: 'mealsplit-pwa',
    apply: 'build',
    // Run after every other plugin has added its files to the bundle.
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files: FileEntry[] = [];
      for (const [fileName, item] of Object.entries(bundle)) {
        files.push({ fileName, content: item.type === 'chunk' ? item.code : item.source });
      }
      // Vite copies public/ into the output after this hook, so read it from disk.
      if (publicDir) files.push(...walkRelative(publicDir));
      const entries = precacheEntries(files);
      const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE,
        source: renderServiceWorker(template, {
          version: versionOf(entries),
          ocrVersion: ocrVersion(),
          precache: entries.map((e) => e.url),
        }),
      });
    },
  };
}
