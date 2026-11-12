import { randomInt } from "node:crypto";
export type Card = string;
export function shuffled(): Card[] {
  const deck = "23456789TJQKA"
    .split("")
    .flatMap((r) => ["s", "h", "d", "c"].map((s) => r + s));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function five(cards: Card[]): number[] {
  const ranks = cards
    .map((c) => "23456789TJQKA".indexOf(c[0]) + 2)
    .sort((a, b) => b - a);
  const groups = [...new Set(ranks)]
    .map((r) => ({ r, n: ranks.filter((v) => v === r).length }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const unique = [...new Set(ranks)];
  if (unique[0] === 14) unique.push(1);
  let straight = 0;
  for (let i = 0; i <= unique.length - 5; i++)
    if (unique[i] - unique[i + 4] === 4) straight = unique[i];
  if (flush && straight) return [8, straight];
  if (groups[0].n === 4) return [7, groups[0].r, groups[1].r];
  if (groups[0].n === 3 && groups[1].n === 2)
    return [6, groups[0].r, groups[1].r];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0].n === 3) return [3, ...groups.map((g) => g.r)];
  if (groups[0].n === 2 && groups[1].n === 2)
    return [2, ...groups.map((g) => g.r)];
  if (groups[0].n === 2) return [1, ...groups.map((g) => g.r)];
  return [0, ...ranks];
}
export function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
export function evaluate(cards: Card[]): number[] {
  if (cards.length < 5 || new Set(cards).size !== cards.length)
    throw Error("Invalid cards");
  let best: number[] = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const rank = five([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (compare(rank, best) > 0) best = rank;
          }
  return best;
}
