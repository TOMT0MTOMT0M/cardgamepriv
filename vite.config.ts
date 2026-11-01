import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:mobile` → HTTPS + LAN : WebGPU et le gyroscope exigent un contexte sécurisé sur téléphone.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: { host: mode === 'https' ? true : undefined },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
  },
}));
