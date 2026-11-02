import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:mobile` → HTTPS + LAN : WebGPU et le gyroscope exigent un contexte sécurisé sur téléphone.
// Deux pages : le labo (/) et le jeu (/jeu/).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: { host: mode === 'https' ? true : undefined },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        lab: 'index.html',
        jeu: 'jeu/index.html',
      },
    },
  },
}));
