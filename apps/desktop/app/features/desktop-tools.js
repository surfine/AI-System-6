// Feature module: desktop-tools.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function renderCalculator() {
  calculatorDisplay.value = calculatorExpression.replace(/\*/g, "×").replace(/\//g, "÷");
}

function calculateExpression() {
  const expression = calculatorExpression.replace(/×/g, "*").replace(/÷/g, "/");
  if (!/^[\d+\-*/().\s]+$/.test(expression)) {
    calculatorExpression = "Error";
    renderCalculator();
    return;
  }

  try {
    const value = Function(`"use strict"; return (${expression})`)();
    calculatorExpression = Number.isFinite(value) ? String(Number(value.toFixed(8))) : "Error";
  } catch {
    calculatorExpression = "Error";
  }
  renderCalculator();
}

function pressCalculatorKey(key) {
  if (key === "clear") {
    calculatorExpression = "0";
    renderCalculator();
    return;
  }

  if (key === "back") {
    calculatorExpression = calculatorExpression.length > 1 ? calculatorExpression.slice(0, -1) : "0";
    renderCalculator();
    return;
  }

  if (key === "=") {
    calculateExpression();
    return;
  }

  if (calculatorExpression === "0" || calculatorExpression === "Error") {
    calculatorExpression = /[+\-*/.]/.test(key) ? `0${key}` : key;
  } else {
    calculatorExpression += key;
  }

  renderCalculator();
}

function normalizeWritingBellMode(mode) {
  return mode === "break" ? "break" : "work";
}

function normalizeWritingBellDuration(value, fallback) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(99 * 60, Math.max(60, Math.round(seconds)));
}

function formatWritingBellTime(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatWritingBellDisplay(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  if (safeSeconds < 60) return formatWritingBellTime(safeSeconds);
  const minutes = Math.ceil(safeSeconds / 60);
  return t("bell_minutes_left", minutes);
}

function writingBellModeLabel(mode = writingBellMode) {
  return t(normalizeWritingBellMode(mode) === "break" ? "bell_break" : "bell_work");
}

function setWritingBellStatus(message) {
  if (writingBellStatusEl) writingBellStatusEl.textContent = message;
}

function refreshWritingBellStatusLanguage() {
  if (!writingBellStatusEl) return;
  if (writingBellRunning) {
    setWritingBellStatus(t("bell_running", writingBellModeLabel()));
    return;
  }
  if (writingBellRemaining < writingBellDurations[writingBellMode]) {
    setWritingBellStatus(t("bell_paused", formatWritingBellTime(writingBellRemaining)));
    return;
  }
  setWritingBellStatus(t("bell_ready"));
}

function renderWritingBell() {
  writingBellMode = normalizeWritingBellMode(writingBellMode);
  writingBellDurations = {
    work: normalizeWritingBellDuration(writingBellDurations?.work, 25 * 60),
    break: normalizeWritingBellDuration(writingBellDurations?.break, 5 * 60),
  };
  if (!writingBellRunning) {
    writingBellRemaining = normalizeWritingBellDuration(writingBellRemaining, writingBellDurations[writingBellMode]);
  }

  if (writingBellTimeEl) writingBellTimeEl.textContent = formatWritingBellDisplay(writingBellRemaining);
  if (writingBellModeEl) {
    writingBellModeEl.querySelectorAll("[data-bell-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.bellMode === writingBellMode);
      button.disabled = writingBellRunning;
    });
  }
  if (writingBellPresetsEl) {
    writingBellPresetsEl.querySelectorAll("[data-bell-preset]").forEach((button) => {
      button.disabled = writingBellRunning;
      button.classList.toggle("is-active", Number(button.dataset.bellPreset) * 60 === writingBellDurations[writingBellMode]);
    });
  }
  if (writingBellStartButton) {
    writingBellStartButton.disabled = writingBellRunning;
    writingBellStartButton.textContent = t("start");
  }
  if (writingBellPauseButton) writingBellPauseButton.disabled = !writingBellRunning;
  if (writingBellResetButton) writingBellResetButton.disabled = false;
}

function tickWritingBell() {
  if (!writingBellRunning) return;
  writingBellRemaining = Math.max(0, Math.ceil((writingBellEndsAt - Date.now()) / 1000));
  renderWritingBell();
  if (writingBellRemaining <= 0) completeWritingBell();
}

function clearWritingBellTimer() {
  if (writingBellTimer) {
    clearInterval(writingBellTimer);
    writingBellTimer = null;
  }
}

function startWritingBell() {
  writingBellRemaining = normalizeWritingBellDuration(writingBellRemaining, writingBellDurations[writingBellMode]);
  writingBellRunning = true;
  writingBellEndsAt = Date.now() + writingBellRemaining * 1000;
  clearWritingBellTimer();
  writingBellTimer = setInterval(tickWritingBell, 1000);
  setWritingBellStatus(t("bell_running", writingBellModeLabel()));
  setStatus(t("bell_started", writingBellModeLabel(), formatWritingBellTime(writingBellRemaining)));
  renderWritingBell();
  saveDeskState();
  window.AISystem6ControlStrip?.refreshStrip?.();
}

function pauseWritingBell() {
  if (!writingBellRunning) return;
  writingBellRemaining = Math.max(1, Math.ceil((writingBellEndsAt - Date.now()) / 1000));
  writingBellRunning = false;
  writingBellEndsAt = 0;
  clearWritingBellTimer();
  setWritingBellStatus(t("bell_paused", formatWritingBellTime(writingBellRemaining)));
  setStatus(t("bell_paused", formatWritingBellTime(writingBellRemaining)));
  renderWritingBell();
  saveDeskState();
  window.AISystem6ControlStrip?.refreshStrip?.();
}

function resetWritingBell() {
  writingBellRunning = false;
  writingBellEndsAt = 0;
  clearWritingBellTimer();
  writingBellRemaining = writingBellDurations[writingBellMode];
  setWritingBellStatus(t("bell_ready"));
  renderWritingBell();
  saveDeskState();
}

function setWritingBellMode(mode) {
  if (writingBellRunning) return;
  writingBellMode = normalizeWritingBellMode(mode);
  writingBellRemaining = writingBellDurations[writingBellMode];
  setWritingBellStatus(t("bell_ready"));
  renderWritingBell();
  saveDeskState();
}

function setWritingBellMinutes(minutes) {
  if (writingBellRunning) return;
  const seconds = normalizeWritingBellDuration(Number(minutes) * 60, writingBellDurations[writingBellMode]);
  writingBellDurations[writingBellMode] = seconds;
  writingBellRemaining = seconds;
  setWritingBellStatus(t("bell_ready"));
  renderWritingBell();
  saveDeskState();
}

function completeWritingBell() {
  const completedMode = writingBellMode;
  writingBellRunning = false;
  writingBellEndsAt = 0;
  clearWritingBellTimer();
  writingBellRemaining = writingBellDurations[writingBellMode];
  const nextMode = completedMode === "work" ? "break" : "work";
  const message = t("bell_done", writingBellModeLabel(completedMode));
  setWritingBellStatus(t(completedMode === "work" ? "bell_work_done_hint" : "bell_break_done_hint"));
  setStatus(message);
  playSystemSound("alert");
  renderWritingBell();
  saveDeskState();
  window.AISystem6ControlStrip?.refreshStrip?.();
  showSystemModal(message, "alert").then(() => {
    writingBellMode = nextMode;
    writingBellRemaining = writingBellDurations[writingBellMode];
    setWritingBellStatus(t("bell_next_ready", writingBellModeLabel()));
    renderWritingBell();
    saveDeskState();
  });
}

function getWritingBellState() {
  if (writingBellRunning) {
    writingBellRemaining = Math.max(0, Math.ceil((writingBellEndsAt - Date.now()) / 1000));
  }
  return {
    mode: writingBellMode,
    durations: { ...writingBellDurations },
    remaining: writingBellRemaining,
    running: writingBellRunning,
    endsAt: writingBellEndsAt,
  };
}

function restoreWritingBellState(state = {}) {
  writingBellMode = normalizeWritingBellMode(state.mode);
  writingBellDurations = {
    work: normalizeWritingBellDuration(state.durations?.work, 25 * 60),
    break: normalizeWritingBellDuration(state.durations?.break, 5 * 60),
  };
  writingBellRemaining = normalizeWritingBellDuration(state.remaining, writingBellDurations[writingBellMode]);
  writingBellRunning = Boolean(state.running && Number(state.endsAt) > Date.now());
  writingBellEndsAt = writingBellRunning ? Number(state.endsAt) : 0;
  clearWritingBellTimer();
  if (writingBellRunning) {
    writingBellTimer = setInterval(tickWritingBell, 1000);
    tickWritingBell();
    setWritingBellStatus(t("bell_running", writingBellModeLabel()));
  } else {
    writingBellRemaining = Math.min(writingBellRemaining, writingBellDurations[writingBellMode]);
    setWritingBellStatus(t("bell_ready"));
  }
  renderWritingBell();
}

function puzzleHasGame() {
  return Array.isArray(puzzleTiles) && puzzleTiles.length === 16;
}

function solvedPuzzleTiles() {
  return [...Array(15)].map((_, index) => index + 1).concat(0);
}

function puzzleTileIsSolved() {
  const solved = solvedPuzzleTiles();
  return puzzleHasGame() && puzzleTiles.every((tile, index) => tile === solved[index]);
}

function puzzleAdjacentIndexes(index) {
  const row = Math.floor(index / 4);
  const col = index % 4;
  return [
    row > 0 ? index - 4 : -1,
    row < 3 ? index + 4 : -1,
    col > 0 ? index - 1 : -1,
    col < 3 ? index + 1 : -1,
  ].filter((item) => item >= 0);
}

function shufflePuzzleTiles() {
  const tiles = solvedPuzzleTiles();
  let blankIndex = 15;
  let previousBlank = -1;
  for (let step = 0; step < 140; step += 1) {
    const choices = puzzleAdjacentIndexes(blankIndex).filter((index) => index !== previousBlank);
    const nextIndex = choices[Math.floor(Math.random() * choices.length)] ?? choices[0];
    [tiles[blankIndex], tiles[nextIndex]] = [tiles[nextIndex], tiles[blankIndex]];
    previousBlank = blankIndex;
    blankIndex = nextIndex;
  }
  if (tiles.every((tile, index) => tile === solvedPuzzleTiles()[index])) {
    [tiles[14], tiles[15]] = [tiles[15], tiles[14]];
  }
  return tiles;
}

function setPuzzleStatus(message) {
  if (puzzleStatusEl) puzzleStatusEl.textContent = message;
}

function renderPuzzle() {
  if (!puzzleBoardEl) return;
  if (!puzzleHasGame()) puzzleTiles = solvedPuzzleTiles();

  const blankIndex = puzzleTiles.indexOf(0);
  const movable = new Set(puzzleAdjacentIndexes(blankIndex));
  const solved = puzzleTileIsSolved();
  puzzleBoardEl.replaceChildren();
  puzzleTiles.forEach((tile, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tile ? "puzzle-tile" : "puzzle-tile puzzle-blank";
    button.dataset.puzzleIndex = String(index);
    button.textContent = tile ? String(tile) : "";
    button.disabled = !tile || !movable.has(index) || solved;
    puzzleBoardEl.append(button);
  });
  if (puzzleMovesEl) puzzleMovesEl.textContent = t("moves_count", puzzleMoves);
}

function newPuzzleGame(options = {}) {
  puzzleTiles = shufflePuzzleTiles();
  puzzleMoves = 0;
  setPuzzleStatus(t("puzzle_hint"));
  renderPuzzle();
  if (options.announce !== false) {
    setStatus(t("puzzle_new"));
    playSystemSound("click");
  }
  saveDeskState();
}

function movePuzzleTile(index) {
  if (!puzzleHasGame() || puzzleTileIsSolved()) return;
  const blankIndex = puzzleTiles.indexOf(0);
  if (!puzzleAdjacentIndexes(blankIndex).includes(index)) {
    setPuzzleStatus(t("puzzle_blocked"));
    playSystemSound("alert");
    return;
  }

  [puzzleTiles[blankIndex], puzzleTiles[index]] = [puzzleTiles[index], puzzleTiles[blankIndex]];
  puzzleMoves += 1;
  renderPuzzle();
  playSystemSound("click");
  if (puzzleTileIsSolved()) {
    const message = t("puzzle_won", puzzleMoves);
    setPuzzleStatus(message);
    setStatus(message);
    playSystemSound("save");
    showSystemModal(message, "alert");
  } else {
    setPuzzleStatus(t("puzzle_hint"));
  }
  saveDeskState();
}

function getPuzzleState() {
  return {
    tiles: puzzleHasGame() ? [...puzzleTiles] : [],
    moves: puzzleMoves,
  };
}

function restorePuzzleState(state = {}) {
  const tiles = Array.isArray(state.tiles) ? state.tiles.map(Number) : [];
  const sorted = [...tiles].sort((a, b) => a - b);
  puzzleTiles = sorted.length === 16 && sorted.every((tile, index) => tile === index)
    ? tiles
    : shufflePuzzleTiles();
  puzzleMoves = Number.isInteger(state.moves) && state.moves >= 0 ? state.moves : 0;
  if (puzzleMoves === 0 && puzzleTileIsSolved()) {
    puzzleTiles = shufflePuzzleTiles();
  }
  renderPuzzle();
}
