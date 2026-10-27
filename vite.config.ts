import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tauriConf from "./src-tauri/tauri.conf.json" with { type: "json" };

// Strict Content-Security-Policy for production builds: the page may only load
// its own files, and cannot send data anywhere (connect-src is limited to
// self/blob/data, used for loading the bundled pdf.js assets, plus the desktop
// app's local IPC channel).
// The policy is defined once, in src-tauri/tauri.conf.json, and shared by the
// web build and the desktop app.
// It is skipped in dev because Vite's hot-reload needs inline scripts/websockets.
const csp = Object.entries(tauriConf.app.security.csp)
  .map(([directive, sources]) => `${directive} ${sources}`)
  .join("; ");

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
