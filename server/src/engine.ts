import { shuffled, evaluate, compare, type Card } from "./cards.js";
export type Variant = "classic" | "sevenTwo" | "ghost" | "redRiver";
export type Action = {
  type: "fold" | "check" | "call" | "raise";
  amount?: number;
};
export interface Player {
  id: string;
  name: string;
  stack: number;
  seat: number;
  bot: boolean;
}
export interface HandPlayer extends Player {
  cards: Card[];
  bet: number;
  total: number;
  folded: boolean;
  acted: boolean;
  reopenAt: number;
  offensive: boolean;
  foldsCaused: boolean;
  lastAction: string;
}
export interface Pot {
  amount: number;
  eligible: string[];
  winners: string[];
  ghost: boolean;
}
export interface Hand {
  id: number;
  players: HandPlayer[];
  deck: Card[];
  board: Card[];
  ghostCards: Card[];
  ghostPot: number;
  button: number;
  sb: number;
  bb: number;
  stage: "preflop" | "flop" | "turn" | "river" | "done";
  turn: string | null;
  currentBet: number;
  minRaise: number;
  lastAggressor: string | null;
  variant: Variant;
  pots: Pot[];
  log: string[];
  initialTotal: number;
  showdown: boolean;
  bonus: { from: string; to: string; amount: number }[];
}
const alive = (h: Hand) => h.players.filter((p) => !p.folded);
const able = (h: Hand) => alive(h).filter((p) => p.stack > 0);
function next(
  h: Hand,
  seat: number,
  predicate: (p: HandPlayer) => boolean,
): HandPlayer | undefined {
  return [...h.players]
    .sort(
      (a, b) => ((a.seat - seat + 8) % 8 || 8) - ((b.seat - seat + 8) % 8 || 8),
    )
    .find(predicate);
}
function draw(h: Hand) {
  const c = h.deck.shift();
  if (!c) throw Error("Deck exhausted");
  return c;
}
function pay(p: HandPlayer, n: number) {
  const amount = Math.min(p.stack, n);
  p.stack -= amount;
  p.bet += amount;
  p.total += amount;
}
export function startHand(
  players: Player[],
  button: number,
  bb: number,
  id: number,
  variant: Variant = "classic",
  ghostPot = 0,
  deck = shuffled(),
): Hand {
  if (
    players.length < 2 ||
    players.length > 8 ||
    players.some((p) => p.stack <= 0)
  )
    throw Error("Invalid seats");
  const h: Hand = {
    id,
    players: players.map((p) => ({
      ...p,
      cards: [],
      bet: 0,
      total: 0,
      folded: false,
      acted: false,
      reopenAt: 0,
      offensive: false,
      foldsCaused: false,
      lastAction: "",
    })),
    deck: [...deck],
    board: [],
    ghostCards: [],
    ghostPot,
    button,
    sb: Math.max(1, Math.floor(bb / 2)),
    bb,
    stage: "preflop",
    turn: null,
    currentBet: bb,
    minRaise: bb,
    lastAggressor: null,
    variant,
    pots: [],
    log: [],
    initialTotal: players.reduce((s, p) => s + p.stack, ghostPot),
    showdown: false,
    bonus: [],
  };
  for (let round = 0; round < 2; round++)
    for (const p of h.players) p.cards.push(draw(h));
  if (variant === "ghost") h.ghostCards = [draw(h), draw(h)];
  const sb =
    players.length === 2
      ? h.players.find((p) => p.seat === button)!
      : next(h, button, () => true)!;
  const big = next(h, sb.seat, () => true)!;
  pay(sb, h.sb);
  pay(big, bb);
  sb.lastAction = "SB";
  big.lastAction = "BB";
  h.turn = next(h, big.seat, (p) => p.stack > 0)?.id ?? null;
  settleFlow(h, big.seat);
  assertConservation(h);
  return h;
}
export function legal(h: Hand, id: string) {
  const p = h.players.find((p) => p.id === id);
  if (!p || h.turn !== id || h.stage === "done") return null;
  const call = Math.min(p.stack, Math.max(0, h.currentBet - p.bet));
  return {
    call,
    canCheck: call === 0,
    canRaise:
      p.stack > h.currentBet - p.bet &&
      h.currentBet >= p.reopenAt &&
      able(h).length > 1,
    minTo: h.currentBet + h.minRaise,
    maxTo: p.bet + p.stack,
  };
}
export function act(h: Hand, id: string, action: Action) {
  const options = legal(h, id);
  if (!options) throw Error("Ce n’est pas votre tour.");
  const p = h.players.find((p) => p.id === id)!;
  if (action.type === "fold") {
    p.folded = true;
    if (h.currentBet > p.bet && h.lastAggressor) {
      h.players.find((q) => q.id === h.lastAggressor)!.foldsCaused = true;
    }
  } else if (action.type === "check") {
    if (!options.canCheck) throw Error("Une mise doit être suivie.");
  } else if (action.type === "call") pay(p, options.call);
  else if (action.type === "raise") {
    const to = action.amount;
    if (
      !options.canRaise ||
      !Number.isSafeInteger(to) ||
      to! <= h.currentBet ||
      to! > options.maxTo ||
      (to! < options.minTo && to !== options.maxTo)
    )
      throw Error("Relance non autorisée.");
    const delta = to! - h.currentBet;
    pay(p, to! - p.bet);
    if (delta >= h.minRaise) h.minRaise = delta;
    h.currentBet = to!;
    p.offensive = true;
    h.lastAggressor = p.id;
  } else throw Error("Action invalide.");
  p.acted = true;
  p.reopenAt = h.currentBet + h.minRaise;
  p.lastAction = action.type === "raise" ? `Relance ${p.bet}` : action.type;
  h.log.push(`${p.name} · ${p.lastAction}`);
  settleFlow(h, p.seat);
  assertConservation(h);
}
function needs(h: Hand, p: HandPlayer) {
  return !p.folded && p.stack > 0 && (!p.acted || p.bet < h.currentBet);
}
function settleFlow(h: Hand, after: number) {
  if (alive(h).length === 1) {
    if (h.variant === "ghost") runout(h);
    finish(h);
    return;
  }
  const can = able(h);
  if (can.length <= 1) {
    const owes = can.find((p) => p.bet < h.currentBet);
    if (owes) {
      h.turn = owes.id;
      return;
    }
    runout(h);
    finish(h);
    return;
  }
  const waiting = next(h, after, (p) => needs(h, p));
  if (waiting) {
    h.turn = waiting.id;
    return;
  }
  if (!advance(h)) {
    finish(h);
    return;
  }
  h.turn = next(h, h.button, (p) => needs(h, p))?.id ?? null;
}
function advance(h: Hand): boolean {
  for (const p of h.players) {
    p.bet = 0;
    p.acted = false;
    p.reopenAt = 0;
    p.lastAction = "";
  }
  h.currentBet = 0;
  h.minRaise = h.bb;
  h.lastAggressor = null;
  if (h.stage === "preflop") {
    draw(h);
    h.board.push(draw(h), draw(h), draw(h));
    h.stage = "flop";
    return true;
  }
  if (h.stage === "flop") {
    draw(h);
    h.board.push(draw(h));
    h.stage = "turn";
    return true;
  }
  if (h.stage === "turn") {
    draw(h);
    h.board.push(draw(h));
    h.stage = "river";
    return h.variant !== "redRiver" || "hd".includes(h.board.at(-1)![1]);
  }
  if (h.stage === "river" && h.variant === "redRiver" && h.deck.length) {
    h.board.push(draw(h));
    return "hd".includes(h.board.at(-1)![1]);
  }
  return false;
}
function runout(h: Hand) {
  while (advance(h)) {
    /* No betting with all remaining players all-in. */
  }
}
export function buildPots(players: HandPlayer[]): Pot[] {
  const levels = [
    ...new Set(players.map((p) => p.total).filter((n) => n > 0)),
  ].sort((a, b) => a - b);
  let prev = 0;
  return levels.map((level) => {
    const contributing = players.filter((p) => p.total >= level);
    const pot = {
      amount: (level - prev) * contributing.length,
      eligible: contributing.filter((p) => !p.folded).map((p) => p.id),
      winners: [],
      ghost: false,
    };
    prev = level;
    return pot;
  });
}
function refundUncalled(h: Hand) {
  const sorted = [...h.players].sort((a, b) => b.total - a.total);
  const excess = sorted[0].total - (sorted[1]?.total ?? 0);
  if (excess > 0) {
    sorted[0].total -= excess;
    sorted[0].stack += excess;
    sorted[0].bet = Math.max(0, sorted[0].bet - excess);
  }
}
function finish(h: Hand) {
  refundUncalled(h);
  const remaining = alive(h);
  h.showdown = remaining.length > 1 || h.variant === "ghost";
  h.pots = buildPots(h.players);
  if (h.ghostPot > 0)
    h.pots.unshift({
      amount: h.ghostPot,
      eligible: remaining.map((p) => p.id),
      winners: [],
      ghost: false,
    });
  h.ghostPot = 0;
  const ranks = new Map(
    remaining.map((p) => [
      p.id,
      h.showdown ? evaluate([...p.cards, ...h.board]) : [0],
    ]),
  );
  const ghost =
    h.variant === "ghost" ? evaluate([...h.ghostCards, ...h.board]) : null;
  const winners = new Set<string>();
  for (const pot of h.pots) {
    let candidates = remaining.filter((p) => pot.eligible.includes(p.id));
    if (!candidates.length) throw Error("Pot without eligible player");
    candidates.sort((a, b) => compare(ranks.get(b.id)!, ranks.get(a.id)!));
    const best = ranks.get(candidates[0].id)!;
    if (ghost && compare(best, ghost) <= 0) {
      h.ghostPot += pot.amount;
      pot.ghost = true;
      continue;
    }
    candidates = candidates
      .filter((p) => compare(ranks.get(p.id)!, best) === 0)
      .sort(
        (a, b) =>
          ((a.seat - h.button + 8) % 8 || 8) -
          ((b.seat - h.button + 8) % 8 || 8),
      );
    const share = Math.floor(pot.amount / candidates.length);
    let odd = pot.amount % candidates.length;
    for (const p of candidates) {
      p.stack += share + (odd-- > 0 ? 1 : 0);
      pot.winners.push(p.id);
      winners.add(p.id);
    }
  }
  if (h.variant === "sevenTwo")
    for (const id of winners) {
      const p = h.players.find((p) => p.id === id)!;
      if (
        p.cards
          .map((c) => c[0])
          .sort()
          .join("") !== "27" ||
        (!h.showdown && !p.foldsCaused)
      )
        continue;
      // A tied pot does not qualify; at least one outright pot victory is required.
      if (
        !h.pots.some((pot) => pot.winners.length === 1 && pot.winners[0] === id)
      )
        continue;
      for (const q of h.players.filter((q) => q.id !== id)) {
        const amount = Math.min(h.bb, q.stack);
        q.stack -= amount;
        p.stack += amount;
        h.bonus.push({ from: q.id, to: id, amount });
      }
    }
  for (const p of h.players) {
    p.total = 0;
    p.bet = 0;
  }
  h.stage = "done";
  h.turn = null;
  h.log.push(h.ghostPot ? `Ghost Pot : ${h.ghostPot}` : `Main terminée`);
}
export function assertConservation(h: Hand) {
  const total = h.players.reduce((s, p) => s + p.stack + p.total, h.ghostPot);
  if (
    total !== h.initialTotal ||
    h.players.some((p) => p.stack < 0 || !Number.isSafeInteger(p.stack))
  )
    throw Error(`Chip conservation: ${total} != ${h.initialTotal}`);
}
export function publicHand(h: Hand, viewer: string) {
  const { deck, ghostCards, initialTotal, ...safe } = h;
  return {
    ...safe,
    ghostCards: h.stage === "done" ? ghostCards : [],
    players: h.players.map((p) => ({
      ...p,
      cards:
        p.id === viewer || (h.stage === "done" && h.showdown && !p.folded)
          ? p.cards
          : [],
    })),
    legal: legal(h, viewer),
  };
}
