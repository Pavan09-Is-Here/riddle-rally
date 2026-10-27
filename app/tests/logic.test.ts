import { describe, expect, it } from "vitest";

import { applyAction, isGameOver, meta, setup as setupRaw, validateAction, viewFor as viewForRaw } from "../src/logic.js";

const SYSTEM = "__system__";
const setup: (players: string[]) => any = setupRaw as any;
const viewFor: (state: any, playerId: string) => any = viewForRaw as any;

function action(state: any, player: string, payload: any): any {
  expect(validateAction(state, player, payload).ok).toBe(true);
  return applyAction(state, player, payload) as any;
}

function start(players = ["alice", "bob"]) {
  const lobby = setup(players);
  return action(lobby, players[0]!, { type: "start" });
}

describe("Riddle Rally setup", () => {
  it("supports two to eight players and makes the first player host", () => {
    expect(meta).toMatchObject({ game: "Riddle Rally", minPlayers: 2, maxPlayers: 8 });
    const state = setup(["alice", "bob"]);
    expect(state.phase).toBe("lobby");
    expect(state.hostId).toBe("alice");
    expect(state.players.map((player: any) => player.id)).toEqual(["alice", "bob"]);
    expect(viewFor(state, "alice").settings.scoring).toBe("winner");
  });

  it("lets only the host adjust scoring and ending rules before the match", () => {
    const state = setup(["alice", "bob"]);
    expect(validateAction(state, "bob", { type: "configure-scoring", mode: "speed" }).ok).toBe(false);
    const scored = action(state, "alice", { type: "configure-scoring", mode: "coop" });
    const ended = action(scored, "alice", { type: "configure-ending", mode: "hunts", value: 5 });
    expect(ended.settings).toMatchObject({ scoring: "coop", endMode: "hunts", huntLimit: 5 });
    expect(validateAction(ended, "alice", { type: "configure-ending", mode: "timer", value: 0 }).ok).toBe(false);
  });
});

describe("the private two-clue hunt", () => {
  it("keeps the item clue and target hidden until the player finds the location", () => {
    const state = start();
    const target = state.currentHunt;
    const before = viewFor(state, "alice");
    expect(before.locationClue).toBe(target.locationClue);
    expect(before.itemClue).toBeNull();
    expect(before.answer).toBeNull();
    expect(JSON.stringify(before)).not.toContain(target.itemId);

    const opened = action(state, "alice", { type: "choose-location", locationId: target.locationId });
    expect(viewFor(opened, "alice").itemClue).toBe(target.itemClue);
    expect(viewFor(opened, "alice").itemOptions.length).toBeGreaterThan(0);
    expect(viewFor(opened, "bob").itemClue).toBeNull();
    expect(viewFor(opened, "bob").answer).toBeNull();
  });

  it("penalizes wrong location and item picks", () => {
    let state = start();
    const target = state.currentHunt;
    const wrongLocation = viewFor(state, "alice").locationOptions.find((place: any) => place.id !== target.locationId);
    state = action(state, "alice", { type: "choose-location", locationId: wrongLocation.id });
    expect(viewFor(state, "alice").players.find((player: any) => player.id === "alice")?.score).toBe(-1);

    state = action(state, "alice", { type: "choose-location", locationId: target.locationId });
    const wrongItem = state.currentHunt && viewFor(state, "alice").itemOptions.find((item: any) => item.id !== target.itemId);
    state = action(state, "alice", { type: "choose-item", itemId: wrongItem.id });
    expect(viewFor(state, "alice").players.find((player: any) => player.id === "alice")?.score).toBe(-2);
  });

  it("opens the fixed 15-second scoring window after the first correct find", () => {
    let state = start();
    const target = state.currentHunt;
    state = action(state, "alice", { type: "choose-location", locationId: target.locationId });
    state = action(state, "alice", { type: "choose-item", itemId: target.itemId });
    expect(state.phase).toBe("scoring");
    expect(state.windowSecondsLeft).toBe(15);
    expect(viewFor(state, "alice").players.find((player: any) => player.id === "alice")?.score).toBe(5);
  });

  it("awards speed points to later solvers during the same window", () => {
    let state = setup(["alice", "bob"]);
    state = action(state, "alice", { type: "configure-scoring", mode: "speed" });
    state = action(state, "alice", { type: "start" });
    const target = state.currentHunt;
    state = action(state, "alice", { type: "choose-location", locationId: target.locationId });
    state = action(state, "alice", { type: "choose-item", itemId: target.itemId });
    expect(viewFor(state, "alice").players.find((player: any) => player.id === "alice")?.score).toBe(4);

    for (let i = 0; i < 5; i += 1) state = applyAction(state, SYSTEM, { type: "tick" });
    state = action(state, "bob", { type: "choose-location", locationId: target.locationId });
    state = action(state, "bob", { type: "choose-item", itemId: target.itemId });
    expect(state.phase).toBe("scoring");
    expect(state.windowSecondsLeft).toBe(10);
    expect(viewFor(state, "bob").players.find((player: any) => player.id === "bob")?.score).toBe(3);
  });

  it("uses one shared team point for correct and wrong picks in co-op", () => {
    let state = setup(["alice", "bob"]);
    state = action(state, "alice", { type: "configure-scoring", mode: "coop" });
    state = action(state, "alice", { type: "start" });
    const target = state.currentHunt;
    const wrongLocation = viewFor(state, "bob").locationOptions.find((place: any) => place.id !== target.locationId);
    state = action(state, "bob", { type: "choose-location", locationId: wrongLocation.id });
    expect(state.teamScore).toBe(-1);
    state = action(state, "bob", { type: "choose-location", locationId: target.locationId });
    state = action(state, "bob", { type: "choose-item", itemId: target.itemId });
    expect(state.teamScore).toBe(0);
    expect(state.players.every((player: any) => player.score === 0)).toBe(true);
  });
});

describe("match clock and win conditions", () => {
  it("ends a timed match after its selected duration", () => {
    let state = setup(["alice", "bob"]);
    state = action(state, "alice", { type: "configure-ending", mode: "timer", value: 1 });
    state = action(state, "alice", { type: "start" });
    expect(state.matchSecondsLeft).toBe(60);
    for (let i = 0; i < 60; i += 1) state = applyAction(state, SYSTEM, { type: "tick" });
    expect(state.phase).toBe("over");
    expect(isGameOver(state)).toMatchObject({ over: true, reason: "timer" });
  });

  it("finishes after the selected number of hunts", () => {
    let state = setup(["alice", "bob"]);
    state = action(state, "alice", { type: "configure-ending", mode: "hunts", value: 3 });
    state = action(state, "alice", { type: "start" });
    for (let hunt = 0; hunt < 3; hunt += 1) {
      for (let second = 0; second < 60; second += 1) state = applyAction(state, SYSTEM, { type: "tick" });
      expect(state.phase).toBe("reveal");
      for (let second = 0; second < 4; second += 1) state = applyAction(state, SYSTEM, { type: "tick" });
    }
    expect(state.phase).toBe("over");
    expect(isGameOver(state)).toMatchObject({ over: true, reason: "hunts", draw: true });
  });

  it("rejects timer ticks sent by a player", () => {
    const state = start();
    expect(validateAction(state, "alice", { type: "tick" })).toMatchObject({ ok: false });
    expect(state.secondsLeft).toBe(60);
  });
});
