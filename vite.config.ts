import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const NODE_SHIMS: Record<string, string> = {
  "node:crypto": path.resolve(__dirname, "./src/shims/node-crypto.ts"),
  "node:fs": path.resolve(__dirname, "./src/shims/node-fs.ts"),
  "node:fs/promises": path.resolve(__dirname, "./src/shims/node-fs.ts"),
  "node:path": path.resolve(__dirname, "./src/shims/node-path.ts"),
  "node:stream": path.resolve(__dirname, "./src/shims/node-stream.ts"),
  "node:util": path.resolve(__dirname, "./src/shims/node-util.ts"),
  "node:os": path.resolve(__dirname, "./src/shims/node-misc.ts"),
  "node:url": path.resolve(__dirname, "./src/shims/node-misc.ts"),
  "node:child_process": path.resolve(__dirname, "./src/shims/node-misc.ts"),
  "node:readline": path.resolve(__dirname, "./src/shims/node-misc.ts"),
  "node:stream/promises": path.resolve(__dirname, "./src/shims/node-stream.ts"),
};

function nodeBuiltinShims(): Plugin {
  return {
    name: "node-builtin-shims",
    enforce: "pre",
    resolveId(source) {
      if (source in NODE_SHIMS) return NODE_SHIMS[source];
      return null;
    },
  };
}

export default defineConfig({
  plugins: [nodeBuiltinShims(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
