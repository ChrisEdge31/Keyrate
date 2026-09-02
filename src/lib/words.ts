import { COMMON_WORDS } from "./dictionary";

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

// Below this many real-word matches, repeating the same handful gets monotonous — top up with pseudo-words instead.
const MIN_REAL_WORD_POOL = 8;

// Like keybr: a focus letter must appear in every candidate word, not merely be allowed to, or it can end up rare in the generated text.
function wordsMatchingLetters(enabled: string[], focusLetter?: string): string[] {
  const allowed = new Set(enabled);
  return COMMON_WORDS.filter(
    (word) =>
      [...word].every((ch) => allowed.has(ch)) && (focusLetter === undefined || word.includes(focusLetter)),
  );
}

// Approximate relative English letter frequencies, so pseudo-words favor common letters like real words do.
const LETTER_WEIGHT: Record<string, number> = {
  a: 8.2, b: 1.5, c: 2.8, d: 4.3, e: 12.7, f: 2.2, g: 2.0, h: 6.1, i: 7.0,
  j: 0.15, k: 0.77, l: 4.0, m: 2.4, n: 6.7, o: 7.5, p: 1.9, q: 0.1,
  r: 6.0, s: 6.3, t: 9.1, u: 2.8, v: 0.98, w: 2.4, x: 0.15, y: 2.0, z: 0.074,
};

// Weighted word-length distribution, favoring 3-6 letters like real English.
const LENGTH_WEIGHTS: Array<[number, number]> = [
  [2, 4], [3, 14], [4, 20], [5, 19], [6, 15], [7, 11], [8, 7], [9, 4],
];

// Frequency shapes the pick but never dominates it — pure frequency weighting would bury a rare letter under a common one in a small enabled set (e.g. "f" + "j").
function effectiveWeight(letter: string): number {
  return 1 + (LETTER_WEIGHT[letter] ?? 1) * 0.3;
}

function weightedPick(letters: string[]): string {
  const total = letters.reduce((sum, l) => sum + effectiveWeight(l), 0);
  let r = Math.random() * total;
  for (const letter of letters) {
    r -= effectiveWeight(letter);
    if (r <= 0) return letter;
  }
  return letters[letters.length - 1];
}

function pickWordLength(): number {
  const total = LENGTH_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [length, weight] of LENGTH_WEIGHTS) {
    r -= weight;
    if (r <= 0) return length;
  }
  return 5;
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Hands out every word once, shuffled, before reshuffling — plain random sampling visibly repeats when a restrictive lesson's real-word pool is only 20-30 words.
function createBagSampler<T>(items: readonly T[]): () => T {
  let bag: T[] = [];
  let last: T | undefined;
  return () => {
    if (bag.length === 0) {
      bag = shuffle(items);
      // Avoid an immediate repeat right at the reshuffle boundary.
      if (bag.length > 1 && bag[bag.length - 1] === last) {
        const swapIndex = Math.floor(Math.random() * (bag.length - 1));
        [bag[bag.length - 1], bag[swapIndex]] = [bag[swapIndex], bag[bag.length - 1]];
      }
    }
    last = bag.pop();
    return last as T;
  };
}

function generatePseudoWord(enabled: string[], focusLetter?: string): string {
  const vowels = enabled.filter((l) => VOWELS.has(l));
  const consonants = enabled.filter((l) => !VOWELS.has(l));
  const length = pickWordLength();

  let word = "";
  let lastWasVowel: boolean | null = null;
  for (let i = 0; i < length; i++) {
    const preferVowel = lastWasVowel === null ? Math.random() < 0.4 : !lastWasVowel;
    const wantVowel = Math.random() < 0.75 ? preferVowel : !preferVowel;

    let pool: string[];
    if (wantVowel && vowels.length > 0) pool = vowels;
    else if (!wantVowel && consonants.length > 0) pool = consonants;
    else pool = enabled;

    const letter = weightedPick(pool);
    word += letter;
    lastWasVowel = VOWELS.has(letter);
  }

  if (focusLetter !== undefined && !word.includes(focusLetter)) {
    const index = Math.floor(Math.random() * word.length);
    word = word.slice(0, index) + focusLetter + word.slice(index + 1);
  }

  return word;
}

export interface GeneratePassageOptions {
  wordCount?: number;
  /** When given, every word in the passage is guaranteed to contain this letter. */
  focusLetter?: string;
}

export function generatePassage(enabledLetters: string[], options: GeneratePassageOptions = {}): string {
  const { wordCount = 30, focusLetter } = options;
  const letters = enabledLetters.length > 0 ? enabledLetters : "abcdefghijklmnopqrstuvwxyz".split("");
  const realWords = wordsMatchingLetters(letters, focusLetter);
  const useRealWords = realWords.length >= MIN_REAL_WORD_POOL;

  const words: string[] = [];
  if (useRealWords) {
    const nextWord = createBagSampler(realWords);
    for (let i = 0; i < wordCount; i++) words.push(nextWord());
  } else {
    for (let i = 0; i < wordCount; i++) words.push(generatePseudoWord(letters, focusLetter));
  }
  return words.join(" ");
}
