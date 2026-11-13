import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "public"),
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.EASYSCENE_API ?? "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
