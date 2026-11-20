/** ID を作る。crypto.randomUUID は https / localhost でしか使えないので代替を用意する。 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // 安全でない接続などでは使えない
    }
  }
  const rand = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rand()}-${rand()}`;
}
