import { randomUUID, randomInt } from "node:crypto";
import {
  act,
  startHand,
  publicHand,
  assertConservation,
  type Player,
  type Hand,
  type Variant,
  type Action,
} from "./engine.js";
export interface Table {
  id: string;
  players: string[];
  button: number;
  hand: Hand | null;
  ghostPot: number;
  deadline: number;
}
export interface Tournament {
  id: string;
  code: string;
  owner: string;
  name: string;
  status: "lobby" | "playing" | "finished";
  variant: Variant;
  maxPlayers: number;
  startingStack: number;
  initialBB: number;
  levelSeconds: number;
  decisionSeconds: number;
  startedAt: number;
  version: number;
  players: Player[];
  tables: Table[];
  results: { id: string; name: string; rank: number }[];
  seen: string[];
  events: { at: number; text: string }[];
  handNo: number;
  roundReadyAt: number;
}
export function distribution(n: number): number[] {
  if (!n) return [];
  const count = Math.ceil(n / 8);
  return Array.from(
    { length: count },
    (_, i) => Math.floor(n / count) + (i < n % count ? 1 : 0),
  );
}
export function createTournament(
  owner: string,
  name: string,
  settings: Partial<Tournament> = {},
): Tournament {
  return {
    id: randomUUID(),
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    owner,
    name,
    status: "lobby",
    variant: settings.variant ?? "classic",
    maxPlayers: settings.maxPlayers ?? 16,
    startingStack: settings.startingStack ?? 2000,
    initialBB: settings.initialBB ?? 50,
    levelSeconds: settings.levelSeconds ?? 180,
    decisionSeconds: settings.decisionSeconds ?? 20,
    startedAt: 0,
    version: 0,
    players: [],
    tables: [],
    results: [],
    seen: [],
    events: [],
    handNo: 0,
    roundReadyAt: 0,
  };
}
export function join(t: Tournament, id: string, name: string, bot = false) {
  if (t.players.some((p) => p.id === id)) return;
  if (t.status !== "lobby" || t.players.length >= t.maxPlayers)
    throw Error("Les inscriptions sont fermées.");
  t.players.push({ id, name, bot, stack: t.startingStack, seat: 0 });
  t.version++;
}
export function note(t: Tournament, text: string, now = Date.now()) {
  t.events.push({ at: now, text });
  if (t.events.length > 200) t.events.shift();
}
export function rebalance(t: Tournament) {
  if (t.tables.some((tb) => tb.hand && tb.hand.stage !== "done"))
    throw Error("Cannot move during a hand");
  const previousBig = new Set<string>();
  const original = new Map<string, string>();
  for (const tb of t.tables) {
    for (const id of tb.players) original.set(id, tb.id);
    const h = tb.hand;
    if (h) {
      const after = [...h.players].sort(
        (a, b) =>
          ((a.seat - h.button + 8) % 8 || 8) -
          ((b.seat - h.button + 8) % 8 || 8),
      );
      previousBig.add(after[h.players.length === 2 ? 0 : 1].id);
    }
  }
  const live = t.players.filter((p) => p.stack > 0);
  const sizes = distribution(live.length);
  for (const tb of t.tables)
    tb.players = tb.players.filter((id) => live.some((p) => p.id === id));
  const pool: string[] = [];
  while (t.tables.length > sizes.length) {
    const removed = t.tables.pop()!;
    pool.push(...removed.players);
    if (t.tables[0]) t.tables[0].ghostPot += removed.ghostPot;
  }
  while (t.tables.length < sizes.length)
    t.tables.push({
      id: randomUUID(),
      players: [],
      button: -1,
      hand: null,
      ghostPot: 0,
      deadline: 0,
    });
  for (const p of live)
    if (
      !t.tables.some((tb) => tb.players.includes(p.id)) &&
      !pool.includes(p.id)
    )
      pool.push(p.id);
  t.tables.forEach((tb, i) => {
    while (tb.players.length > sizes[i]) {
      // Prefer a player not just in the big blind.
      const old = tb.hand;
      const ordered = old
        ? [...old.players].sort((a, b) => a.seat - b.seat)
        : [];
      const after = ordered
        .filter((p) => p.seat > tb.button)
        .concat(ordered.filter((p) => p.seat <= tb.button));
      const big = after[old?.players.length === 2 ? 0 : 1]?.id;
      const move = tb.players.find((id) => id !== big) ?? tb.players[0];
      tb.players.splice(tb.players.indexOf(move), 1);
      pool.push(move);
    }
  });
  t.tables.forEach((tb, i) => {
    while (tb.players.length < sizes[i]) {
      const id = pool.shift()!;
      const occupied = tb.players.map(
        (id) => t.players.find((p) => p.id === id)!.seat,
      );
      const p = t.players.find((p) => p.id === id)!;
      p.seat = Array.from({ length: 8 }, (_, s) => s).find(
        (s) => !occupied.includes(s),
      )!;
      tb.players.push(id);
      note(t, `${p.name} rejoint la table ${i + 1}`);
    }
  });
  // House transfer rule: a transferred last-hand BB cannot become the next BB.
  // Swap destination seats before the next deal; no hand is in progress.
  for (const tb of t.tables) {
    const seated = tb.players
      .map((id) => t.players.find((p) => p.id === id)!)
      .sort((a, b) => a.seat - b.seat);
    if (seated.length < 2) continue;
    const button = seated.find((p) => p.seat > tb.button) ?? seated[0];
    const after = [...seated].sort(
      (a, b) =>
        ((a.seat - button.seat + 8) % 8 || 8) -
        ((b.seat - button.seat + 8) % 8 || 8),
    );
    const big = after[seated.length === 2 ? 0 : 1];
    if (
      original.has(big.id) &&
      original.get(big.id) !== tb.id &&
      previousBig.has(big.id)
    ) {
      const other = seated.find((p) => !previousBig.has(p.id));
      if (other) [big.seat, other.seat] = [other.seat, big.seat];
    }
  }
}
function beginRound(t: Tournament, now: number) {
  rebalance(t);
  t.handNo++;
  const level = Math.min(
    12,
    Math.floor((now - t.startedAt) / 1000 / t.levelSeconds),
  );
  const bb = t.initialBB * 2 ** level;
  for (const tb of t.tables) {
    const players = tb.players.map((id) => t.players.find((p) => p.id === id)!);
    const seats = players.map((p) => p.seat).sort((a, b) => a - b);
    tb.button = seats.find((s) => s > tb.button) ?? seats[0];
    tb.hand = startHand(
      players,
      tb.button,
      bb,
      t.handNo,
      t.variant,
      tb.ghostPot,
    );
    tb.ghostPot = 0;
    tb.deadline = now + t.decisionSeconds * 1000;
  }
  t.roundReadyAt = 0;
  t.version++;
}
export function start(t: Tournament, id: string, now = Date.now()) {
  if (t.owner !== id || t.status !== "lobby" || t.players.length < 2)
    throw Error("Au moins deux joueurs et l’organisateur sont nécessaires.");
  t.status = "playing";
  t.startedAt = now;
  beginRound(t, now);
}
export function action(
  t: Tournament,
  id: string,
  a: Action,
  version: number,
  actionId: string,
  now = Date.now(),
) {
  const key = `${id}:${actionId}`;
  if (t.seen.includes(key)) return;
  if (t.status !== "playing" || version !== t.version)
    throw Error("État modifié : synchronisation nécessaire.");
  const tb = t.tables.find((tb) => tb.players.includes(id));
  if (!tb?.hand) throw Error("Table introuvable.");
  act(tb.hand, id, a);
  tb.deadline = now + t.decisionSeconds * 1000;
  t.seen.push(key);
  if (t.seen.length > 2000) t.seen.shift();
  t.version++;
}
export function tick(t: Tournament, now = Date.now()): boolean {
  if (t.status !== "playing") return false;
  let changed = false;
  for (const tb of t.tables) {
    const h = tb.hand!;
    if (h.stage === "done") continue;
    const p = h.players.find((p) => p.id === h.turn)!;
    if (
      (p.bot && now >= tb.deadline - (t.decisionSeconds - 1) * 1000) ||
      now >= tb.deadline
    ) {
      const owed = Math.max(0, h.currentBet - p.bet);
      let a: Action = { type: owed ? "fold" : "check" };
      if (p.bot) {
        const roll = randomInt(100);
        a = owed
          ? roll < 72
            ? { type: "call" }
            : { type: "fold" }
          : { type: "check" };
        if (
          roll > 85 &&
          h.currentBet >= p.reopenAt &&
          p.stack > owed &&
          h.players.filter((p) => !p.folded && p.stack > 0).length > 1
        )
          a = {
            type: "raise",
            amount: Math.min(p.bet + p.stack, h.currentBet + h.minRaise),
          };
      }
      act(h, p.id, a);
      tb.deadline = now + t.decisionSeconds * 1000;
      changed = true;
    }
  }
  if (t.tables.every((tb) => tb.hand!.stage === "done")) {
    if (!t.roundReadyAt) {
      t.roundReadyAt = now + 4000;
      changed = true;
    } else if (now >= t.roundReadyAt) {
      const previous = new Map(t.players.map((p) => [p.id, p.stack]));
      for (const tb of t.tables) {
        tb.ghostPot = tb.hand!.ghostPot;
        for (const p of tb.hand!.players)
          t.players.find((q) => q.id === p.id)!.stack = p.stack;
      }
      let live = t.players.filter((p) => p.stack > 0);
      // If the ghost owns every chip, close without inventing a new hand or losing chips.
      if (live.length <= 1) {
        const ghost = t.tables.reduce((sum, tb) => sum + tb.ghostPot, 0);
        const recipient =
          live[0] ??
          [...t.players]
            .filter((p) => previous.get(p.id)! > 0)
            .sort(
              (a, b) =>
                previous.get(b.id)! - previous.get(a.id)! ||
                a.id.localeCompare(b.id),
            )[0];
        recipient.stack += ghost;
        t.tables.forEach((tb) => (tb.ghostPot = 0));
        live = [recipient];
      }
      const gone = t.players
        .filter((p) => p.stack === 0 && !t.results.some((r) => r.id === p.id))
        .sort(
          (a, b) =>
            previous.get(a.id)! - previous.get(b.id)! ||
            a.id.localeCompare(b.id),
        );
      for (const p of gone)
        t.results.push({
          id: p.id,
          name: p.name,
          rank: t.players.length - t.results.length,
        });
      if (live.length === 1) {
        const p = live[0];
        t.results.push({ id: p.id, name: p.name, rank: 1 });
        t.status = "finished";
        note(t, `${p.name} remporte le tournoi`, now);
      } else {
        if (live.length <= 8 && t.tables.length > 1)
          note(t, "FINAL TABLE", now);
        beginRound(t, now);
      }
      changed = true;
    }
  }
  if (changed) t.version++;
  return changed;
}
export function assertTournament(t: Tournament) {
  if (t.status === "lobby") return;
  if (t.status === "finished") {
    if (
      t.players.reduce((s, p) => s + p.stack, 0) !==
      t.players.length * t.startingStack
    )
      throw Error("Tournament chips lost");
    return;
  }
  for (const tb of t.tables) assertConservation(tb.hand!);
  const total = t.tables.reduce(
    (s, tb) =>
      s +
      tb.hand!.players.reduce(
        (a, p) => a + p.stack + p.total,
        tb.hand!.ghostPot,
      ),
    0,
  );
  if (total !== t.players.length * t.startingStack)
    throw Error("Tournament conservation failure");
}
export function view(t: Tournament, id: string) {
  if (!t.players.some((p) => p.id === id)) throw Error("Accès interdit.");
  return {
    ...t,
    seen: undefined,
    tables: t.tables.map((tb) => ({
      ...tb,
      hand: tb.hand ? publicHand(tb.hand, id) : null,
    })),
    results: [...t.results].sort((a, b) => a.rank - b.rank),
  };
}
