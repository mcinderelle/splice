import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  esbuild: {
    supported: {
      "top-level-await": true
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // Proxy GraphQL requests to bypass CORS in browser mode
      '/graphql': {
        target: 'https://surfaces-graphql.splice.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path
      },
      // Proxy audio samples from S3 to bypass CORS
      '/audio_samples': {
        target: 'https://spliceproduction.s3.us-west-1.amazonaws.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path
      }
    }
  },
}));
