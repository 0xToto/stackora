import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffled, evaluate, compare } from "../src/cards.js";
import {
  startHand,
  act,
  legal,
  assertConservation,
  publicHand,
  buildPots,
  type Player,
  type Hand,
  type Variant,
} from "../src/engine.js";
import {
  distribution,
  createTournament,
  join,
  start,
  tick,
  rebalance,
  assertTournament,
  action,
} from "../src/tournament.js";
const players = (n: number, stack = 1000): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "Player " + i,
    stack,
    seat: i,
    bot: true,
  }));
function rig(holes: string[][], board: string[], ghost: string[] = []) {
  const used = holes.flat().concat(board, ghost);
  const rest = shuffled().filter((c) => !used.includes(c));
  return [
    ...holes.map((h) => h[0]),
    ...holes.map((h) => h[1]),
    ...ghost,
    rest.shift()!,
    ...board.slice(0, 3),
    rest.shift()!,
    board[3],
    rest.shift()!,
    ...board.slice(4),
    ...rest,
  ];
}
function passive(h: Hand) {
  for (let i = 0; h.stage !== "done"; i++) {
    assert.ok(i < 200);
    const l = legal(h, h.turn!)!;
    act(h, h.turn!, { type: l.canCheck ? "check" : "call" });
  }
  return h;
}
test("shuffle: 52 distinct cards and random ordering", () => {
  const a = shuffled(),
    b = shuffled();
  assert.equal(new Set(a).size, 52);
  assert.notDeepEqual(a, b);
});
test("wheel, flush, full house, quads, straight flush and large boards", () => {
  assert.deepEqual(
    evaluate(["As", "2h", "3d", "4c", "5h", "Kd", "Qc"]),
    [4, 5],
  );
  assert.equal(evaluate(["As", "Ks", "Qs", "Js", "Ts", "2d", "2h"])[0], 8);
  assert.equal(evaluate(["As", "Ah", "Ad", "Ac", "2h"])[0], 7);
  assert.equal(evaluate(["As", "Ah", "Ad", "2c", "2h"])[0], 6);
  assert.equal(evaluate(["As", "Ks", "9s", "3s", "2s"])[0], 5);
  assert.equal(
    evaluate(["2h", "3d", "4s", "6c", "7s", "As", "Ks", "Qs", "Js", "Ts"])[0],
    8,
  );
  assert.ok(
    compare(
      evaluate(["Ah", "Ad", "Ks", "Qc", "Jh"]),
      evaluate(["Kh", "Kd", "As", "Qc", "Jh"]),
    ) > 0,
  );
});
test("headsup button is SB, acts first preflop, second after flop", () => {
  const h = startHand(players(2), 0, 20, 1);
  assert.equal(h.turn, "p0");
  assert.equal(h.players[0].bet, 10);
  act(h, "p0", { type: "call" });
  act(h, "p1", { type: "check" });
  assert.equal(h.stage, "flop");
  assert.equal(h.turn, "p1");
});
test("out of turn, impossible check, negative and undersized raise rejected", () => {
  const h = startHand(players(3), 0, 20, 1);
  assert.throws(() => act(h, "p1", { type: "call" }));
  assert.throws(() => act(h, "p0", { type: "check" }));
  for (const amount of [-2, 21, NaN, 1001])
    assert.throws(() => act(h, "p0", { type: "raise", amount }));
  assertConservation(h);
});
test("short all-in does not reopen a full raiser", () => {
  const p = players(3);
  p[1].stack = 150;
  const h = startHand(p, 0, 20, 1);
  act(h, "p0", { type: "raise", amount: 100 });
  act(h, "p1", { type: "raise", amount: 150 });
  act(h, "p2", { type: "call" });
  assert.equal(h.turn, "p0");
  assert.equal(legal(h, "p0")!.canRaise, false);
  passive(h);
  assertConservation(h);
});
test("cumulative short raises reopen action at a full raise threshold", () => {
  const p = players(4);
  p[0].stack = 150;
  p[1].stack = 180;
  const h = startHand(p, 0, 20, 1);
  act(h, "p3", { type: "raise", amount: 100 });
  act(h, "p0", { type: "raise", amount: 150 });
  act(h, "p1", { type: "raise", amount: 180 });
  act(h, "p2", { type: "call" });
  assert.equal(legal(h, "p3")!.canRaise, true);
});
test("uncalled bet is returned; side pots preserve chips", () => {
  const p = players(3);
  p[0].stack = 100;
  p[1].stack = 200;
  p[2].stack = 500;
  const h = startHand(p, 0, 20, 1);
  act(h, "p0", { type: "raise", amount: 100 });
  act(h, "p1", { type: "raise", amount: 200 });
  act(h, "p2", { type: "call" });
  assert.equal(h.stage, "done");
  assert.deepEqual(
    h.pots.map((p) => p.amount),
    [300, 200],
  );
  assertConservation(h);
});
test("privacy: own cards only; folded cards and deck never serialized", () => {
  const h = startHand(players(3), 0, 20, 1);
  const v = publicHand(h, "p0");
  assert.equal(v.players[0].cards.length, 2);
  assert.equal(v.players[1].cards.length, 0);
  assert.ok(!("deck" in v));
  act(h, "p0", { type: "fold" });
  act(h, "p1", { type: "fold" });
  assert.equal(
    publicHand(h, "spectator").players.flatMap((p) => p.cards).length,
    0,
  );
});
test("72 BB walk has no bounty", () => {
  const h = startHand(
    players(2),
    0,
    20,
    1,
    "sevenTwo",
    0,
    rig(
      [
        ["As", "Kh"],
        ["7s", "2h"],
      ],
      ["3s", "4d", "9h", "Tc", "Jd"],
    ),
  );
  act(h, "p0", { type: "fold" });
  assert.equal(h.bonus.length, 0);
  assert.equal(h.players[1].stack, 1010);
});
test("72 offensive victory charges one BB from every opponent", () => {
  const h = startHand(
    players(2),
    0,
    20,
    1,
    "sevenTwo",
    0,
    rig(
      [
        ["7s", "2h"],
        ["As", "Kh"],
      ],
      ["3s", "4d", "9h", "Tc", "Jd"],
    ),
  );
  act(h, "p0", { type: "raise", amount: 60 });
  act(h, "p1", { type: "fold" });
  assert.equal(h.bonus[0].amount, 20);
  assert.equal(h.players[0].stack, 1040);
  assertConservation(h);
});
test("72 showdown winner receives capped bounty with no negative stacks", () => {
  const h = startHand(
    players(2),
    0,
    20,
    1,
    "sevenTwo",
    0,
    rig(
      [
        ["7s", "2h"],
        ["As", "Kh"],
      ],
      ["7d", "7h", "2s", "3c", "4d"],
    ),
  );
  passive(h);
  assert.equal(h.bonus[0].amount, 20);
  assertConservation(h);
});
test("ghost wins and accumulates carry across consecutive hands", () => {
  let carry = 0;
  let ps = players(2);
  for (let i = 0; i < 3; i++) {
    const h = startHand(
      ps,
      0,
      20,
      i,
      "ghost",
      carry,
      rig(
        [
          ["2s", "3h"],
          ["4s", "5h"],
        ],
        ["As", "Kh", "9d", "Tc", "7d"],
        ["Ah", "Ad"],
      ),
    );
    passive(h);
    assert.ok(h.ghostPot > carry);
    carry = h.ghostPot;
    ps = h.players;
    assertConservation(h);
  }
  assert.equal(carry, 120);
});
test("ghost equality carries, human victory releases carry", () => {
  const tie = startHand(
    players(2),
    0,
    20,
    1,
    "ghost",
    100,
    rig(
      [
        ["2s", "3h"],
        ["4s", "5h"],
      ],
      ["As", "Ks", "Qs", "Js", "Ts"],
      ["Ah", "Ad"],
    ),
  );
  passive(tie);
  assert.equal(tie.ghostPot, 140);
  const win = startHand(
    players(2),
    0,
    20,
    2,
    "ghost",
    140,
    rig(
      [
        ["As", "Ah"],
        ["4s", "5h"],
      ],
      ["Ad", "Ac", "9d", "Tc", "7d"],
      ["2h", "3h"],
    ),
  );
  passive(win);
  assert.equal(win.ghostPot, 0);
  assert.equal(win.players[0].stack, 1160);
});
test("ghost resolves even when all humans except one fold", () => {
  const h = startHand(
    players(2),
    0,
    20,
    1,
    "ghost",
    0,
    rig(
      [
        ["2s", "3h"],
        ["4s", "5h"],
      ],
      ["As", "Kh", "9d", "Tc", "7d"],
      ["Ah", "Ad"],
    ),
  );
  act(h, "p0", { type: "fold" });
  assert.equal(h.stage, "done");
  assert.equal(h.board.length, 5);
  assert.equal(h.ghostPot, 20);
});
test("red river opens extra rounds for reds, stops on black", () => {
  const h = startHand(
    players(2),
    0,
    20,
    1,
    "redRiver",
    0,
    rig(
      [
        ["As", "Kh"],
        ["7s", "2h"],
      ],
      ["3s", "4d", "9h", "Tc", "Jh", "Qd", "6h", "8c"],
    ),
  );
  passive(h);
  assert.equal(h.board.length, 8);
  assert.equal(h.board.at(-1), "8c");
  assertConservation(h);
});
test("all-in red river runs out without extra actions", () => {
  const h = startHand(
    players(2, 20),
    0,
    20,
    1,
    "redRiver",
    0,
    rig(
      [
        ["As", "Kh"],
        ["7s", "2h"],
      ],
      ["3s", "4d", "9h", "Tc", "Jh", "Qd", "8c"],
    ),
  );
  act(h, "p0", { type: "call" });
  assert.equal(h.stage, "done");
  assert.equal(h.board.length, 7);
});
test("split pot including odd chip remains integer", () => {
  const h = startHand(
    players(3),
    0,
    20,
    1,
    "classic",
    0,
    rig(
      [
        ["2s", "3h"],
        ["4s", "5h"],
        ["6h", "7h"],
      ],
      ["As", "Ks", "Qs", "Js", "Ts"],
    ),
  );
  passive(h);
  assert.deepEqual(
    h.players.map((p) => p.stack),
    [1000, 1000, 1000],
  );
  assertConservation(h);
});
test("table distributions match all specified examples", () => {
  for (const [n, expected] of [
    [6, [6]],
    [8, [8]],
    [9, [5, 4]],
    [12, [6, 6]],
    [16, [8, 8]],
    [17, [6, 6, 5]],
    [25, [7, 6, 6, 6]],
    [32, [8, 8, 8, 8]],
  ] as [number, number[]][])
    assert.deepEqual(distribution(n), expected);
});
test("16 to 14 balances 7+7; 9 to 8 merges; unsafe transfer rejected", () => {
  for (const [n, gone, target] of [
    [16, 2, [7, 7]],
    [9, 1, [8]],
  ] as [number, number, number[]][]) {
    const t = createTournament("p0", "Test", { maxPlayers: 32 });
    players(n).forEach((p) => join(t, p.id, p.name));
    start(t, "p0");
    assert.throws(() => rebalance(t));
    t.tables.forEach((tb) => (tb.hand!.stage = "done"));
    const ids = t.tables[0].players.slice(0, gone);
    for (const id of ids) t.players.find((p) => p.id === id)!.stack = 0;
    rebalance(t);
    assert.deepEqual(
      t.tables.map((tb) => tb.players.length),
      target,
    );
    assert.equal(new Set(t.tables.flatMap((tb) => tb.players)).size, n - gone);
    for (const tb of t.tables)
      assert.equal(
        new Set(
          tb.players.map((id) => t.players.find((p) => p.id === id)!.seat),
        ).size,
        tb.players.length,
      );
  }
});
test("actions are idempotent and reject stale versions", () => {
  const t = createTournament("p0", "Test");
  players(2).forEach((p) => join(t, p.id, p.name));
  start(t, "p0");
  const version = t.version;
  action(t, "p0", { type: "call" }, version, "command-1");
  const after = JSON.stringify(t);
  action(t, "p0", { type: "call" }, version, "command-1");
  assert.equal(JSON.stringify(t), after);
  assert.throws(() => action(t, "p1", { type: "check" }, version, "command-2"));
});
test("1200 randomized complete hands across all variants conserve chips", () => {
  let seed = 12;
  const rng = (max: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
  for (const variant of [
    "classic",
    "sevenTwo",
    "ghost",
    "redRiver",
  ] as Variant[])
    for (let i = 0; i < 300; i++) {
      const ps = players(2 + rng(7)).map((p) => ({
        ...p,
        stack: 20 + rng(1000),
      }));
      const h = startHand(ps, 0, 20, i, variant);
      let steps = 0;
      while (h.stage !== "done") {
        assert.ok(++steps < 300);
        const l = legal(h, h.turn!)!;
        const r = rng(100);
        act(
          h,
          h.turn!,
          r < 10
            ? { type: "fold" }
            : r > 85 && l.canRaise
              ? {
                  type: "raise",
                  amount: r > 95 ? l.maxTo : Math.min(l.minTo, l.maxTo),
                }
              : { type: l.canCheck ? "check" : "call" },
        );
        assertConservation(h);
      }
      assert.ok(h.players.every((p) => Number.isInteger(p.stack)));
    }
});
test("complete 9-player bot tournaments in every variant", () => {
  for (const variant of [
    "classic",
    "sevenTwo",
    "ghost",
    "redRiver",
  ] as Variant[]) {
    const t = createTournament("p0", "Bots", {
      variant,
      startingStack: 100,
      initialBB: 20,
      levelSeconds: 30,
      decisionSeconds: 5,
      maxPlayers: 16,
    });
    players(9).forEach((p) => join(t, p.id, p.name, true));
    let now = 100000;
    start(t, "p0", now);
    for (let i = 0; t.status !== "finished" && i < 20000; i++) {
      now += 1000;
      tick(t, now);
      assertTournament(t);
    }
    assert.equal(t.status, "finished", variant);
    assert.equal(t.results.length, 9);
    assert.equal(t.results[0].rank, 9);
    assert.equal(new Set(t.results.map((r) => r.id)).size, 9);
    assert.equal(
      t.players.reduce((s, p) => s + p.stack, 0),
      900,
    );
  }
});
test("side pots and all-ins in every variant with deterministic tied board", () => {
  for (const variant of [
    "classic",
    "sevenTwo",
    "ghost",
    "redRiver",
  ] as Variant[]) {
    const ps = players(3);
    ps[0].stack = 100;
    ps[1].stack = 200;
    ps[2].stack = 300;
    const h = startHand(
      ps,
      0,
      20,
      1,
      variant,
      0,
      rig(
        [
          ["2h", "3h"],
          ["4d", "5d"],
          ["6c", "7c"],
        ],
        ["As", "Ks", "Qs", "Js", "Ts"],
        variant === "ghost" ? ["8h", "9h"] : [],
      ),
    );
    act(h, "p0", { type: "raise", amount: 100 });
    act(h, "p1", { type: "raise", amount: 200 });
    act(h, "p2", { type: "call" });
    assert.equal(h.stage, "done");
    assertConservation(h);
    if (variant === "ghost") assert.equal(h.ghostPot, 500);
    else
      assert.deepEqual(
        h.players.map((p) => p.stack),
        [100, 200, 300],
      );
  }
});
test("72 all-in losers pay zero bounty and no chip debt", () => {
  const h = startHand(
    players(2, 20),
    0,
    20,
    1,
    "sevenTwo",
    0,
    rig(
      [
        ["7s", "2h"],
        ["As", "Kh"],
      ],
      ["7d", "7h", "2s", "3c", "4d"],
    ),
  );
  act(h, "p0", { type: "call" });
  assert.equal(h.bonus[0].amount, 0);
  assert.deepEqual(
    h.players.map((p) => p.stack),
    [40, 0],
  );
  assertConservation(h);
});
test("odd chip goes clockwise from the button", () => {
  const h = startHand(
    players(3),
    0,
    20,
    1,
    "classic",
    0,
    rig(
      [
        ["2s", "3h"],
        ["4s", "5h"],
        ["6h", "7h"],
      ],
      ["As", "Ks", "Qs", "Js", "Ts"],
    ),
  );
  h.players[0].stack -= 1;
  h.players[0].total += 1;
  act(h, "p0", { type: "fold" });
  passive(h);
  assert.equal(h.pots[0].amount, 3);
  assert.deepEqual(h.pots[0].winners, ["p1", "p2"]);
  assert.equal(h.players[1].stack, 1001);
  assert.equal(h.players[2].stack, 1000);
  assertConservation(h);
});
test("transferred previous BB does not pay BB immediately after final-table merge", () => {
  const t = createTournament("p0", "Finale", { maxPlayers: 16 });
  players(9).forEach((p) => join(t, p.id, p.name));
  start(t, "p0");
  t.tables.forEach((tb) => (tb.hand!.stage = "done"));
  const donor = t.tables[1];
  const donorBig = donor.hand!.players.find((p) => p.seat === 2)!.id;
  const gone = t.tables[0].players[0];
  t.players.find((p) => p.id === gone)!.stack = 0;
  rebalance(t);
  const tb = t.tables[0];
  const seats = tb.players
    .map((id) => t.players.find((p) => p.id === id)!)
    .sort((a, b) => a.seat - b.seat);
  const button = seats.find((p) => p.seat > tb.button) ?? seats[0];
  const after = seats
    .filter((p) => p.seat > button.seat)
    .concat(seats.filter((p) => p.seat <= button.seat));
  assert.notEqual(after[1].id, donorBig);
});
