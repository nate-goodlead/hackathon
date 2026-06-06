// Browser shim for `node:util`. Only the SDK's unused tooling imports this.
export function promisify<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export default { promisify };
