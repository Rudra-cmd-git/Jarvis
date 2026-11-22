import path from 'node:path';
import { defineConfig } from 'vite';

// Sandboxed preloads cannot require arbitrary relative modules, so the
// preload and its shared IPC constants are bundled into one CommonJS file.
export default defineConfig({
  configFile: false,
  build: {
    outDir: 'dist-main/preload',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    lib: {
      entry: path.resolve('src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
});
