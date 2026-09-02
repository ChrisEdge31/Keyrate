// keybr's own key order — the order keys are introduced in.
export const LETTER_ORDER = "eniarltosudycghpmkbwfzvxqj".split("");

const UNLOCKED_KEY = "typing:lesson-unlocked-count";
const EMA_KEY = "typing:lesson-ema";

// keybr starts learners on E N I A R L — enough letters to form real pseudo-words
// from the start, rather than the near-unusable output of just one or two keys.
export const START_UNLOCKED = 6;

// Used when a profile has no speedGoal set — callers should otherwise pass
// their own per-user target into recordKeySample.
export const DEFAULT_TARGET_SPEED_WPM = 35;

// keybr smooths each key's pace with an exponential moving average (its own
// constant, α=0.1: 90% weight on history, 10% on the newest sample) rather
// than a flat rolling average, and gates unlocking on the *best* EMA a key
// has ever reached, not its current one — a single strong stretch stays
// "good enough" even if a later attempt is slower. A key with zero samples
// is simply "not calibrated"; there's no separate minimum sample count.
const EMA_ALPHA = 0.1;

function readUnlockedCount(): number {
  if (typeof localStorage === "undefined") return START_UNLOCKED;
  const raw = localStorage.getItem(UNLOCKED_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(parsed)) return START_UNLOCKED;
  return Math.min(Math.max(parsed, START_UNLOCKED), LETTER_ORDER.length);
}

interface EmaRecord {
  /** EMA-smoothed milliseconds per keystroke, most recent pace. */
  current: number;
  /** The lowest (fastest) EMA ever reached for this key. */
  best: number;
  /** Samples folded in so far — informational only, not a gate. */
  count: number;
}

function readEma(): EmaRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(EMA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEma(ema: EmaRecord | null): void {
  if (ema === null) {
    localStorage.removeItem(EMA_KEY);
  } else {
    localStorage.setItem(EMA_KEY, JSON.stringify(ema));
  }
}

function msToWpm(ms: number): number {
  return Math.round(12000 / ms);
}

function targetMs(targetWpm: number): number {
  return 12000 / targetWpm;
}

export function getUnlockedLetters(): string[] {
  return LETTER_ORDER.slice(0, readUnlockedCount());
}

export function getCurrentLetter(): string {
  const count = readUnlockedCount();
  return LETTER_ORDER[count - 1];
}

export function isComplete(): boolean {
  return readUnlockedCount() >= LETTER_ORDER.length;
}

export interface KeyConfidence {
  currentWpm: number | null;
  bestWpm: number | null;
  count: number;
}

export function getKeyConfidence(): KeyConfidence {
  const ema = readEma();
  if (ema === null) return { currentWpm: null, bestWpm: null, count: 0 };
  return { currentWpm: msToWpm(ema.current), bestWpm: msToWpm(ema.best), count: ema.count };
}

export interface LessonResult {
  unlocked: boolean;
  nextLetter: string | null;
  confidence: KeyConfidence;
}

/** Records one measured keystroke time (ms) for the key currently being learned, unlocking the next key once its best-ever smoothed pace reaches targetWpm. */
export function recordKeySample(elapsedMs: number, targetWpm: number): LessonResult {
  const count = readUnlockedCount();
  if (count >= LETTER_ORDER.length) {
    return { unlocked: false, nextLetter: null, confidence: { currentWpm: null, bestWpm: null, count: 0 } };
  }

  const prev = readEma();
  const current = prev ? EMA_ALPHA * elapsedMs + (1 - EMA_ALPHA) * prev.current : elapsedMs;
  const best = prev ? Math.min(prev.best, current) : current;
  const ema: EmaRecord = { current, best, count: (prev?.count ?? 0) + 1 };
  writeEma(ema);

  const confidence: KeyConfidence = { currentWpm: msToWpm(current), bestWpm: msToWpm(best), count: ema.count };
  if (best <= targetMs(targetWpm)) {
    const nextCount = count + 1;
    localStorage.setItem(UNLOCKED_KEY, String(nextCount));
    writeEma(null);
    return { unlocked: true, nextLetter: LETTER_ORDER[nextCount - 1] ?? null, confidence };
  }

  return { unlocked: false, nextLetter: null, confidence };
}

export function resetLessonProgress(): void {
  localStorage.setItem(UNLOCKED_KEY, String(START_UNLOCKED));
  writeEma(null);
}
