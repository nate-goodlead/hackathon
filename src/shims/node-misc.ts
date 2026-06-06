// Browser shim for `node:child_process` and `node:readline`. The Anthropic SDK's
// unused agent tooling imports these; they are never invoked in this dashboard.
function unavailable(): never {
  throw new Error("This node built-in is not available in the browser build.");
}

export const exec = unavailable;
export const execSync = unavailable;
export const spawn = unavailable;
export const spawnSync = unavailable;
export const execFile = unavailable;
export const fork = unavailable;

export function createInterface(): never {
  return unavailable();
}

export default { exec, execSync, spawn, spawnSync, execFile, fork, createInterface };
