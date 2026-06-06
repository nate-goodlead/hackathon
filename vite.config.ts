import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const shim = (file: string) => fileURLToPath(new URL(`./src/shims/${file}`, import.meta.url));

// The Anthropic SDK's agent/session tooling statically imports Node built-ins
// (fs, path, crypto, stream, util, child_process, readline) that cannot be
// bundled for the browser. Those tools are never invoked in this dashboard
// (only messages.create), so redirect the built-ins to lightweight browser
// shims. A `pre` plugin runs before Vite's internal handling that would
// otherwise map `node:*` imports to an empty `__vite-browser-external` module.
const NODE_SHIMS: Record<string, string> = {
  "node:crypto": shim("node-crypto.ts"),
  "node:path": shim("node-path.ts"),
  "node:fs": shim("node-fs.ts"),
  "node:fs/promises": shim("node-fs.ts"),
  "node:util": shim("node-util.ts"),
  "node:stream": shim("node-stream.ts"),
  "node:stream/promises": shim("node-stream.ts"),
  "node:child_process": shim("node-misc.ts"),
  "node:readline": shim("node-misc.ts"),
};

function nodeShimPlugin(): Plugin {
  return {
    name: "node-builtin-browser-shims",
    enforce: "pre",
    resolveId(id) {
      return NODE_SHIMS[id] ?? null;
    },
  };
}

export default defineConfig({
  plugins: [nodeShimPlugin(), react()],
});
