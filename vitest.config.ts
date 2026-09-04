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
    // Por el mismo rate limit, `scripts/api-supabase.ts` espacia las consultas
    // (~1,1 s cada una). El montaje de un test de integracion son diez o quince
    // consultas seguidas, asi que los diez segundos de `hookTimeout` por
    // defecto no alcanzan: el beforeAll moria a mitad de crear sus datos y
    // dejaba el archivo entero en rojo por un motivo que no era el codigo.
    hookTimeout: 180_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
