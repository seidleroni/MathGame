import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, PALS, BOSSES, rankFor, rollPal } from '../js/rewards.js';
import { WORLDS, FACT_BY_ID } from '../js/facts.js';
import { Learner, pickLightning, LEARNED_BOX } from '../js/learner.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test('ranks climb with XP and progress stays between 0 and 1', () => {
  assert.equal(rankFor(0).name, RANKS[0].name);
  assert.equal(rankFor(RANKS[1].xp).index, 1);
  assert.equal(rankFor(RANKS[1].xp - 1).index, 0);
  assert.equal(rankFor(1e9).index, RANKS.length - 1);
  for (const xp of [0, 250, 900, 4000, 99999]) {
    const p = rankFor(xp).progress;
    assert.ok(p >= 0 && p <= 1, `${xp}: ${p}`);
  }
});

test('pals are unique and there is a boss for every planet', () => {
  assert.equal(new Set(PALS.map((p) => p.id)).size, PALS.length);
  assert.equal(BOSSES.length, WORLDS.length);
});

test('pal drops favor ones the child does not have yet', () => {
  let i = 0;
  const seq = [0, 0.99];
  const rng = () => seq[i++ % seq.length];
  // First roll lands on the first pal; since it's owned, the re-roll is used.
  const pal = rollPal({ [PALS[0].id]: 1 }, rng);
  assert.notEqual(pal.id, PALS[0].id);
});

test('the Lightning Round only asks learned facts from reached planets', () => {
  const L = new Learner(memoryStorage());
  for (const id of ['2+1', '1+5', '7+2', '9+9']) L.record(FACT_BY_ID.get(id), true, 1000, 'choice');
  assert.deepEqual(L.learnedFacts().map((f) => f.id).sort(), ['1+5', '2+1', '7+2']); // 9+9 is on a later planet
  for (let n = 0; n < 50; n++) {
    const f = pickLightning(L, []);
    assert.ok(L.stat(f.id).box >= LEARNED_BOX);
  }
  assert.notEqual(pickLightning(L, ['2+1', '1+5']).id, '2+1');
});
