import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// Il motore di conversione e' puro e indipendente dal DOM: gira in ambiente node.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    coverage: {
      include: ['src/converters/**/*.ts'],
      exclude: ['src/converters/**/*.test.ts'],
    },
  },
})
