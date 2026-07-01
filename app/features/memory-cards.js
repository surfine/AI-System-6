// Lazy feature module: Memory Cards desk accessory.

let memoryCards = [];
let memoryCardsFlipped = [];
let memoryCardsMoves = 0;
let memoryCardsMatched = 0;
let memoryCardsStartedAt = null;
let memoryCardsTimer = null;
let memoryCardsLocked = false;

function memoryCardsHasGame() {
  return memoryCards.length > 0;
}

function formatMemoryCardsTime(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function shuffleMemoryCards(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function stopMemoryCardsTimer() {
  if (memoryCardsTimer) {
    clearInterval(memoryCardsTimer);
    memoryCardsTimer = null;
  }
}

function startMemoryCardsTimer() {
  if (memoryCardsTimer) return;
  memoryCardsStartedAt = memoryCardsStartedAt || Date.now();
  memoryCardsTimer = setInterval(updateMemoryCardsStats, 1000);
}

function updateMemoryCardsStats() {
  if (memoryCardsMovesEl) {
    memoryCardsMovesEl.textContent = t("moves_count", memoryCardsMoves);
  }
  if (memoryCardsTimeEl) {
    const elapsed = memoryCardsStartedAt ? Date.now() - memoryCardsStartedAt : 0;
    memoryCardsTimeEl.textContent = formatMemoryCardsTime(elapsed);
  }
}

function setMemoryCardsStatus(message) {
  if (memoryCardsStatusEl) memoryCardsStatusEl.textContent = message;
}

function createMemoryCardArt(card) {
  const art = document.createElement("span");
  art.className = `memory-card-art is-${card.icon}`;
  art.setAttribute("aria-hidden", "true");
  if (card.sfSymbol) art.dataset.sfSymbol = card.sfSymbol;

  const partsByIcon = {
    "adb-mouse": ["body", "button", "cable"],
    "apple-ii": ["monitor", "screen", "case", "keyboard", "badge"],
    "applecd-sc": ["case", "slot", "disc", "light"],
    keyboard: ["body", "keys", "spacebar", "cable"],
    laserwriter: ["body", "paper", "slot", "panel"],
    lisa: ["body", "screen", "drive", "keyboard"],
    "mac-128k": ["body", "screen", "drive", "chin"],
    "mac-portable": ["screen", "base", "keyboard", "trackball", "handle"],
    newton: ["body", "screen", "speaker", "stylus"],
    pippin: ["body", "disc", "button", "feet"],
    "powerbook-100": ["screen", "base", "keyboard", "trackball"],
    quicktake: ["body", "lens", "viewfinder", "grip"],
  };

  const symbol = document.createElement("span");
  symbol.className = "memory-card-sf-symbol";
  symbol.textContent = card.sfSymbol || card.name;
  art.appendChild(symbol);

  (partsByIcon[card.icon] || ["body"]).forEach((part) => {
    const el = document.createElement("span");
    el.className = `memory-card-part ${part}`;
    art.appendChild(el);
  });

  return art;
}

function renderMemoryCards() {
  if (!memoryCardsBoardEl) return;
  memoryCardsBoardEl.replaceChildren();

  const tilts = [-2.3, 1.4, -0.8, 2, -1.5, 0.7, 1.9, -2, 0.8, -1.2, 2.4, -0.5];
  memoryCards.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "memory-card";
    button.dataset.memoryCard = card.id;
    button.style.setProperty("--card-tilt", `${tilts[index % tilts.length]}deg`);
    button.style.setProperty("--card-shift", `${index % 2 === 0 ? -1 : 1}px`);
    button.classList.add(`is-${card.color}`);
    button.setAttribute("aria-label", card.faceUp || card.matched ? card.name : t("memory_cards"));
    button.classList.toggle("is-face-up", card.faceUp);
    button.classList.toggle("is-matched", card.matched);
    button.disabled = memoryCardsLocked || card.faceUp || card.matched;
    if (card.faceUp || card.matched) {
      button.appendChild(createMemoryCardArt(card));
    } else {
      const back = document.createElement("span");
      back.className = "memory-card-back";
      back.setAttribute("aria-hidden", "true");
      button.appendChild(back);
    }
    memoryCardsBoardEl.appendChild(button);
  });

  updateMemoryCardsStats();
}

function newMemoryCardsGame() {
  stopMemoryCardsTimer();
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
  memoryCardsStartedAt = null;
  memoryCardsLocked = false;
  const bestRaw = localStorage.getItem("ai-system-6-memory-cards-best");
  const best = bestRaw ? JSON.parse(bestRaw) : null;
  setMemoryCardsStatus(best ? `${t("memory_cards_hint")} ${t("memory_cards_best", best.moves, best.time)}` : t("memory_cards_hint"));
  renderMemoryCards();
}

function flipMemoryCard(cardId) {
  if (memoryCardsLocked) return;
  const card = memoryCards.find((item) => item.id === cardId);
  if (!card || card.faceUp || card.matched) return;

  startMemoryCardsTimer();
  card.faceUp = true;
  memoryCardsFlipped.push(card);
  playSystemSound("click");
  renderMemoryCards();

  if (memoryCardsFlipped.length < 2) return;

  memoryCardsMoves += 1;
  const [first, second] = memoryCardsFlipped;
  if (first.key === second.key) {
    first.matched = true;
    second.matched = true;
    memoryCardsMatched += 2;
    memoryCardsFlipped = [];
    setMemoryCardsStatus(t("memory_cards_match"));
    playSystemSound("match");
    if (memoryCardsMatched === memoryCards.length) {
      stopMemoryCardsTimer();
      const elapsed = memoryCardsStartedAt ? Date.now() - memoryCardsStartedAt : 0;
      const time = formatMemoryCardsTime(elapsed);
      setMemoryCardsStatus(t("memory_cards_won", memoryCardsMoves, time));
      setStatus(t("memory_cards_won", memoryCardsMoves, time));
      const bestRaw = localStorage.getItem("ai-system-6-memory-cards-best");
      const best = bestRaw ? JSON.parse(bestRaw) : null;
      if (!best || memoryCardsMoves < best.moves || (memoryCardsMoves === best.moves && elapsed < best.elapsed)) {
        localStorage.setItem("ai-system-6-memory-cards-best", JSON.stringify({ moves: memoryCardsMoves, elapsed, time }));
      }
      playSystemSound("done");
      showSystemModal(`${t("memory_cards_won", memoryCardsMoves, time)}\n${t("memory_cards_best", memoryCardsMoves, time)}`, "alert");
    }
    renderMemoryCards();
    return;
  }

  memoryCardsLocked = true;
  setMemoryCardsStatus(t("memory_cards_miss"));
  renderMemoryCards();
  setTimeout(() => {
    first.faceUp = false;
    second.faceUp = false;
    memoryCardsFlipped = [];
    memoryCardsLocked = false;
    renderMemoryCards();
  }, 650);
}
