import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.js",
    css: true,
  },
  server: {
    proxy: Object.fromEntries(["/api", "/media", "/sync", "/docs", "/openapi.json"].map((path) => [path, process.env.VITE_API_TARGET || "http://127.0.0.1:8080"])),
  },
});
