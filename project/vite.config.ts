import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: [
        '**/release/**',
        '**/runtime/**',
        '**/resources/**',
        '**/docs/screenshots/**',
        '**/docs/scene-review/**',
        '**/test-results/**',
      ],
    },
  },
});
