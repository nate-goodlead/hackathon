// Browser shim for `node:crypto`. The Anthropic SDK's agent/session tooling
// imports `randomUUID` at module load; those tools are never used in this
// browser dashboard (only messages.create), so a minimal shim is sufficient.
export function randomUUID(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return "00000000-0000-4000-8000-000000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (Math.floor(Math.random() * 16) >> (n / 4))).toString(16);
  });
}

export default { randomUUID };
