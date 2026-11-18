import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
    coverage: { include: ['server/**/*.js'], reporter: ['text-summary', 'text'] },
  },
});
