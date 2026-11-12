import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderServiceWorker } from '../../build/pwa';

// Runs the real service worker (build/sw.template.js, filled in the way the build does) against a
// fake Cache API and network, so the caching rules are tested without a browser.

const template = readFileSync(new URL('../../build/sw.template.js', import.meta.url), 'utf8');
const ORIGIN = 'https://app.test';
const SCOPE = `${ORIGIN}/mealsplit/`;
const PRECACHE = [
  'index.html',
  'assets/index-abc.js',
  'assets/index-def.css',
  'manifest.webmanifest',
];

type Handler = (event: Record<string, unknown>) => void;

/** A Response whose `type` is what the browser would report. */
function res(
  body: string | null,
  init: { status?: number; type?: string; headers?: HeadersInit } = {},
) {
  const r = new Response(body, { status: init.status ?? 200, headers: init.headers });
  Object.defineProperty(r, 'type', { value: init.type ?? 'basic' });
  return r;
}
const text = (r: Response | undefined) => r?.clone().text();

function setup(
  opts: { version?: string; network?: (url: string) => Response | Promise<Response> } = {},
) {
  const handlers = new Map<string, Handler>();
  const store = new Map<string, Map<string, Response>>();
  const keyOf = (k: string | { url: string }) => (typeof k === 'string' ? k : k.url);
  const cacheNamed = (name: string) => {
    const entries = store.get(name) ?? new Map<string, Response>();
    store.set(name, entries);
    return {
      put: async (k: string | { url: string }, r: Response) => {
        entries.set(keyOf(k), r.clone());
      },
      match: async (k: string | { url: string }) => entries.get(keyOf(k))?.clone(),
    };
  };
  const caches = {
    open: async (name: string) => cacheNamed(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (k: string, o?: { cacheName?: string }) =>
      o?.cacheName ? store.get(o.cacheName)?.get(keyOf(k))?.clone() : undefined,
  };
  const network = vi.fn(async (req: string | { url: string }) =>
    (opts.network ?? ((u: string) => res(`net:${u}`)))(keyOf(req)),
  );
  const self = {
    registration: { scope: SCOPE },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
  };
  const source = renderServiceWorker(template, {
    version: opts.version ?? 'v1',
    ocrVersion: 'o1',
    precache: PRECACHE,
  });
  runInNewContext(source, {
    self,
    caches,
    fetch: network,
    Request,
    Response,
    URL,
    Promise,
    Set,
    Error,
  });

  /** Dispatch an event and wait for everything it handed to waitUntil / respondWith. */
  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<Response>) => {
        responded = Promise.resolve(p);
      },
    };
    handlers.get(type)?.(event);
    await Promise.all(waits);
    return { handled: responded !== undefined, response: await responded };
  }
  const get = (
    path: string,
    init: { mode?: string; method?: string; headers?: Record<string, string> } = {},
  ) =>
    dispatch('fetch', {
      request: {
        url: path.startsWith('http') ? path : `${SCOPE}${path}`,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'no-cors',
        headers: new Headers(init.headers),
      },
    });
  return { dispatch, get, store, network, self };
}

async function installed(opts?: Parameters<typeof setup>[0]) {
  const sw = setup(opts);
  await sw.dispatch('install');
  return sw;
}

describe('install', () => {
  it('downloads the whole shell into a cache named after the build', async () => {
    const sw = await installed();
    const cache = sw.store.get('mealsplit-shell-v1');
    expect([...(cache?.keys() ?? [])].sort()).toEqual(PRECACHE.map((p) => SCOPE + p).sort());
    expect(await text(cache?.get(`${SCOPE}index.html`))).toBe(`net:${SCOPE}index.html`);
  });

  it('bypasses the HTTP cache so a new build never precaches stale files', async () => {
    const sw = await installed();
    const first = sw.network.mock.calls[0]?.[0] as unknown as Request;
    expect(first.cache).toBe('reload');
  });

  it('fails the install, rather than caching a broken shell, if any file is an error', async () => {
    for (const bad of [
      res('nope', { status: 404 }),
      res('boom', { status: 500 }),
      res(null, { type: 'opaque' }),
    ]) {
      const sw = setup({ network: (u) => (u.endsWith('index-abc.js') ? bad : res('ok')) });
      await expect(sw.dispatch('install')).rejects.toThrow(/Could not cache/);
    }
  });

  it('does not take over by itself: an update waits until the page asks', async () => {
    const sw = await installed();
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });
});

describe('activate', () => {
  it('deletes the caches of older builds, keeps the current ones and anything not ours', async () => {
    const sw = setup({ version: 'v2' });
    for (const name of [
      'mealsplit-shell-v1',
      'mealsplit-shell-v2',
      'mealsplit-ocr-o0',
      'mealsplit-ocr-o1',
      'other-app',
    ]) {
      sw.store.set(name, new Map());
    }
    await sw.dispatch('activate');
    expect([...sw.store.keys()].sort()).toEqual([
      'mealsplit-ocr-o1',
      'mealsplit-shell-v2',
      'other-app',
    ]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe('message', () => {
  it('SKIP_WAITING activates the waiting worker; anything else is ignored', async () => {
    const sw = setup();
    await sw.dispatch('message', { data: { type: 'HELLO' } });
    await sw.dispatch('message', { data: null });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    await sw.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('fetch: the app shell', () => {
  it('serves precached files from the cache without touching the network', async () => {
    const sw = await installed();
    sw.network.mockClear();
    const r = await sw.get('assets/index-abc.js');
    expect(r.handled).toBe(true);
    expect(await text(r.response)).toBe(`net:${SCOPE}assets/index-abc.js`);
    expect(sw.network).not.toHaveBeenCalled();
  });

  it('ignores the query string', async () => {
    const sw = await installed();
    sw.network.mockClear();
    const r = await sw.get('manifest.webmanifest?v=3');
    expect(await text(r.response)).toBe(`net:${SCOPE}manifest.webmanifest`);
    expect(sw.network).not.toHaveBeenCalled();
  });

  it('answers any navigation inside the app with index.html', async () => {
    const sw = await installed();
    sw.network.mockClear();
    for (const path of ['', 'index.html', 'history?x=1', 'some/deep/link']) {
      const r = await sw.get(path, { mode: 'navigate' });
      expect(await text(r.response)).toBe(`net:${SCOPE}index.html`);
    }
    expect(sw.network).not.toHaveBeenCalled();
  });

  it('falls back to the network if the cache was evicted', async () => {
    const sw = setup();
    const r = await sw.get('assets/index-abc.js');
    expect(await text(r.response)).toBe(`net:${SCOPE}assets/index-abc.js`);
    expect(sw.network).toHaveBeenCalledTimes(1);
  });

  it('leaves everything else to the browser', async () => {
    const sw = await installed();
    expect((await sw.get('assets/unknown.js')).handled).toBe(false);
    expect((await sw.get('index.html', { method: 'POST' })).handled).toBe(false);
    expect((await sw.get('assets/index-abc.js', { headers: { range: 'bytes=0-9' } })).handled).toBe(
      false,
    );
    expect((await sw.get('https://cdn.example/lib.js')).handled).toBe(false);
    expect((await sw.get(`${ORIGIN}/other-app/`, { mode: 'navigate' })).handled).toBe(false);
  });
});

describe('fetch: OCR files', () => {
  const WORKER = 'ocr/worker.min.js';

  it('are fetched once, cached, then served offline', async () => {
    const sw = await installed();
    sw.network.mockClear();
    const first = await sw.get(WORKER);
    expect(await text(first.response)).toBe(`net:${SCOPE}${WORKER}`);
    expect(sw.network).toHaveBeenCalledTimes(1);
    expect(sw.store.get('mealsplit-ocr-o1')?.has(SCOPE + WORKER)).toBe(true);

    const second = await sw.get(`${WORKER}?cachebust=1`);
    expect(await text(second.response)).toBe(`net:${SCOPE}${WORKER}`);
    expect(sw.network).toHaveBeenCalledTimes(1);
  });

  it('keep working when the app is updated (they live in their own cache)', async () => {
    const sw = await installed();
    await sw.get(WORKER);
    await sw.dispatch('activate');
    expect(sw.store.has('mealsplit-ocr-o1')).toBe(true);
  });

  it.each([
    ['a 404', () => res('missing', { status: 404 })],
    ['a 500', () => res('boom', { status: 500 })],
    ['a partial 206', () => res('part', { status: 206 })],
    [
      'a response with a Content-Range',
      () => res('part', { headers: { 'content-range': 'bytes 0-3/9' } }),
    ],
    ['an opaque response', () => res(null, { type: 'opaque' })],
    ['a cross-origin (cors) response', () => res('x', { type: 'cors' })],
    ['a redirect', () => res(null, { status: 302 })],
  ])('are never cached when the server returns %s', async (_name, make) => {
    const sw = await installed({ network: (u) => (u.includes('/ocr/') ? make() : res('ok')) });
    const r = await sw.get(WORKER);
    expect(r.handled).toBe(true);
    // The page still gets whatever the server said...
    expect(r.response?.status).toBe(make().status);
    // ...but nothing is stored, so the next scan asks again.
    expect(sw.store.get('mealsplit-ocr-o1')?.has(SCOPE + WORKER) ?? false).toBe(false);
  });

  it('pass a network failure straight through (offline before the first scan)', async () => {
    const sw = await installed({
      network: (u) => {
        if (u.includes('/ocr/')) throw new TypeError('Failed to fetch');
        return res('ok');
      },
    });
    await expect(sw.get(WORKER)).rejects.toThrow('Failed to fetch');
  });
});
