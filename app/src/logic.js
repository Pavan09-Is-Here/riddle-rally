/**
 * Riddle Rally's server-authoritative rules.
 *
 * This module stays pure: the room owns its one-second alarm, and calls the
 * internal `tick` action to advance the hunt clock. The client never gets the
 * hidden target or another player's private item clue.
 */

const LOCATIONS = [
  {
    id: "library",
    name: "Library",
    icon: "📚",
    items: [
      { id: "bookmark", name: "Brass bookmark" },
      { id: "magnifying-glass", name: "Magnifying glass" },
      { id: "ink-bottle", name: "Ink bottle" },
      { id: "quill", name: "Quill" },
      { id: "reading-lamp", name: "Reading lamp" },
      { id: "globe", name: "Pocket globe" },
    ],
  },
  {
    id: "garden",
    name: "Garden",
    icon: "🌿",
    items: [
      { id: "watering-can", name: "Watering can" },
      { id: "trowel", name: "Garden trowel" },
      { id: "seed-packet", name: "Seed packet" },
      { id: "garden-gloves", name: "Garden gloves" },
      { id: "rose", name: "Red rose" },
      { id: "sunhat", name: "Sun hat" },
    ],
  },
  {
    id: "castle",
    name: "Castle",
    icon: "🏰",
    items: [
      { id: "key", name: "Iron key" },
      { id: "crown", name: "Royal crown" },
      { id: "goblet", name: "Silver goblet" },
      { id: "shield", name: "Knight's shield" },
      { id: "torch", name: "Wall torch" },
      { id: "helmet", name: "Knight's helmet" },
    ],
  },
  {
    id: "museum",
    name: "Museum",
    icon: "🖼️",
    items: [
      { id: "fossil", name: "Fossil" },
      { id: "paintbrush", name: "Paintbrush" },
      { id: "ticket", name: "Museum ticket" },
      { id: "statue", name: "Miniature statue" },
      { id: "camera", name: "Old camera" },
      { id: "compass", name: "Antique compass" },
    ],
  },
  {
    id: "observatory",
    name: "Observatory",
    icon: "🔭",
    items: [
      { id: "telescope", name: "Telescope" },
      { id: "star-chart", name: "Star chart" },
      { id: "moon-globe", name: "Moon globe" },
      { id: "lantern", name: "Stargazer's lantern" },
      { id: "notebook", name: "Night-sky notebook" },
      { id: "meteorite", name: "Meteorite" },
    ],
  },
];

const HUNTS = [
  {
    locationId: "library",
    locationClue: "I keep thousands of voices in silence until someone opens the door. Where am I?",
    itemId: "bookmark",
    itemClue: "I hold your place between two pages without making a sound.",
  },
  {
    locationId: "library",
    locationClue: "A hush falls where adventures stand shoulder to shoulder on shelves.",
    itemId: "magnifying-glass",
    itemClue: "I make tiny lines look enormous without changing the page.",
  },
  {
    locationId: "library",
    locationClue: "I lend stories but never leave the building.",
    itemId: "ink-bottle",
    itemClue: "A dark pool of ink waits inside this small glass vessel.",
  },
  {
    locationId: "garden",
    locationClue: "I am a patchwork room with no roof, where bees clock in each morning.",
    itemId: "watering-can",
    itemClue: "A small metal bird pours rain from its beak over thirsty roots.",
  },
  {
    locationId: "garden",
    locationClue: "Green things stretch toward the sun while the soil keeps their secrets.",
    itemId: "trowel",
    itemClue: "I break hard ground with a pointed nose and a wooden handle.",
  },
  {
    locationId: "garden",
    locationClue: "I bloom outdoors, and every season leaves a different signature.",
    itemId: "seed-packet",
    itemClue: "A folded paper home carries tomorrow's flowers in tiny dots.",
  },
  {
    locationId: "castle",
    locationClue: "Stone walls rise high, banners mark the halls, and a ruler calls me home.",
    itemId: "key",
    itemClue: "One turn of this small metal tooth can free a locked door.",
  },
  {
    locationId: "castle",
    locationClue: "I am a fortress of towers, gates, and echoing halls.",
    itemId: "crown",
    itemClue: "A circle of gold rests on a monarch's head.",
  },
  {
    locationId: "castle",
    locationClue: "Knights once crossed my bridge, and the feast hall still waits.",
    itemId: "goblet",
    itemClue: "A stemmed cup fit for a royal toast.",
  },
  {
    locationId: "museum",
    locationClue: "I gather yesterday's wonders beneath quiet lights, but nobody takes them home.",
    itemId: "fossil",
    itemClue: "A stone record of a creature from ages ago.",
  },
  {
    locationId: "museum",
    locationClue: "Frames and cases hold stories made by human hands.",
    itemId: "paintbrush",
    itemClue: "My bristles leave a trail of color with every stroke.",
  },
  {
    locationId: "museum",
    locationClue: "Visitors wander through rooms where history is carefully arranged.",
    itemId: "ticket",
    itemClue: "A paper pass you show at the door, not an exhibit.",
  },
  {
    locationId: "observatory",
    locationClue: "I watch the night sky from a dome that opens like an eye.",
    itemId: "telescope",
    itemClue: "A long tube brings distant worlds closer.",
  },
  {
    locationId: "observatory",
    locationClue: "Above the city lights, I turn stars into a map.",
    itemId: "star-chart",
    itemClue: "Trace constellations across this printed map of the sky.",
  },
  {
    locationId: "observatory",
    locationClue: "I track moons, planets, and far-off lights in the dark.",
    itemId: "moon-globe",
    itemClue: "A round model of Earth's pale neighbor, marked with craters.",
  },
];

const SCORE_MODES = ["winner", "speed", "coop"];
const END_MODES = ["target", "hunts", "timer"];
const SYSTEM_PLAYER = "__system__";

export const meta = {
  game: "Riddle Rally",
  minPlayers: 2,
  maxPlayers: 8,
};

function locationById(id) {
  return LOCATIONS.find((location) => location.id === id) ?? null;
}

function playerEntry(state, playerId) {
  return state.players.find((player) => player.id === playerId) ?? null;
}

function seedFromPlayers(players) {
  let seed = 2166136261;
  for (const character of players.join("|")) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return seed || 1;
}

function shuffledDeck(seed) {
  const deck = HUNTS.map((_, index) => index);
  let next = seed;
  for (let index = deck.length - 1; index > 0; index -= 1) {
    next = (Math.imul(next, 1664525) + 1013904223) >>> 0;
    const swapIndex = next % (index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function withFeedback(state, playerId, kind, delta = 0) {
  const sequence = state.eventSequence + 1;
  const feedback = state.feedback.filter((event) => event.playerId !== playerId);
  feedback.push({ playerId, sequence, kind, delta });
  return { ...state, eventSequence: sequence, feedback };
}

function changePlayerScore(state, playerId, delta, found = false) {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, score: player.score + delta, finds: player.finds + (found ? 1 : 0) }
        : player,
    ),
  };
}

function applyPenalty(state, playerId, kind) {
  if (state.settings.scoring === "coop") {
    return withFeedback({ ...state, teamScore: state.teamScore - 1 }, playerId, kind, -1);
  }
  return withFeedback(changePlayerScore(state, playerId, -1), playerId, kind, -1);
}

function beginHunt(state) {
  const deckIndex = state.deck[state.deckCursor % state.deck.length];
  return {
    ...state,
    phase: "hunt",
    huntNumber: state.huntsCompleted + 1,
    deckCursor: state.deckCursor + 1,
    currentHunt: HUNTS[deckIndex],
    secondsLeft: 60,
    windowSecondsLeft: 0,
    revealSecondsLeft: 0,
    foundLocations: [],
    correctPlayers: [],
    firstFinder: null,
    lastHuntResult: null,
  };
}

function roundConditionReached(state) {
  if (state.settings.endMode === "hunts") {
    return state.huntsCompleted >= state.settings.huntLimit;
  }
  if (state.settings.endMode === "target") {
    if (state.settings.scoring === "coop") {
      return state.teamScore >= state.settings.targetScore;
    }
    return state.players.some((player) => player.score >= state.settings.targetScore);
  }
  return false;
}

function findWinner(state) {
  if (state.settings.scoring === "coop") return "team";
  let highest = -Infinity;
  let winner = null;
  let tied = false;
  for (const player of state.players) {
    if (player.score > highest) {
      highest = player.score;
      winner = player.id;
      tied = false;
    } else if (player.score === highest) {
      tied = true;
    }
  }
  return tied ? null : winner;
}

function finishMatch(state, reason) {
  return {
    ...state,
    phase: "over",
    revealSecondsLeft: 0,
    winnerId: findWinner(state),
    endReason: reason,
  };
}

function finishHunt(state, reason) {
  return {
    ...state,
    phase: "reveal",
    huntsCompleted: state.huntsCompleted + 1,
    secondsLeft: 0,
    windowSecondsLeft: 0,
    revealSecondsLeft: 4,
    lastHuntResult: {
      reason,
      firstFinder: state.firstFinder,
      solved: state.correctPlayers.length > 0,
    },
  };
}

function tickMatchClock(state) {
  if (state.settings.endMode !== "timer") return { state, expired: false };
  const matchSecondsLeft = Math.max(0, state.matchSecondsLeft - 1);
  const next = { ...state, matchSecondsLeft };
  return { state: next, expired: matchSecondsLeft === 0 };
}

function advanceClock(state) {
  if (state.phase !== "hunt" && state.phase !== "scoring" && state.phase !== "reveal") {
    return state;
  }

  const clock = tickMatchClock(state);
  if (clock.expired) return finishMatch(clock.state, "timer");

  if (state.phase === "hunt") {
    const secondsLeft = Math.max(0, state.secondsLeft - 1);
    const next = { ...clock.state, secondsLeft };
    return secondsLeft === 0 ? finishHunt(next, "time") : next;
  }

  if (state.phase === "scoring") {
    const windowSecondsLeft = Math.max(0, state.windowSecondsLeft - 1);
    const next = { ...clock.state, windowSecondsLeft };
    return windowSecondsLeft === 0 ? finishHunt(next, "solved") : next;
  }

  const revealSecondsLeft = Math.max(0, state.revealSecondsLeft - 1);
  const next = { ...clock.state, revealSecondsLeft };
  if (revealSecondsLeft > 0) return next;
  if (roundConditionReached(next)) {
    const reason = next.settings.endMode === "hunts" ? "hunts" : "target";
    return finishMatch(next, reason);
  }
  return beginHunt(next);
}

export function setup(players) {
  const deck = shuffledDeck(seedFromPlayers(players));
  return {
    phase: "lobby",
    hostId: players[0],
    players: players.map((id, index) => ({
      id,
      name: `Explorer ${index + 1}`,
      score: 0,
      finds: 0,
    })),
    settings: {
      scoring: "winner",
      endMode: "target",
      targetScore: 15,
      huntLimit: 8,
      minutes: 5,
    },
    teamScore: 0,
    deck,
    deckCursor: 0,
    huntNumber: 0,
    huntsCompleted: 0,
    currentHunt: null,
    secondsLeft: 60,
    windowSecondsLeft: 0,
    revealSecondsLeft: 0,
    foundLocations: [],
    correctPlayers: [],
    firstFinder: null,
    feedback: [],
    eventSequence: 0,
    lastHuntResult: null,
    winnerId: null,
    endReason: null,
    matchSecondsLeft: 0,
  };
}

export function validateAction(state, playerId, action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return { ok: false, error: "choose a valid action" };
  }
  if (action.type === "tick" || action.type === "player-joined") {
    return { ok: false, error: "invalid action" };
  }
  if (!playerEntry(state, playerId)) return { ok: false, error: "you are not seated" };

  if (action.type === "rename") {
    if (state.phase !== "lobby") return { ok: false, error: "names can only change in the lobby" };
    if (typeof action.name !== "string" || !action.name.trim() || action.name.trim().length > 18) {
      return { ok: false, error: "name must be 1–18 characters" };
    }
    return { ok: true };
  }

  if (["configure-scoring", "configure-ending", "start"].includes(action.type)) {
    if (state.phase !== "lobby") return { ok: false, error: "settings are locked after the hunt starts" };
    if (state.hostId !== playerId) return { ok: false, error: "only the host can change lobby settings" };
    if (action.type === "configure-scoring" && !SCORE_MODES.includes(action.mode)) {
      return { ok: false, error: "choose one of the scoring models" };
    }
    if (action.type === "configure-ending") {
      if (!END_MODES.includes(action.mode)) return { ok: false, error: "choose a match ending" };
      const ranges = { target: [5, 60], hunts: [3, 20], timer: [1, 15] };
      const [minimum, maximum] = ranges[action.mode];
      if (!Number.isInteger(action.value) || action.value < minimum || action.value > maximum) {
        return { ok: false, error: `choose a value from ${minimum} to ${maximum}` };
      }
    }
    if (action.type === "start" && state.players.length < 2) {
      return { ok: false, error: "invite at least one more player before starting" };
    }
    return { ok: true };
  }

  if (action.type === "choose-location" || action.type === "choose-item") {
    if (state.phase !== "hunt" && state.phase !== "scoring") {
      return { ok: false, error: "this hunt is closed" };
    }
    if (state.correctPlayers.includes(playerId)) {
      return { ok: false, error: "you already found the item this hunt" };
    }
    if (action.type === "choose-location") {
      if (state.foundLocations.includes(playerId)) {
        return { ok: false, error: "your location is already open" };
      }
      if (typeof action.locationId !== "string" || !locationById(action.locationId)) {
        return { ok: false, error: "choose a location from the list" };
      }
      return { ok: true };
    }
    if (!state.foundLocations.includes(playerId)) {
      return { ok: false, error: "find the right location first" };
    }
    const location = locationById(state.currentHunt.locationId);
    if (typeof action.itemId !== "string" || !location.items.some((item) => item.id === action.itemId)) {
      return { ok: false, error: "choose an item from the open location" };
    }
    return { ok: true };
  }

  return { ok: false, error: "that action is not available" };
}

export function applyAction(state, playerId, action) {
  if (action?.type === "tick" && playerId === SYSTEM_PLAYER) return advanceClock(state);

  if (action?.type === "player-joined") {
    if (state.phase !== "lobby" || playerEntry(state, playerId)) return state;
    return {
      ...state,
      players: [...state.players, { id: playerId, name: `Explorer ${state.players.length + 1}`, score: 0, finds: 0 }],
    };
  }

  if (action.type === "rename") {
    const name = action.name.trim().slice(0, 18);
    return {
      ...state,
      players: state.players.map((player) => player.id === playerId ? { ...player, name } : player),
    };
  }

  if (action.type === "configure-scoring") {
    return { ...state, settings: { ...state.settings, scoring: action.mode } };
  }

  if (action.type === "configure-ending") {
    const fields = { target: "targetScore", hunts: "huntLimit", timer: "minutes" };
    return {
      ...state,
      settings: { ...state.settings, endMode: action.mode, [fields[action.mode]]: action.value },
    };
  }

  if (action.type === "start") {
    const prepared = {
      ...state,
      matchSecondsLeft: state.settings.endMode === "timer" ? state.settings.minutes * 60 : 0,
      huntsCompleted: 0,
      deckCursor: 0,
      winnerId: null,
      endReason: null,
      teamScore: 0,
      players: state.players.map((player) => ({ ...player, score: 0, finds: 0 })),
    };
    return beginHunt(prepared);
  }

  if (action.type === "choose-location") {
    if (action.locationId !== state.currentHunt.locationId) {
      return applyPenalty(state, playerId, "wrong-location");
    }
    const foundLocations = [...state.foundLocations, playerId];
    return withFeedback({ ...state, foundLocations }, playerId, "right-location");
  }

  if (action.type === "choose-item") {
    if (action.itemId !== state.currentHunt.itemId) {
      return applyPenalty(state, playerId, "wrong-item");
    }

    const first = state.correctPlayers.length === 0;
    const windowSecondsLeft = first ? 15 : state.windowSecondsLeft;
    const scoring = state.settings.scoring;
    let next = {
      ...state,
      phase: first ? "scoring" : state.phase,
      windowSecondsLeft,
      firstFinder: first ? playerId : state.firstFinder,
      correctPlayers: [...state.correctPlayers, playerId],
    };

    if (scoring === "coop") {
      next = { ...next, teamScore: next.teamScore + 1 };
      return withFeedback(next, playerId, "right-item", 1);
    }

    const points = scoring === "winner"
      ? (first ? 5 : 1)
      : 1 + Math.floor(windowSecondsLeft / 5);
    next = changePlayerScore(next, playerId, points, true);
    return withFeedback(next, playerId, first ? "first-item" : "right-item", points);
  }

  return state;
}

export function isGameOver(state) {
  if (state.phase !== "over") return { over: false };
  return {
    over: true,
    winner: state.winnerId,
    draw: state.settings.scoring !== "coop" && state.winnerId === null,
    reason: state.endReason,
    teamScore: state.teamScore,
    scores: state.players.map((player) => ({ id: player.id, name: player.name, score: player.score })),
  };
}

export function viewFor(state, playerId) {
  const mine = playerEntry(state, playerId);
  const revealed = state.phase === "reveal" || state.phase === "over";
  const clueUnlocked = state.foundLocations.includes(playerId) && !revealed;
  const location = state.currentHunt ? locationById(state.currentHunt.locationId) : null;
  const feedback = state.feedback.find((event) => event.playerId === playerId) ?? null;

  return {
    phase: state.phase,
    hostId: state.hostId,
    isHost: state.hostId === playerId,
    isSeated: Boolean(mine),
    settings: { ...state.settings },
    players: state.players.map((player) => ({ ...player })),
    teamScore: state.teamScore,
    huntNumber: state.huntNumber,
    huntsCompleted: state.huntsCompleted,
    secondsLeft: state.secondsLeft,
    windowSecondsLeft: state.windowSecondsLeft,
    revealSecondsLeft: state.revealSecondsLeft,
    matchSecondsLeft: state.settings.endMode === "timer" ? state.matchSecondsLeft : null,
    locationClue: state.currentHunt?.locationClue ?? null,
    locationOptions: LOCATIONS.map(({ id, name, icon }) => ({ id, name, icon })),
    foundLocations: [...state.foundLocations],
    correctPlayers: [...state.correctPlayers],
    itemClue: clueUnlocked ? state.currentHunt.itemClue : null,
    itemOptions: clueUnlocked ? location.items.map((item) => ({ ...item })) : [],
    answer: revealed && state.currentHunt ? {
      locationId: state.currentHunt.locationId,
      location: location.name,
      itemId: state.currentHunt.itemId,
      item: location.items.find((item) => item.id === state.currentHunt.itemId)?.name ?? state.currentHunt.itemId,
    } : null,
    lastHuntResult: revealed ? state.lastHuntResult : null,
    feedback,
    winnerId: state.phase === "over" ? state.winnerId : null,
    endReason: state.phase === "over" ? state.endReason : null,
    targetReached: roundConditionReached(state),
  };
}
