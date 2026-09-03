import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // '.claude/**' incluye los worktrees que abre Claude Code: son otra copia
    // del repo, y sin excluirlos cada test corre dos veces --el duplicado contra
    // la MISMA base de Supabase, agotando su rate limit-- y ademas revive tests
    // de codigo ya borrado.
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
    // Los tests de integracion comparten la Management API de Supabase, que
    // tiene rate limit: correrlos en paralelo dispara 429 (Too Many Requests).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
