import { supabase } from "./supabase";
import { getCached, setCached, clearCached } from "./cache";
import { clearStatsCache } from "./results";

export interface Profile {
  id: string;
  name: string;
  speedGoal: number | null;
  dailyMinutes: number | null;
}

export interface AuthResult {
  error: string | null;
  /** True when signup succeeded but there's no session yet — most Supabase
   * projects require email confirmation before the account can sign in. */
  needsConfirmation?: boolean;
}

const PROFILE_CACHE_KEY = "typing:cache:profile";
// Name and goals rarely change, so this can be long-lived. Writes
// (saveGoals) patch the cache directly instead of waiting for it to
// expire, so this TTL is really just an upper bound on staleness.
const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedProfile extends Profile {
  userId: string;
}

/** Clears every cache that's scoped to "the current user" — anything that must never leak from one signed-in user to the next on the same browser. */
function clearAppCaches(): void {
  clearCached(PROFILE_CACHE_KEY);
  clearStatsCache();
}

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  clearAppCaches();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) return { error: error.message };
  if (!data.session) return { error: null, needsConfirmation: true };
  return { error: null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  clearAppCaches();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  clearAppCaches();
  await supabase.auth.signOut();
}

export async function isSignedIn(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session !== null;
}

export async function getProfile(): Promise<Profile | null> {
  // getSession() reads the local session with no network round-trip in the
  // common case — unlike getUser(), which always calls out to the Auth
  // server to re-verify. We only need the id here (for the cache check and
  // to scope the query), and the REST call itself is still authorized by
  // the real JWT and enforced server-side by RLS either way, so this loses
  // no security — it just stops paying for a network call on every cache hit.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const cached = getCached<CachedProfile>(PROFILE_CACHE_KEY, PROFILE_CACHE_TTL_MS);
  if (cached && cached.userId === user.id) {
    return cached;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, speed_goal, daily_minutes")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;

  const profile: Profile = {
    id: data.id,
    name: data.name ?? "",
    speedGoal: data.speed_goal,
    dailyMinutes: data.daily_minutes,
  };
  setCached<CachedProfile>(PROFILE_CACHE_KEY, { ...profile, userId: user.id });
  return profile;
}

export async function saveGoals(speedGoal: number, dailyMinutes: number): Promise<AuthResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return { error: "You need to be signed in to save goals." };

  const { error } = await supabase
    .from("profiles")
    .update({ speed_goal: speedGoal, daily_minutes: dailyMinutes })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // We know exactly what changed, so patch the cache in place rather than
  // invalidating it — no need to force a re-fetch for a write we made ourselves.
  const cached = getCached<CachedProfile>(PROFILE_CACHE_KEY, PROFILE_CACHE_TTL_MS);
  if (cached && cached.userId === user.id) {
    setCached<CachedProfile>(PROFILE_CACHE_KEY, { ...cached, speedGoal, dailyMinutes });
  }

  return { error: null };
}

/** Requires the current password (re-verified via sign-in) before changing it — a session alone isn't proof you still have the password. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email) return { error: "You need to be signed in to change your password." };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "Current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
}

/**
 * Deletes the signed-in user's account. This calls a Supabase Edge Function
 * because deleting an auth user requires the service role key, which must
 * never be shipped to the browser — the anon key this client uses can't do
 * it. See supabase/functions/delete-account.
 */
export async function deleteAccount(): Promise<AuthResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "You need to be signed in to delete your account." };

  const { error } = await supabase.functions.invoke("delete-account");
  if (error) return { error: error.message };

  await signOut();
  return { error: null };
}
