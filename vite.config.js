import { defineConfig } from 'vite';

export default defineConfig({
  base: '/OKLCH-Equidistant-Palette-Generator/',
  build: {
    outDir: 'docs',          // Vite now writes straight to /docs
    emptyOutDir: true        // wipe old build each time
  }
});
