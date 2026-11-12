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
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts'],
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
      },
    },
  },
});
