// Multiplayer transport and Riddle Rally's room-code game screen.
const app = document.querySelector("#app");
const roomChip = document.querySelector("#room-chip");
const toast = document.querySelector("#toast");
app.removeAttribute("aria-live");

const params = new URLSearchParams(location.search);
const rawRoom = (params.get("room") || "").trim();
const room = rawRoom.toUpperCase();
const validRoom = !rawRoom || /^[A-Z0-9_-]{1,16}$/.test(room);
const nameKey = "riddle-rally:name";
const idKey = "riddle-rally:playerId";
const drafts = new Map();

let socket = null;
let reconnectCount = 0;
let lastMessage = null;
let lastSentName = "";
let lastFeedbackSequence = 0;
let toastTimeout = null;

function el(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined && text !== null) item.textContent = String(text);
  return item;
}

function svgNode(tag, attrs) {
  const item = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
  return item;
}

function button(label, className, onClick, disabled = false) {
  const item = el("button", "button " + (className || ""), label);
  item.type = "button";
  item.disabled = disabled;
  if (onClick) item.addEventListener("click", onClick);
  return item;
}

function getStoredName() {
  try {
    return localStorage.getItem(nameKey) || "Explorer";
  } catch {
    return "Explorer";
  }
}

function saveName(value) {
  const name = String(value || "").trim().slice(0, 18) || "Explorer";
  try {
    localStorage.setItem(nameKey, name);
  } catch {
    // The name still works for this page if browser storage is unavailable.
  }
  return name;
}

function playerId() {
  try {
    let id = localStorage.getItem(idKey);
    if (!id) {
      id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      localStorage.setItem(idKey, id);
    }
    return id;
  } catch {
    return "guest-" + crypto.randomUUID().slice(0, 12);
  }
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendAction(type, details = {}) {
  send({ type: "action", action: { ...details, type } });
}

function setRoomChip(text) {
  roomChip.replaceChildren();
  if (!text) return;
  roomChip.append(el("span", "", "ROOM"));
  roomChip.append(el("strong", "", text));
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function openRoom(code) {
  saveName(drafts.get("home-name") || getStoredName());
  const next = new URL(location.href);
  next.search = "";
  next.searchParams.set("room", code);
  location.href = next.toString();
}

function nameField(id, labelText) {
  const wrap = el("label", "");
  wrap.htmlFor = id;
  wrap.append(el("span", "field-label", labelText));
  const input = el("input", "text-input");
  input.type = "text";
  input.id = id;
  input.maxLength = 18;
  input.autocomplete = "nickname";
  input.value = drafts.get(id) ?? getStoredName();
  input.addEventListener("input", () => drafts.set(id, input.value));
  input.addEventListener("change", () => {
    const name = saveName(input.value);
    drafts.delete(id);
    input.value = name;
    if (lastMessage?.status === "playing" && lastMessage.view?.phase === "lobby") {
      lastSentName = name;
      sendAction("rename", { name });
    }
  });
  wrap.append(input);
  return wrap;
}

function shareBox() {
  const panel = el("div", "share-box");
  panel.append(el("p", "", "Share this link, or give friends the room code to enter at the game URL."));
  const link = location.origin + location.pathname + "?room=" + encodeURIComponent(room);
  panel.append(el("div", "share-link", link));
  panel.append(button("Copy invite link", "secondary small", async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invite link copied.");
    } catch {
      showToast("Select and copy the invite link above.");
    }
  }));
  return panel;
}

function homeIllustration() {
  const svg = svgNode("svg", { viewBox: "0 0 420 340", role: "img", "aria-label": "A magnifying glass over a clue notebook" });
  const shapes = [
    ["path", { d: "M51 236 90 89q5-19 23-14l188 48q17 4 12 22l-35 145q-4 16-22 12L68 254q-21-4-17-18Z", fill: "#fff9e9", stroke: "#a77933", "stroke-width": "5" }],
    ["path", { d: "m95 100 100 25m-106-1 87 22m-94-3 64 17", fill: "none", stroke: "#b9a783", "stroke-width": "4", "stroke-linecap": "round" }],
    ["path", { d: "M228 101q51 28 98 42v142q-45-23-92-39-52 14-89 32V133q40-27 83-32Z", fill: "#35436a", stroke: "#27343a", "stroke-width": "5", "stroke-linejoin": "round" }],
    ["path", { d: "M230 109v137m-64-94 47-24m-45 49 42-22", fill: "none", stroke: "#f3ead8", "stroke-width": "4", "stroke-linecap": "round" }],
    ["circle", { cx: "250", cy: "154", r: "77", fill: "#d88f68", "fill-opacity": ".4", stroke: "#a77933", "stroke-width": "13" }],
    ["circle", { cx: "250", cy: "154", r: "63", fill: "#fff7e2", "fill-opacity": ".38", stroke: "#f8dfad", "stroke-width": "3" }],
    ["path", { d: "m308 212 54 53q10 11-1 22t-22 0l-54-53", fill: "#173d36", stroke: "#a77933", "stroke-width": "9", "stroke-linejoin": "round" }],
    ["path", { d: "M250 139v32m-16-16h32", stroke: "#cb604d", "stroke-width": "7", "stroke-linecap": "round" }],
    ["path", { d: "M83 61q-13-26 10-33t29 10q14 23-2 36", fill: "#5b8057", stroke: "#173d36", "stroke-width": "4" }],
    ["path", { d: "M361 80q23-10 30 8t-10 26q-26 5-28-18", fill: "#cb604d", stroke: "#973f34", "stroke-width": "4" }],
    ["path", { d: "m65 298 12-31 13 31m-18-10h17", fill: "#a77933", stroke: "#755425", "stroke-width": "3", "stroke-linejoin": "round" }],
  ];
  for (const [tag, attrs] of shapes) svg.append(svgNode(tag, attrs));
  return svg;
}

function renderHome(message = "") {
  setRoomChip("");
  const card = el("section", "paper-card home-card");
  const copy = el("div", "home-copy");
  copy.append(el("p", "eyebrow", "A live clue hunt for 2–8 friends"));
  copy.append(el("h1", "", "Riddle Rally"));
  copy.append(el("p", "lead", "Read the place riddle together. Find the right location to reveal your private item clue. Then race your friends to the hidden thing."));
  const actions = el("div", "home-actions");
  actions.append(nameField("home-name", "Your explorer name"));
  actions.append(button("Create a room", "coral", () => {
    const name = document.querySelector("#home-name")?.value || getStoredName();
    saveName(name);
    openRoom(makeRoomCode());
  }));
  const join = el("form", "join-form");
  const code = el("input", "text-input");
  code.type = "text";
  code.id = "room-code";
  code.placeholder = "ROOM CODE";
  code.setAttribute("aria-label", "Room code");
  code.autocomplete = "off";
  code.maxLength = 16;
  code.value = drafts.get("room-code") || "";
  code.addEventListener("input", () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    drafts.set("room-code", code.value);
  });
  const joinButton = el("button", "button secondary", "Join room");
  joinButton.type = "submit";
  join.append(code, joinButton);
  join.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#home-name")?.value || getStoredName();
    saveName(name);
    const value = code.value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,16}$/.test(value)) {
      showToast("Enter a room code using letters or numbers.", true);
      return;
    }
    openRoom(value);
  });
  actions.append(join);
  actions.append(el("p", "fine-print", "Five places to explore · 60-second hunts · wrong picks cost a point"));
  if (message) actions.append(el("p", "status-line accent", message));
  copy.append(actions);

  const art = el("div", "home-art");
  art.setAttribute("aria-hidden", "true");
  art.append(homeIllustration());
  card.append(copy, art);
  app.replaceChildren(card);
  if (drafts.has("room-code")) {
    const field = document.querySelector("#room-code");
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }
}

function roomHeader(title, subtitle, msg) {
  const header = el("section", "paper-card screen-header");
  const copy = el("div", "");
  copy.append(el("p", "eyebrow", "Riddle Rally · Room " + room));
  copy.append(el("h1", "", title));
  copy.append(el("p", "", subtitle));
  const actions = el("div", "header-actions");
  actions.append(el("span", "room-chip", msg.seats.length + " / 8 explorers"));
  actions.append(button("Copy invite", "secondary small", async () => {
    const link = location.origin + location.pathname + "?room=" + encodeURIComponent(room);
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invite link copied.");
    } catch {
      showToast("Share room code " + room + " with your friends.");
    }
  }));
  header.append(copy, actions);
  return header;
}

function makePlayersList(players, hostId, you, showScores = false) {
  const list = el("ul", "players-list");
  for (const player of players) {
    const row = el("li", "player-row");
    const identity = el("span", "player-name");
    identity.append(el("span", "", player.name + (player.id === you ? " · you" : "")));
    if (player.id === hostId) identity.append(el("span", "host-tag", "Host"));
    row.append(identity);
    if (showScores) {
      const number = showScores === "finds" ? player.finds : player.score;
      row.append(el("span", "player-points", showScores === "finds" ? number + " finds" : number + " pts"));
    }
    list.append(row);
  }
  return list;
}

function renderWaiting(msg) {
  const card = el("section", "paper-card waiting-card");
  card.append(el("p", "eyebrow", "Your room is ready"));
  card.append(el("h1", "", "Invite the other explorers"));
  card.append(el("p", "", "The lobby opens when a second player joins. Keep this page open and share the code."));
  card.append(nameField("player-name", "Your explorer name"));
  card.append(el("p", "fine-print", msg.seats.length + " of 8 seats filled · " + msg.connected + " connected"));
  card.append(shareBox());
  app.replaceChildren(card);
}

function scoringCards(view, enabled) {
  const section = el("section", "section-card paper-card");
  section.append(el("h2", "", "Choose the scoring"));
  section.append(el("p", "section-note", "The host can change these before the hunt starts."));
  const grid = el("div", "choice-grid");
  const choices = [
    ["winner", "First place wins all points", "First finder gets 5; later correct finds in the 15-second window earn 1."],
    ["speed", "Speed bonus for all", "Every correct finder earns points; earlier answers earn a bigger bonus."],
    ["coop", "Co-op shared score", "Correct finds build one team score; wrong picks remove a team point."],
  ];
  for (const [mode, title, detail] of choices) {
    const item = el("button", "choice-card");
    item.type = "button";
    item.disabled = !enabled;
    item.setAttribute("aria-pressed", String(view.settings.scoring === mode));
    item.append(el("strong", "", title), el("span", "", detail));
    item.addEventListener("click", () => sendAction("configure-scoring", { mode }));
    grid.append(item);
  }
  section.append(grid);
  return section;
}

function endSettings(view, enabled) {
  const section = el("section", "section-card paper-card");
  section.append(el("h2", "", "Choose how the match ends"));
  section.append(el("p", "section-note", "Pick a target score, a set number of hunts, or a match timer."));
  const row = el("div", "end-row");
  const modeLabel = el("label", "");
  modeLabel.htmlFor = "end-mode";
  modeLabel.append(el("span", "field-label", "Win condition"));
  const select = el("select", "");
  select.id = "end-mode";
  for (const [value, label] of [["target", "Target score"], ["hunts", "Fixed hunts"], ["timer", "Match timer"]]) {
    const option = el("option", "", label);
    option.value = value;
    select.append(option);
  }
  select.value = view.settings.endMode;
  select.disabled = !enabled;
  select.addEventListener("change", () => {
    const mode = select.value;
    const defaults = { target: view.settings.targetScore, hunts: view.settings.huntLimit, timer: view.settings.minutes };
    sendAction("configure-ending", { mode, value: defaults[mode] });
  });
  modeLabel.append(select);

  const valueLabel = el("label", "");
  valueLabel.htmlFor = "end-value";
  const valueTitle = view.settings.endMode === "target" ? "Points to win" : view.settings.endMode === "hunts" ? "Number of hunts" : "Minutes";
  valueLabel.append(el("span", "field-label", valueTitle));
  const input = el("input", "");
  input.id = "end-value";
  input.type = "number";
  input.inputMode = "numeric";
  const limits = view.settings.endMode === "target" ? [5, 60, view.settings.targetScore] :
    view.settings.endMode === "hunts" ? [3, 20, view.settings.huntLimit] :
      [1, 15, view.settings.minutes];
  input.min = String(limits[0]);
  input.max = String(limits[1]);
  input.value = drafts.get("end-value") ?? String(limits[2]);
  input.disabled = !enabled;
  input.addEventListener("input", () => drafts.set("end-value", input.value));
  input.addEventListener("change", () => {
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < limits[0] || value > limits[1]) {
      showToast("Choose a value from " + limits[0] + " to " + limits[1] + ".", true);
      input.value = String(limits[2]);
      drafts.delete("end-value");
      return;
    }
    drafts.delete("end-value");
    sendAction("configure-ending", { mode: view.settings.endMode, value });
  });
  valueLabel.append(input);
  row.append(modeLabel, valueLabel);
  section.append(row);
  return section;
}

function renderLobby(msg) {
  const view = msg.view;
  const host = view.isHost;
  const screen = el("div", "screen");
  screen.append(roomHeader("The lobby", "Choose the rules, then start the first hunt.", msg));
  const columns = el("div", "lobby-grid");
  const rules = el("div", "screen");
  rules.append(scoringCards(view, host), endSettings(view, host));
  const people = el("section", "section-card paper-card");
  people.append(el("h2", "", "Explorers (" + view.players.length + "/8)"));
  people.append(el("p", "section-note", "The host is marked. Everyone can change their name before play."));
  people.append(nameField("player-name", "Your explorer name"));
  people.append(makePlayersList(view.players, view.hostId, msg.you));
  people.append(shareBox());
  const start = button(host ? "Start the first hunt" : "Waiting for the host", "start-match coral",
    () => sendAction("start"), !host || view.players.length < 2);
  people.append(start);
  people.append(el("p", "fine-print", host ? "You need at least two players to start." : "The host can start once everyone is ready."));
  columns.append(rules, people);
  screen.append(columns);
  app.replaceChildren(screen);
}

function timerLabel(view) {
  if (view.phase === "scoring") return "Extra scoring window";
  if (view.phase === "reveal") return "Next hunt";
  return "Hunt clock";
}

function timerValue(view) {
  if (view.phase === "scoring") return view.windowSecondsLeft;
  if (view.phase === "reveal") return view.revealSecondsLeft;
  return view.secondsLeft;
}

function timeText(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

function addScoreboard(view, you) {
  const card = el("section", "paper-card score-card");
  card.append(el("h2", "", view.settings.scoring === "coop" ? "Team score" : "Live scores"));
  if (view.settings.scoring === "coop") {
    card.append(el("p", "section-note", "Every explorer shares this score."));
    const total = el("div", "team-score", "Crew total");
    total.append(el("strong", "", view.teamScore + " pts"));
    card.append(total);
    card.append(makePlayersList(view.players, view.hostId, you, "finds"));
  } else {
    const ranked = [...view.players].sort((a, b) => b.score - a.score);
    card.append(makePlayersList(ranked, view.hostId, you, true));
  }
  return card;
}

function addProgress(view) {
  const card = el("section", "paper-card progress-card");
  card.append(el("h2", "", "This hunt"));
  const locationNames = new Map(view.locationOptions.map((location) => [location.id, location.name]));
  const rows = el("div", "progress-list");
  const openRow = el("div", "progress-row");
  openRow.append(el("span", "", "Location clues opened"), el("strong", "", view.foundLocations.length + " / " + view.players.length));
  rows.append(openRow);
  const foundRow = el("div", "progress-row");
  foundRow.append(el("span", "", "Items found"), el("strong", "", view.correctPlayers.length + " / " + view.players.length));
  rows.append(foundRow);
  if (view.answer) {
    const placeRow = el("div", "progress-row");
    placeRow.append(el("span", "", "Place"), el("strong", "", locationNames.get(view.answer.locationId) || view.answer.location));
    rows.append(placeRow);
  }
  card.append(rows);
  card.append(el("p", "fine-print", view.settings.scoring === "coop"
    ? "Wrong picks remove one team point."
    : "Wrong picks cost the explorer one point."));
  return card;
}

function feedbackMessage(feedback) {
  if (!feedback) return "";
  if (feedback.kind === "wrong-location") return "Not that place — you lost 1 point.";
  if (feedback.kind === "wrong-item") return "Not that item — you lost 1 point.";
  if (feedback.kind === "right-location") return "Right place! Your private item clue is unlocked.";
  if (feedback.kind === "first-item") return "Found it first! +" + feedback.delta + " points. The 15-second window is open.";
  if (feedback.kind === "right-item") return "Correct find! +" + feedback.delta + (feedback.delta === 1 ? " point." : " points.");
  return "";
}

function renderHunt(msg) {
  const view = msg.view;
  const screen = el("div", "screen");
  const heading = view.phase === "reveal" ? "Answer revealed" : "The hunt is on";
  const subtitle = view.phase === "scoring"
    ? "Someone found the item — the 15-second scoring window is open."
    : view.phase === "reveal"
      ? "Take a breath; the next clue arrives in a moment."
      : "Solve the place clue, then your personal item clue.";
  screen.append(roomHeader(heading, subtitle, msg));

  const grid = el("div", "round-grid");
  const clue = el("section", "paper-card clue-card");
  const timerRow = el("div", "timer-row");
  timerRow.append(el("span", "hunt-label", "Hunt " + view.huntNumber + " · " + timerLabel(view)));
  const seconds = timerValue(view);
  const clock = el("span", "timer" + (view.phase !== "reveal" && seconds <= 10 ? " urgent" : ""), timeText(seconds));
  clock.setAttribute("aria-label", timerLabel(view) + ": " + timeText(seconds));
  timerRow.append(clock);
  clue.append(timerRow);

  if (view.phase === "reveal") {
    clue.append(el("p", "riddle-label", "The answer"));
    clue.append(el("h2", "riddle-text", view.answer ? view.answer.item : "No item was found"));
    clue.append(el("p", "muted", view.answer ? "Hidden in the " + view.answer.location + "." : "The clock ran out before anyone found it."));
  } else {
    clue.append(el("p", "riddle-label", "First clue · find the location"));
    clue.append(el("p", "riddle-text", view.locationClue));
    const locations = el("div", "location-grid");
    const hasLocation = view.foundLocations.includes(msg.you);
    const alreadyFound = view.correctPlayers.includes(msg.you);
    for (const place of view.locationOptions) {
      const choice = el("button", "location-button");
      choice.type = "button";
      choice.disabled = !view.isSeated || (view.phase !== "hunt" && view.phase !== "scoring") || hasLocation || alreadyFound;
      choice.append(el("span", "location-icon", place.icon), el("strong", "", place.name));
      choice.addEventListener("click", () => sendAction("choose-location", { locationId: place.id }));
      locations.append(choice);
    }
    clue.append(locations);

    if (view.itemClue) {
      const privateCard = el("div", "private-clue");
      privateCard.append(el("p", "riddle-label", "Your private clue · item"));
      privateCard.append(el("h3", "", "Only you can see this clue"));
      privateCard.append(el("p", "", view.itemClue));
      clue.append(privateCard);
      const items = el("div", "item-grid");
      for (const item of view.itemOptions) {
        const choice = button(item.name, "secondary item-button",
          () => sendAction("choose-item", { itemId: item.id }),
          !view.isSeated || view.correctPlayers.includes(msg.you) || (view.phase !== "hunt" && view.phase !== "scoring"));
        items.append(choice);
      }
      clue.append(items);
    } else if (hasLocation && !alreadyFound) {
      clue.append(el("p", "locked-note", "Your item clue is on its way…"));
    } else if (!alreadyFound) {
      clue.append(el("p", "locked-note", view.isSeated
        ? "Open the right location to unlock your private item clue."
        : "You’re watching this hunt. Join the next lobby to take a seat."));
    }
    if (alreadyFound) {
      clue.append(el("p", "locked-note", "You found the item. Watch the room and see who else solves it."));
    }
  }

  if (view.answer && view.phase === "over") {
    const answer = el("div", "answer-card");
    answer.append(el("p", "riddle-label", "Final answer"));
    answer.append(el("h2", "", view.answer.item));
    answer.append(el("p", "", "Found in the " + view.answer.location + "."));
    clue.append(answer);
  }

  const side = el("aside", "sidebar");
  side.append(addScoreboard(view, msg.you));
  side.append(addProgress(view));
  if (view.settings.endMode === "target") {
    const target = view.settings.targetScore;
    side.append(el("p", "fine-print", "First to " + target + " points wins" + (view.settings.scoring === "coop" ? " together." : ".")));
  } else if (view.settings.endMode === "hunts") {
    side.append(el("p", "fine-print", view.huntsCompleted + " of " + view.settings.huntLimit + " hunts complete."));
  } else {
    side.append(el("p", "fine-print", "Match clock: " + timeText(view.matchSecondsLeft) + " remaining."));
  }
  const note = el("p", "status-line");
  note.textContent = view.phase === "scoring"
    ? view.correctPlayers.length + " explorer" + (view.correctPlayers.length === 1 ? "" : "s") + " found it."
    : view.phase === "reveal"
      ? (view.lastHuntResult?.reason === "time" ? "The 60-second hunt ended." : "The scoring window has closed.")
      : view.isSeated ? "Your clue and choices are private to your screen." : "Spectator view.";
  side.append(note);
  grid.append(clue, side);
  screen.append(grid);
  app.replaceChildren(screen);
}

function renderOver(msg) {
  const view = msg.view;
  const result = msg.result || {};
  const card = el("section", "paper-card result-card");
  card.append(el("p", "eyebrow", "Match complete"));
  let title = "It's a tie";
  if (view.settings.scoring === "coop") title = "The whole crew wins";
  else if (result.winner) {
    const winner = view.players.find((player) => player.id === result.winner);
    title = (winner?.name || "An explorer") + " wins";
  }
  card.append(el("h1", "", title));
  const ending = result.reason === "timer" ? "The match timer ran out."
    : result.reason === "hunts" ? "You completed the hunt limit."
      : result.reason === "target" ? "The target score was reached."
        : "The match is over.";
  card.append(el("p", "", ending));
  card.append(makePlayersList(
    view.settings.scoring === "coop" ? view.players : [...view.players].sort((a, b) => b.score - a.score),
    view.hostId,
    msg.you,
    view.settings.scoring === "coop" ? "finds" : true,
  ));
  if (view.settings.scoring === "coop") {
    const total = el("div", "team-score", "Shared team score");
    total.append(el("strong", "", view.teamScore + " pts"));
    card.append(total);
  }
  if (view.answer) {
    const answer = el("div", "answer-card");
    answer.append(el("p", "riddle-label", "Last answer"));
    answer.append(el("h2", "", view.answer.item));
    answer.append(el("p", "", "It was hidden in the " + view.answer.location + "."));
    card.append(answer);
  }
  if (view.isHost) {
    card.append(button("Start a rematch", "coral", () => send({ type: "reset" })));
  } else {
    card.append(el("p", "fine-print", "The host can start a rematch from this room."));
  }
  app.replaceChildren(card);
}

function syncName(msg) {
  if (msg.status !== "playing" || msg.view?.phase !== "lobby" || !msg.seats.includes(msg.you)) return;
  const player = msg.view.players.find((candidate) => candidate.id === msg.you);
  const name = getStoredName();
  if (player && player.name !== name && lastSentName !== name) {
    lastSentName = name;
    sendAction("rename", { name });
  }
}

function handleFeedback(view) {
  const feedback = view?.feedback;
  if (!feedback || feedback.sequence <= lastFeedbackSequence) return;
  lastFeedbackSequence = feedback.sequence;
  const text = feedbackMessage(feedback);
  if (text) showToast(text, feedback.kind.startsWith("wrong"));
}

function renderMessage(msg) {
  if (!validRoom) {
    renderHome("Room codes use letters, numbers, hyphens, or underscores.");
    return;
  }
  if (lastMessage?.view?.phase === "over" && msg.view?.phase === "lobby") lastSentName = "";
  lastMessage = msg;
  setRoomChip(room + " · " + (socket?.readyState === WebSocket.OPEN ? "LIVE" : "RECONNECTING"));
  syncName(msg);
  handleFeedback(msg.view);

  if (msg.status === "waiting") {
    renderWaiting(msg);
    return;
  }
  if (!msg.view) {
    renderHome("Waiting for the room to respond…");
    return;
  }
  if (msg.view.phase === "lobby") renderLobby(msg);
  else if (msg.view.phase === "over") renderOver(msg);
  else renderHunt(msg);
}

function connect() {
  if (!room || !validRoom) {
    renderHome(validRoom ? "" : "Room codes use letters, numbers, hyphens, or underscores.");
    return;
  }
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(protocol + "//" + location.host + "/ws/" + encodeURIComponent(room));
  socket.addEventListener("open", () => {
    reconnectCount = 0;
    setRoomChip(room + " · LIVE");
    send({ type: "join", playerId: playerId() });
  });
  socket.addEventListener("message", (event) => {
    if (event.data === "__pong") return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "state") renderMessage(message);
    else if (message.type === "error") showToast(message.error, true);
  });
  socket.addEventListener("close", () => {
    reconnectCount = Math.min(reconnectCount + 1, 6);
    const delay = 500 * 2 ** (reconnectCount - 1);
    setRoomChip(room + " · reconnecting");
    showToast("Connection paused — trying again.");
    setTimeout(connect, delay);
  });
  socket.addEventListener("error", () => {
    setRoomChip(room + " · reconnecting");
  });
}

if (!validRoom) renderHome("Room codes use letters, numbers, hyphens, or underscores.");
else if (room) connect();
else renderHome();

setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) socket.send("__ping");
}, 30_000);
