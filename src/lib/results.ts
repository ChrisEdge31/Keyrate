import { supabase } from "./supabase";
import { getCached, setCached, clearCached } from "./cache";

export interface SessionResult {
  mode: "learn" | "practice";
  wpm: number;
  accuracy: number;
}

export interface ProfileStats {
  averageWpm: number;
  accuracy: number;
  bestWpm: number;
  testsCompleted: number;
}

export interface ResultRow {
  date: string;
  wpm: number;
  accuracy: number;
}

const STATS_CACHE_KEY = "typing:cache:stats";
// Stats only ever change at one moment — a completed session — and that
// path explicitly clears this cache. The TTL below is just a safety net in
// case a caller ever records a result some other way.
const STATS_CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedStats {
  userId: string;
  stats: ProfileStats;
  recent: ResultRow[];
}

export function clearStatsCache(): void {
  clearCached(STATS_CACHE_KEY);
}

/** Records a completed passage. Silently no-ops for guests — there's nowhere durable to attach it. */
export async function recordResult(result: SessionResult): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  const { error } = await supabase.from("results").insert({
    user_id: user.id,
    mode: result.mode,
    wpm: result.wpm,
    accuracy: result.accuracy,
  });

  // This is exactly the moment cached stats go stale — invalidate so the
  // next profile view re-fetches instead of showing a pre-session number.
  if (!error) clearStatsCache();
}

export async function getStats(): Promise<{ stats: ProfileStats; recent: ResultRow[] } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const cached = getCached<CachedStats>(STATS_CACHE_KEY, STATS_CACHE_TTL_MS);
  if (cached && cached.userId === user.id) {
    return { stats: cached.stats, recent: cached.recent };
  }

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("results")
      .select("wpm, accuracy, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("results").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  if (error || !data) return null;

  const payload =
    data.length === 0
      ? { stats: { averageWpm: 0, accuracy: 0, bestWpm: 0, testsCompleted: count ?? 0 }, recent: [] }
      : {
          stats: {
            averageWpm: Math.round(data.reduce((sum, r) => sum + r.wpm, 0) / data.length),
            accuracy: data.reduce((sum, r) => sum + r.accuracy, 0) / data.length,
            bestWpm: Math.max(...data.map((r) => r.wpm)),
            testsCompleted: count ?? data.length,
          },
          recent: data.slice(0, 10).map((r) => ({
            date: new Date(r.created_at).toISOString().slice(0, 10),
            wpm: r.wpm,
            accuracy: r.accuracy,
          })),
        };

  setCached<CachedStats>(STATS_CACHE_KEY, { userId: user.id, ...payload });
  return payload;
}
