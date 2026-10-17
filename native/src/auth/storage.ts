export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
/** 400 Unicode codepoints <= 1600 UTF-8 bytes. No half-surrogate chunks. */
export function chunkedStorage(storage: SecureStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation).catch(() => { throw new Error('Session storage unavailable.'); });
    queue = result.catch(() => {}); return result;
  }
  async function count(key: string) {
    const raw = await storage.getItemAsync(`${key}.count`);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 512) throw new Error('Session storage unavailable.');
    return n;
  }
  return {
    getItem: (key: string) => serial(async () => {
      const ready = await storage.getItemAsync(`${key}.ready`);
      if (ready !== '1') return null;
      const parts = await Promise.all(Array.from({ length: await count(key) }, (_, i) => storage.getItemAsync(`${key}.part.${i}`)));
      return parts.some(p => p === null) ? null : parts.join('');
    }),
    setItem: (key: string, value: string) => serial(async () => {
      const chars = Array.from(value), parts: string[] = [];
      for (let i = 0; i < chars.length; i += 400) parts.push(chars.slice(i, i + 400).join(''));
      if (parts.length > 512) throw new Error('Session storage unavailable.');
      const old = await count(key);
      // Invalidate before touching chunks: interrupted writes can never restore a partial session.
      await storage.deleteItemAsync(`${key}.ready`);
      await storage.setItemAsync(`${key}.count`, String(Math.max(old, parts.length)));
      for (let i = 0; i < parts.length; i++) await storage.setItemAsync(`${key}.part.${i}`, parts[i]);
      for (let i = parts.length; i < old; i++) await storage.deleteItemAsync(`${key}.part.${i}`);
      await storage.setItemAsync(`${key}.count`, String(parts.length));
      await storage.setItemAsync(`${key}.ready`, '1');
    }),
    removeItem: (key: string) => serial(async () => {
      await storage.deleteItemAsync(`${key}.ready`);
      for (let i = 0, n = await count(key); i < n; i++) await storage.deleteItemAsync(`${key}.part.${i}`);
      await storage.deleteItemAsync(`${key}.count`);
    }),
  };
}
