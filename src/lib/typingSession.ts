export interface TypingSessionElements {
  passageEl: HTMLElement;
  input: HTMLInputElement;
  wpmEl: HTMLElement;
  accuracyEl: HTMLElement;
  timeEl: HTMLElement;
}

export interface TypingResult {
  correct: number;
  total: number;
  accuracy: number;
  wpm: number;
}

export interface KeystrokeSample {
  /** The character that was just correctly typed. */
  char: string;
  /** Milliseconds since the previous correct keystroke. */
  elapsedMs: number;
}

export interface TypingSessionCallbacks {
  /** Fired at the start of every passage — the initial one and every one after, however it was reached (advance, restart, retry). */
  onStart?: () => void;
  onComplete?: (result: TypingResult) => void;
  /** Called when the user presses Enter after finishing a passage, to fetch the next one. */
  onAdvance?: () => string;
  /** Fired on a correct keystroke that took only one try — a position ever mistyped never produces a sample, even once fixed. */
  onKeystroke?: (sample: KeystrokeSample) => void;
}

export interface TypingSession {
  start(text: string): void;
}

export function createTypingSession(
  el: TypingSessionElements,
  callbacks: TypingSessionCallbacks = {},
): TypingSession {
  let passage = "";
  // Only advances on a correct keystroke, so it's both "typed" and "typed correctly" — a wrong key never moves it.
  let position = 0;
  let startTime: number | null = null;
  let timerId: number | null = null;
  let awaitingAdvance = false;
  const missedPositions = new Set<number>();
  // Anchored to the previous *correct* keystroke, not the previous attempt, so a fumbled key shows up as a slow sample on the eventual correct press.
  let lastCorrectTime: number | null = null;

  function renderPassage() {
    el.passageEl.innerHTML = "";
    for (let i = 0; i < passage.length; i++) {
      const span = document.createElement("span");
      span.textContent = passage[i];
      if (i < position) {
        span.className = missedPositions.has(i) ? "incorrect" : "correct";
      } else if (i === position) {
        span.className = missedPositions.has(i) ? "current incorrect" : "current";
      }
      el.passageEl.appendChild(span);
    }
  }

  function computeResult(): TypingResult {
    let scored = 0;
    let scoredCorrect = 0;
    for (let i = 0; i < position; i++) {
      if (passage[i] === " ") continue;
      scored++;
      if (!missedPositions.has(i)) scoredCorrect++;
    }
    const accuracy = scored === 0 ? 1 : scoredCorrect / scored;

    const elapsedMs = startTime ? performance.now() - startTime : 0;
    const minutes = elapsedMs / 60000;
    const wpm = minutes > 0 ? Math.round(position / 5 / minutes) : 0;
    return { correct: position, total: position, accuracy, wpm };
  }

  function updateStatsDisplay() {
    const result = computeResult();
    el.accuracyEl.textContent = `${Math.round(result.accuracy * 100)}%`;
    el.wpmEl.textContent = String(result.wpm);
    const elapsedMs = startTime ? performance.now() - startTime : 0;
    el.timeEl.textContent = `${Math.floor(elapsedMs / 1000)}s`;
  }

  function finish() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    el.input.disabled = true;
    awaitingAdvance = true;
    callbacks.onComplete?.(computeResult());
  }

  function start(text: string) {
    callbacks.onStart?.();
    passage = text;
    position = 0;
    missedPositions.clear();
    startTime = null;
    lastCorrectTime = null;
    awaitingAdvance = false;
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    el.input.disabled = false;
    el.input.value = "";
    el.wpmEl.textContent = "0";
    el.accuracyEl.textContent = "100%";
    el.timeEl.textContent = "0s";
    renderPassage();
    el.input.focus();
  }

  el.input.addEventListener("keydown", (event) => {
    if (el.input.disabled) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Only a single printable character can move the cursor — Backspace, Tab, arrows, etc. are ignored.
    if (event.key.length !== 1) return;
    event.preventDefault();

    if (startTime === null) {
      startTime = performance.now();
      timerId = window.setInterval(updateStatsDisplay, 250);
    }

    if (event.key === passage[position]) {
      const now = performance.now();
      if (lastCorrectTime !== null && !missedPositions.has(position)) {
        callbacks.onKeystroke?.({ char: passage[position], elapsedMs: now - lastCorrectTime });
      }
      lastCorrectTime = now;
      position++;
    } else {
      missedPositions.add(position);
    }
    renderPassage();
    updateStatsDisplay();

    if (position === passage.length) {
      finish();
    }
  });

  el.input.addEventListener("paste", (event) => event.preventDefault());

  document.addEventListener("keydown", (event) => {
    if (!awaitingAdvance || event.key !== "Enter") return;
    const next = callbacks.onAdvance?.();
    if (next) {
      awaitingAdvance = false;
      start(next);
    }
  });

  return { start };
}
