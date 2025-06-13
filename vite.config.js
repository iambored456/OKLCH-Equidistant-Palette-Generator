import { defineConfig } from 'vite';

export default defineConfig({
  base: '/OKLCH-Visualizer-Attempt-Lets-Rock/',
  build: {
    outDir: 'docs',          // Vite now writes straight to /docs
    emptyOutDir: true        // wipe old build each time
  }
});
