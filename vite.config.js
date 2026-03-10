import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    // Asegurar que .js se trate como JavaScript, no como JSX
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'js',
      },
    },
  },
});
