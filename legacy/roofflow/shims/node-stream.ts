// Browser shim for `node:stream` and `node:stream/promises`. Only the SDK's
// unused tooling imports these.
export class Readable {
  static from(value: unknown): Readable {
    return value as Readable;
  }
}

export async function pipeline(): Promise<void> {
  throw new Error("node:stream/promises pipeline is not available in the browser build.");
}

export default { Readable, pipeline };
