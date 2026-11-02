import { defineConfig } from 'vitest/config';

// Tests du serveur Convex (convex-test : base simulée en mémoire, rien n'est envoyé à la vraie base).
export default defineConfig({
  test: {
    include: ['convex/**/*.test.ts'],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
});
