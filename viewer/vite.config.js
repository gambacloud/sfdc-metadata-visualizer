import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      // Lets the viewer load index.json from ../data/ during dev
      '@data': path.resolve(__dirname, '../data'),
    },
  },
});
