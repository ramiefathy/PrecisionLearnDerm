import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    globals: true,
    env: { NODE_ENV: 'test' },
    coverage: {
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage'
    },
  },
});
