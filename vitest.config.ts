import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**'
      ]
    },
    typecheck: {
      checker: 'tsc',
      include: ['**/*.{test,spec}-d.ts']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'extension'),
      '@tests': resolve(__dirname, 'tests')
    }
  }
})