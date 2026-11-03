import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts', 'tests/db/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // DB tests share one local database; run files one after another.
    fileParallelism: false,
    // One worker for all files: starting a worker per file crashed now and then on Windows (exit code 3221226505).
    // Tests must not rely on module state, which is shared between files now.
    isolate: false,
  },
});
