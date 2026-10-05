import { defineConfig } from 'vitest/config'

// Il motore di conversione e' puro e indipendente dal DOM: gira in ambiente node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
