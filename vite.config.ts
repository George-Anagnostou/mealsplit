import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works from any subdomain or sub-path.
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The pure logic: core, reducer/selectors, and the storage layer (React and DOM code is covered by e2e).
      include: ['src/core/**/*.ts', 'src/state/**/*.ts', 'src/storage/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/state/testing.ts', 'src/storage/index.ts'],
      reporter: ['text', 'json-summary'],
      // A floor, set just under today's numbers so coverage can only go up.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
        'src/core/parser.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/core/links.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/core/split.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/state/reducer.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/state/flow.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/state/history.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/storage/migrate.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
        'src/storage/storage.ts': { branches: 85, statements: 95, functions: 95, lines: 95 },
        'src/storage/transfer.ts': { branches: 90, statements: 95, functions: 95, lines: 95 },
      },
    },
  },
});
