// A tiny localStorage-backed cache with a max-age check. Deliberately dumb:
// callers decide what's worth caching, how long it stays fresh, and when to
// invalidate it explicitly — this just stores a value with a timestamp.
interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

function read<T>(key: string): CacheEntry<T> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

export function getCached<T>(key: string, maxAgeMs: number): T | null {
  const entry = read<T>(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > maxAgeMs) return null;
  return entry.value;
}

export function setCached<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(entry));
}

export function clearCached(key: string): void {
  localStorage.removeItem(key);
}
