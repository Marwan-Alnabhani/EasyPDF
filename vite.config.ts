import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Strict Content-Security-Policy for production builds: the page may only load
// its own files, and cannot send data anywhere (connect-src is limited to
// self/blob/data, used for loading the bundled pdf.js assets, plus the desktop
// app's local IPC channel).
// It is skipped in dev because Vite's hot-reload needs inline scripts/websockets.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "connect-src 'self' blob: data: ipc: http://ipc.localhost",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const cspPlugin = (): Plugin => ({
  name: "easypdf-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    ),
});

export default defineConfig({
  base: "./",
  clearScreen: false,
  plugins: [react(), cspPlugin()],
  build: { chunkSizeWarningLimit: 1500 },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
