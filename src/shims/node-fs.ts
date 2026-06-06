// Browser shim for `node:fs` and `node:fs/promises`. The Anthropic SDK's unused
// file tools import these; they are never invoked in this browser dashboard.
function unavailable(): never {
  throw new Error("node:fs is not available in the browser build.");
}

export const readFile = unavailable;
export const writeFile = unavailable;
export const mkdir = unavailable;
export const stat = unavailable;
export const lstat = unavailable;
export const readdir = unavailable;
export const rm = unavailable;
export const access = unavailable;
export const realpath = unavailable;
export const readlink = unavailable;
export const rename = unavailable;
export const copyFile = unavailable;
export const open = unavailable;
export const glob = unavailable;
export const unlink = unavailable;
export const rmdir = unavailable;
export const appendFile = unavailable;
export const chmod = unavailable;
export const chown = unavailable;
export const utimes = unavailable;
export const symlink = unavailable;
export const link = unavailable;
export const truncate = unavailable;
export const opendir = unavailable;
export const cp = unavailable;
export const watch = unavailable;
export const createReadStream = unavailable;
export const createWriteStream = unavailable;
export const existsSync = () => false;
export const readFileSync = unavailable;
export const writeFileSync = unavailable;
export const mkdirSync = unavailable;
export const constants = {};

export default {
  readFile,
  writeFile,
  mkdir,
  stat,
  lstat,
  readdir,
  rm,
  access,
  realpath,
  readlink,
  rename,
  copyFile,
  open,
  glob,
  unlink,
  rmdir,
  appendFile,
  chmod,
  chown,
  utimes,
  symlink,
  link,
  truncate,
  opendir,
  cp,
  watch,
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  constants,
};
