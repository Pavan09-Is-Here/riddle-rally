/**
 * Riddle Rally's room behavior, exercised through the real WebSocket protocol.
 */
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

async function open(room: string = "main") {
  const response = await SELF.fetch("https://game.test/ws/" + room, {
    headers: { Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  if (!ws) throw new Error("no WebSocket on the upgrade response");
  ws.accept();

  const frames: unknown[] = [];
  ws.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : "";
    if (data === "__pong") return;
    try {
      frames.push(JSON.parse(data));
    } catch {
      frames.push(data);
    }
  });

  const next = async (predicate: (frame: any) => boolean, label: string): Promise<any> => {
    for (let i = 0; i < 100; i += 1) {
      const found = frames.find(predicate);
      if (found) return found;
      await scheduler.wait(10);
    }
    throw new Error("timed out waiting for " + label + "; received " + JSON.stringify(frames));
  };

  return {
    ws,
    frames,
    next,
    send: (message: unknown) => ws.send(JSON.stringify(message)),
    state: () => next((frame) => frame?.type === "state", "a state frame"),
    error: () => next((frame) => frame?.type === "error", "an error frame"),
  };
}

let sequence = 0;
function uniqueRoom(label: string): string {
  sequence += 1;
  return label + "-" + sequence + "-" + crypto.randomUUID().slice(0, 6);
}

async function joinTwo(room: string) {
  const host = await open(room);
  const guest = await open(room);
  host.send({ type: "join", playerId: "alice" });
  const waiting = await host.state();
  expect(waiting.status).toBe("waiting");
  guest.send({ type: "join", playerId: "bob" });
  const hostLobby = await host.next((frame) => frame?.type === "state" && frame.view?.phase === "lobby", "the lobby");
  const guestLobby = await guest.next((frame) => frame?.type === "state" && frame.view?.phase === "lobby", "the guest lobby");
  host.frames.length = 0;
  guest.frames.length = 0;
  return { host, guest, hostLobby, guestLobby };
}

describe("routing and joining", () => {
  it("rejects a non-upgrade request", async () => {
    const response = await SELF.fetch("https://game.test/ws/" + uniqueRoom("no-upgrade"));
    expect(response.status).toBe(426);
  });

  it("waits for two players, then opens a configurable lobby", async () => {
    const room = uniqueRoom("lobby");
    const host = await open(room);
    host.send({ type: "join", playerId: "alice" });
    const waiting = await host.state();
    expect(waiting.status).toBe("waiting");
    expect(waiting.seats).toEqual(["alice"]);
    expect(waiting.view).toBeNull();

    const guest = await open(room);
    guest.send({ type: "join", playerId: "bob" });
    const lobby = await guest.next((frame) => frame?.type === "state" && frame.view?.phase === "lobby", "the lobby");
    expect(lobby.meta.game).toBe("Riddle Rally");
    expect(lobby.seats).toEqual(["alice", "bob"]);
    expect(lobby.view.settings.scoring).toBe("winner");
    host.ws.close();
    guest.ws.close();
  });

  it("adds players who arrive before the host starts", async () => {
    const room = uniqueRoom("late-lobby");
    const { host, guest } = await joinTwo(room);
    const third = await open(room);
    third.send({ type: "join", playerId: "chris" });
    const updated = await host.next((frame) => frame?.type === "state" && frame.view?.players?.length === 3, "the third lobby seat");
    expect(updated.seats).toEqual(["alice", "bob", "chris"]);
    expect(updated.view.players.map((player: any) => player.id)).toEqual(["alice", "bob", "chris"]);
    host.ws.close();
    guest.ws.close();
    third.ws.close();
  });
});

describe("hunt privacy and control", () => {
  it("gives each player a private item clue after their correct location pick", async () => {
    const room = uniqueRoom("private-clue");
    const { host, guest } = await joinTwo(room);
    host.send({ type: "action", action: { type: "start" } });
    const started = await host.next((frame) => frame?.type === "state" && frame.view?.phase === "hunt", "the first hunt");
    await guest.next((frame) => frame?.type === "state" && frame.view?.phase === "hunt", "the guest hunt");

    let hostView = started;
    let foundPrivateClue = false;
    for (const place of started.view.locationOptions) {
      host.frames.length = 0;
      guest.frames.length = 0;
      host.send({ type: "action", action: { type: "choose-location", locationId: place.id } });
      hostView = await host.next((frame) => frame?.type === "state" && frame.view?.phase === "hunt", "a location result");
      const guestView = await guest.next((frame) => frame?.type === "state" && frame.view?.phase === "hunt", "the guest's location result");
      if (hostView.view.itemClue) {
        expect(guestView.view.itemClue).toBeNull();
        expect(guestView.view.answer).toBeNull();
        foundPrivateClue = true;
        break;
      }
    }
    expect(foundPrivateClue).toBe(true);
    host.ws.close();
    guest.ws.close();
  });

  it("keeps lobby settings and rematches under host control", async () => {
    const room = uniqueRoom("host-control");
    const { host, guest } = await joinTwo(room);
    guest.send({ type: "action", action: { type: "configure-scoring", mode: "coop" } });
    expect((await guest.error()).error).toMatch(/host/);

    host.send({ type: "action", action: { type: "start" } });
    await host.next((frame) => frame?.type === "state" && frame.view?.phase === "hunt", "the hunt to start");
    guest.send({ type: "reset" });
    expect((await guest.error()).error).toMatch(/host/);
    host.ws.close();
    guest.ws.close();
  });

  it("keeps a ninth visitor as a spectator", async () => {
    const room = uniqueRoom("spectator");
    const players = [];
    for (let index = 0; index < 8; index += 1) {
      const socket = await open(room);
      players.push(socket);
      socket.send({ type: "join", playerId: "player-" + index });
      if (index === 0) {
        await socket.state();
      } else {
        await players[0]!.next((frame) => frame?.type === "state" && frame.seats?.length === index + 1, "seat " + index);
      }
    }
    const watcher = await open(room);
    watcher.send({ type: "join", playerId: "watcher" });
    const state = await watcher.state();
    expect(state.seats).toHaveLength(8);
    expect(state.view.isSeated).toBe(false);
    watcher.send({ type: "action", action: { type: "start" } });
    expect((await watcher.error()).error).toBe("spectators cannot act");
    players.forEach((socket) => socket.ws.close());
    watcher.ws.close();
  });
});

describe("room persistence and protocol", () => {
  it("keeps seats and lobby state across a reconnect", async () => {
    const room = uniqueRoom("reconnect");
    const { host, guest } = await joinTwo(room);
    host.ws.close();

    const again = await open(room);
    again.send({ type: "join", playerId: "alice" });
    const restored = await again.state();
    expect(restored.status).toBe("playing");
    expect(restored.seats).toEqual(["alice", "bob"]);
    expect(restored.view.phase).toBe("lobby");
    again.ws.close();
    guest.ws.close();
  });

  it("refuses malformed frames and actions before joining", async () => {
    const room = uniqueRoom("bad-frame");
    const socket = await open(room);
    socket.send({ type: "action", action: { type: "start" } });
    expect((await socket.error()).error).toBe("join first");
    socket.frames.length = 0;
    socket.ws.send("not json");
    expect((await socket.error()).error).toBe("invalid json");
    socket.ws.close();
  });

  it("keeps two room codes independent", async () => {
    const firstRoom = uniqueRoom("isolation-a");
    const secondRoom = uniqueRoom("isolation-b");
    const first = await open(firstRoom);
    const second = await open(secondRoom);
    first.send({ type: "join", playerId: "alice" });
    second.send({ type: "join", playerId: "bob" });
    const a = await first.state();
    const b = await second.state();
    expect(a.seats).toEqual(["alice"]);
    expect(b.seats).toEqual(["bob"]);
    first.ws.close();
    second.ws.close();
  });
});
