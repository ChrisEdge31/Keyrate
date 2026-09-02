const STORAGE_KEY = "typing:disabled-letters";
const ALL_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

function readDisabled(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeDisabled(disabled: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
  window.dispatchEvent(new CustomEvent("keystate:change"));
}

export function getDisabledLetters(): Set<string> {
  return readDisabled();
}

export function getEnabledLetters(): string[] {
  const disabled = readDisabled();
  return ALL_LETTERS.filter((letter) => !disabled.has(letter));
}

export function isLetterEnabled(letter: string): boolean {
  return !readDisabled().has(letter.toLowerCase());
}

/** Toggles a letter on/off. Refuses to disable the last remaining enabled letter. */
export function toggleLetter(letter: string): boolean {
  letter = letter.toLowerCase();
  const disabled = readDisabled();
  if (disabled.has(letter)) {
    disabled.delete(letter);
    writeDisabled(disabled);
    return true;
  }
  if (ALL_LETTERS.length - disabled.size <= 1) {
    return false;
  }
  disabled.add(letter);
  writeDisabled(disabled);
  return false;
}

export function enableAllLetters(): void {
  writeDisabled(new Set());
}

export function onKeyStateChange(callback: () => void): () => void {
  window.addEventListener("keystate:change", callback);
  return () => window.removeEventListener("keystate:change", callback);
}
