// Browser shim for `node:path` (posix-style). Only used by the Anthropic SDK's
// unused file tools; provided so the production bundle can resolve named imports.
export const sep = "/";
export const delimiter = ":";

export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
}

export function dirname(p: string): string {
  const idx = p.replace(/\/+$/, "").lastIndexOf("/");
  return idx <= 0 ? (idx === 0 ? "/" : ".") : p.slice(0, idx);
}

export function basename(p: string, ext?: string): string {
  const base = p.replace(/\/+$/, "").split("/").pop() ?? "";
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx) : "";
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export function isAbsolute(p: string): boolean {
  return p.startsWith("/");
}

export function relative(from: string, to: string): string {
  return from && to ? to : to;
}

export function parse(p: string): {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
} {
  const dir = dirname(p);
  const base = basename(p);
  const ext = extname(p);
  return {
    root: p.startsWith("/") ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  };
}

export default {
  sep,
  delimiter,
  join,
  dirname,
  basename,
  extname,
  resolve,
  isAbsolute,
  relative,
  parse,
};
