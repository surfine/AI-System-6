// Lazy feature module: Memory Cards desk accessory.

let memoryCards = [];
let memoryCardsFlipped = [];
let memoryCardsMoves = 0;
let memoryCardsMatched = 0;
let memoryCardsElapsed = 0;
let memoryCardsRunningSince = null;
let memoryCardsTimer = null;
let memoryCardsMismatchTimer = null;
let memoryCardsLocked = false;
let memoryCardsFocusIndex = 0;

const memoryCardsSvgNamespace = "http://www.w3.org/2000/svg";

function memoryCardsHasGame() {
  return memoryCards.length > 0;
}

function memoryCardsColumnCount() {
  const value = Number(getComputedStyle(memoryCardsBoardEl).getPropertyValue("--memory-cards-columns"));
  return Number.isInteger(value) && value > 0 ? value : 6;
}

function formatMemoryCardsTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseMemoryCardsTime(value = "") {
  const match = /^(\d+):(\d{2})$/.exec(value);
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

function readMemoryCardsBest() {
  try {
    const raw = localStorage.getItem("ai-system-6-memory-cards-best");
    if (!raw) return null;
    const record = JSON.parse(raw);
    const moves = Number(record?.moves);
    const elapsed = Number.isFinite(Number(record?.elapsed))
      ? Number(record.elapsed)
      : parseMemoryCardsTime(record?.time);
    if (!Number.isInteger(moves) || moves < 1 || !Number.isFinite(elapsed) || elapsed < 0) return null;
    return { moves, elapsed, time: formatMemoryCardsTime(elapsed) };
  } catch {
    return null;
  }
}

function writeMemoryCardsBest(record) {
  localStorage.setItem("ai-system-6-memory-cards-best", JSON.stringify(record));
}

function shuffleMemoryCards(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function currentMemoryCardsElapsed() {
  return memoryCardsElapsed + (memoryCardsRunningSince ? Date.now() - memoryCardsRunningSince : 0);
}

function stopMemoryCardsTimer() {
  if (memoryCardsTimer) {
    clearInterval(memoryCardsTimer);
    memoryCardsTimer = null;
  }
}

function pauseMemoryCardsGame() {
  if (memoryCardsRunningSince) {
    memoryCardsElapsed += Date.now() - memoryCardsRunningSince;
    memoryCardsRunningSince = null;
  }
  stopMemoryCardsTimer();
  updateMemoryCardsStats();
}

function startMemoryCardsTimer() {
  if (memoryCardsTimer || memoryCardsMatched === memoryCards.length) return;
  memoryCardsRunningSince = Date.now();
  memoryCardsTimer = setInterval(updateMemoryCardsStats, 1000);
}

function updateMemoryCardsStats() {
  if (memoryCardsMovesEl) {
    memoryCardsMovesEl.textContent = t("moves_count", memoryCardsMoves);
  }
  if (memoryCardsTimeEl) {
    memoryCardsTimeEl.textContent = formatMemoryCardsTime(currentMemoryCardsElapsed());
  }
}

function setMemoryCardsStatus(message) {
  if (memoryCardsStatusEl) memoryCardsStatusEl.textContent = message;
}

function createMemoryCardArt(card) {
  const art = document.createElement("span");
  art.className = "memory-card-art";
  art.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(memoryCardsSvgNamespace, "svg");
  svg.classList.add("memory-card-glyph");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("focusable", "false");

  const use = document.createElementNS(memoryCardsSvgNamespace, "use");
  use.setAttribute("href", `assets/icons/memory-cards.svg#memory-card-${card.icon}`);
  svg.appendChild(use);
  art.appendChild(svg);
  return art;
}

function createMemoryCardElement(card, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `memory-card is-${card.color}`;
  button.dataset.memoryCard = card.id;
  button.dataset.memoryCardIndex = String(index);
  button.setAttribute("role", "gridcell");

  const inner = document.createElement("span");
  inner.className = "memory-card-inner";
  inner.setAttribute("aria-hidden", "true");

  const back = document.createElement("span");
  back.className = "memory-card-back";
  back.append(
    Object.assign(document.createElement("span"), { className: "memory-card-back-mark" }),
  );

  const face = document.createElement("span");
  face.className = "memory-card-face";
  face.appendChild(createMemoryCardArt(card));

  inner.append(back, face);
  button.appendChild(inner);
  return button;
}

function buildMemoryCardsBoard() {
  if (!memoryCardsBoardEl) return;
  const fragment = document.createDocumentFragment();
  memoryCards.forEach((card, index) => fragment.appendChild(createMemoryCardElement(card, index)));
  memoryCardsBoardEl.replaceChildren(fragment);
}

function nextAvailableMemoryCardIndex(startIndex = 0, step = 1) {
  if (!memoryCards.length) return 0;
  for (let offset = 0; offset < memoryCards.length; offset += 1) {
    const index = ((startIndex + offset * step) % memoryCards.length + memoryCards.length) % memoryCards.length;
    if (!memoryCards[index].matched) return index;
  }
  return 0;
}

function focusMemoryCard(index, step = 1) {
  memoryCardsFocusIndex = nextAvailableMemoryCardIndex(index, step);
  const target = memoryCardsBoardEl?.querySelector(`[data-memory-card-index="${memoryCardsFocusIndex}"]`);
  target?.focus();
}

function updateMemoryCardsDom({ restoreFocus = false } = {}) {
  if (!memoryCardsBoardEl) return;
  memoryCardsBoardEl.classList.toggle("is-locked", memoryCardsLocked);
  memoryCardsBoardEl.classList.toggle("is-complete", memoryCards.length > 0 && memoryCardsMatched === memoryCards.length);
  memoryCardsBoardEl.setAttribute("aria-busy", String(memoryCardsLocked));

  const buttons = memoryCardsBoardEl.querySelectorAll("[data-memory-card-index]");
  const columns = memoryCardsColumnCount();
  buttons.forEach((button, index) => {
    const card = memoryCards[index];
    const row = Math.floor(index / columns) + 1;
    const column = index % columns + 1;
    const unavailable = memoryCardsLocked || card.faceUp || card.matched;

    button.classList.toggle("is-face-up", card.faceUp);
    button.classList.toggle("is-matched", card.matched);
    button.disabled = card.matched;
    button.tabIndex = index === memoryCardsFocusIndex && !card.matched ? 0 : -1;
    button.setAttribute("aria-pressed", String(card.faceUp || card.matched));
    button.setAttribute("aria-disabled", String(unavailable));
    button.setAttribute(
      "aria-label",
      card.matched
        ? t("memory_cards_card_matched", card.name)
        : card.faceUp
          ? t("memory_cards_card_up", card.name)
          : t("memory_cards_card_down", row, column),
    );
  });

  updateMemoryCardsStats();
  if (restoreFocus) requestAnimationFrame(() => focusMemoryCard(memoryCardsFocusIndex));
}

function renderMemoryCards() {
  if (!memoryCardsBoardEl) return;
  if (memoryCardsBoardEl.children.length !== memoryCards.length) buildMemoryCardsBoard();
  updateMemoryCardsDom();
}

function newMemoryCardsGame() {
  stopMemoryCardsTimer();
  if (memoryCardsMismatchTimer) {
    clearTimeout(memoryCardsMismatchTimer);
    memoryCardsMismatchTimer = null;
  }

  const deck = shuffleMemoryCards([...memoryCardPairs, ...memoryCardPairs]);
  memoryCards = deck.map((card, index) => ({
    ...card,
    id: `card-${index}-${card.key}`,
    faceUp: false,
    matched: false,
  }));
  memoryCardsFlipped = [];
  memoryCardsMoves = 0;
  memoryCardsMatched = 0;
  memoryCardsElapsed = 0;
  memoryCardsRunningSince = null;
  memoryCardsLocked = false;
  memoryCardsFocusIndex = 0;

  setMemoryCardsStatus(t("memory_cards_hint"));
  buildMemoryCardsBoard();
  updateMemoryCardsDom();
}

function flipMemoryCard(cardId) {
  if (memoryCardsLocked) return;
  const index = memoryCards.findIndex((item) => item.id === cardId);
  const card = memoryCards[index];
  if (!card || card.faceUp || card.matched) return;

  memoryCardsFocusIndex = index;
  startMemoryCardsTimer();
  card.faceUp = true;
  memoryCardsFlipped.push(card);
  playSystemSound("click");
  updateMemoryCardsDom();

  if (memoryCardsFlipped.length < 2) return;

  memoryCardsMoves += 1;
  const [first, second] = memoryCardsFlipped;
  if (first.key === second.key) {
    first.matched = true;
    second.matched = true;
    memoryCardsMatched += 2;
    memoryCardsFlipped = [];
    memoryCardsFocusIndex = nextAvailableMemoryCardIndex(index + 1, 1);
    setMemoryCardsStatus(t("memory_cards_match"));
    playSystemSound("match");

    if (memoryCardsMatched === memoryCards.length) {
      pauseMemoryCardsGame();
      const elapsed = currentMemoryCardsElapsed();
      const time = formatMemoryCardsTime(elapsed);
      const previousBest = readMemoryCardsBest();
      const isNewBest = !previousBest
        || memoryCardsMoves < previousBest.moves
        || (memoryCardsMoves === previousBest.moves && elapsed < previousBest.elapsed);
      const completed = { moves: memoryCardsMoves, elapsed, time };
      if (isNewBest) writeMemoryCardsBest(completed);
      setMemoryCardsStatus(t("memory_cards_won", memoryCardsMoves, time));
      setStatus(t("memory_cards_won", memoryCardsMoves, time));
      playSystemSound("done");
    }

    updateMemoryCardsDom({ restoreFocus: memoryCardsMatched < memoryCards.length });
    return;
  }

  memoryCardsLocked = true;
  setMemoryCardsStatus(t("memory_cards_miss"));
  updateMemoryCardsDom();
  memoryCardsMismatchTimer = setTimeout(() => {
    first.faceUp = false;
    second.faceUp = false;
    memoryCardsFlipped = [];
    memoryCardsLocked = false;
    memoryCardsMismatchTimer = null;
    updateMemoryCardsDom({ restoreFocus: true });
  }, 850);
}

function handleMemoryCardsKeydown(event) {
  const button = event.target.closest("[data-memory-card-index]");
  if (!button) return;

  const current = Number(button.dataset.memoryCardIndex);
  const columns = memoryCardsColumnCount();
  let next = null;
  if (event.key === "ArrowLeft") next = current - 1;
  if (event.key === "ArrowRight") next = current + 1;
  if (event.key === "ArrowUp") next = current - columns;
  if (event.key === "ArrowDown") next = current + columns;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = memoryCards.length - 1;
  if (next === null) return;

  event.preventDefault();
  const step = next < current ? -1 : 1;
  focusMemoryCard((next + memoryCards.length) % memoryCards.length, step);
}

memoryCardsBoardEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-memory-card]");
  if (!button) return;
  memoryCardsFocusIndex = Number(button.dataset.memoryCardIndex);
  flipMemoryCard(button.dataset.memoryCard);
});
memoryCardsBoardEl?.addEventListener("keydown", handleMemoryCardsKeydown);
