import { expect, test } from 'vitest';

// Vite inlines every source file as text, so we can check the rule without touching the disk.
const sources = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

test('only src/storage touches localStorage', () => {
  const offenders = Object.entries(sources)
    .filter(([path]) => !path.startsWith('./') && !path.startsWith('../storage/'))
    .filter(([, text]) => /\b(localStorage|sessionStorage)\b/.test(text as string))
    .map(([path]) => path);
  expect(offenders).toEqual([]);
  expect(Object.keys(sources).length).toBeGreaterThan(10); // the glob really found the sources
});
