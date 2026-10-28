import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, FACT_BY_ID, WORLDS, WORLD_FACTS, makeChoices, hintFor } from '../js/facts.js';
import { Learner, Mission, LEARNED_BOX, MASTERED_BOX, REGULAR_QUESTIONS, BOSS_HEALTH, inputMode } from '../js/learner.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

// Small deterministic RNG so tests don't flake.
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('there are 121 addition and 121 subtraction facts, all within 20', () => {
  assert.equal(FACTS.filter((f) => f.op === '+').length, 121);
  assert.equal(FACTS.filter((f) => f.op === '-').length, 121);
  assert.equal(new Set(FACTS.map((f) => f.id)).size, FACTS.length);
  for (const f of FACTS) {
    assert.ok(f.answer >= 0 && f.answer <= 20);
    assert.equal(f.op === '+' ? f.a + f.b : f.a - f.b, f.answer);
  }
});

test('every world has facts and the last world covers everything', () => {
  WORLD_FACTS.forEach((facts, i) => assert.ok(facts.length > 0, WORLDS[i].name));
  assert.equal(WORLD_FACTS.at(-1).length, FACTS.length);
});

test('choices include the answer once, are unique and in range', () => {
  const rng = seeded(7);
  for (const f of FACTS) {
    for (const n of [3, 4]) {
      const c = makeChoices(f, n, rng);
      assert.equal(c.length, n);
      assert.equal(new Set(c).size, n);
      assert.equal(c.filter((x) => x === f.answer).length, 1);
      assert.ok(c.every((x) => x >= 0 && x <= 20));
    }
  }
});

test('every fact has a hint that states the right answer', () => {
  for (const f of FACTS) {
    const h = hintFor(f);
    assert.ok(h.length > 10, f.id);
  }
  assert.match(hintFor(FACT_BY_ID.get('8+5')), /Make 10/);
  assert.match(hintFor(FACT_BY_ID.get('6+6')), /double/);
  assert.match(hintFor(FACT_BY_ID.get('13-5')), /5 \+ 8 = 13/);
});

test('a fast correct first answer skips ahead; wrong answers drop back', () => {
  const L = new Learner(memoryStorage());
  const f = FACT_BY_ID.get('3+4');
  assert.equal(L.record(f, true, 1500, 'choice', 0).after, LEARNED_BOX);
  const g = FACT_BY_ID.get('7+8');
  assert.equal(L.record(g, true, 6000, 'choice', 0).after, 1);
  assert.equal(L.record(g, false, 2000, 'choice', 1000).after, 0);
});

test('facts only move up a box once their review is due', () => {
  const L = new Learner(memoryStorage());
  const f = FACT_BY_ID.get('9+6');
  L.record(f, true, 1000, 'choice', 0); // box 2, due in 8 hours
  assert.equal(L.record(f, true, 1000, 'keypad', 60_000).after, LEARNED_BOX, 'not due yet');
  const day = 24 * 3600e3;
  assert.equal(L.record(f, true, 1000, 'keypad', day).after, 3);
  assert.equal(L.record(f, true, 9000, 'keypad', 3 * day).after, 3, 'slow answers do not promote');
  assert.equal(L.record(f, true, 1000, 'keypad', 4 * day).after, MASTERED_BOX);
  assert.equal(L.record(f, false, 1000, 'keypad', 5 * day).after, LEARNED_BOX);
});

test('progress survives a reload', () => {
  const storage = memoryStorage();
  const L = new Learner(storage);
  L.record(FACT_BY_ID.get('2+2'), true, 1000, 'choice');
  L.state.gems = 42;
  L.save();
  const again = new Learner(storage);
  assert.equal(again.state.gems, 42);
  assert.equal(again.stat('2+2').box, LEARNED_BOX);
});

test('the next world unlocks once 75% of the current one is learned', () => {
  const L = new Learner(memoryStorage());
  const facts = WORLD_FACTS[0];
  const enough = Math.ceil(facts.length * 0.75);
  facts.slice(0, enough - 1).forEach((f) => L.record(f, true, 1000, 'choice'));
  assert.equal(L.updateUnlocks(), null);
  L.record(facts[enough - 1], true, 1000, 'choice');
  assert.equal(L.updateUnlocks(), 1);
});

test('a first mission sticks to the current world and introduces new facts slowly', () => {
  const L = new Learner(memoryStorage());
  const rng = seeded(3);
  let clock = 0;
  const m = new Mission(L, 0, rng, () => clock);
  const inWorld = new Set(WORLD_FACTS[0].map((f) => f.id));
  const seen = new Set();
  for (let i = 0; i < REGULAR_QUESTIONS; i++) {
    const f = m.next();
    assert.ok(inWorld.has(f.id));
    seen.add(f.id);
    m.answer(f, true, 8000, 'choice'); // slow, so every fact stays "learning"
    clock += 8000;
  }
  // With a working set of 4, a struggling child isn't flooded with new facts.
  assert.ok(seen.size <= 6, `introduced ${seen.size} facts`);
});

test('a missed fact comes back two questions later', () => {
  const L = new Learner(memoryStorage());
  let clock = 0;
  const m = new Mission(L, 1, seeded(5), () => clock);
  const missed = m.next();
  m.answer(missed, false, 3000, 'choice');
  const a = m.next();
  m.answer(a, true, 1000, 'choice');
  const b = m.next();
  m.answer(b, true, 1000, 'choice');
  assert.equal(m.next().id, missed.id);
});

test('the boss battle reuses mission facts and ends when the boss is beaten', () => {
  const L = new Learner(memoryStorage());
  let clock = 0;
  const m = new Mission(L, 2, seeded(9), () => clock);
  const asked = new Set();
  while (m.phase === 'regular') {
    const f = m.next();
    asked.add(f.id);
    m.answer(f, true, 1000, 'choice');
    clock += 5000;
  }
  for (let i = 0; i < BOSS_HEALTH; i++) {
    assert.equal(m.done, false);
    const f = m.next();
    assert.ok(asked.has(f.id));
    m.answer(f, true, 1000, 'choice');
  }
  assert.equal(m.done, true);
  assert.equal(m.summary().bossDefeated, true);
});

test('a child who already knows the facts gets new ones quickly', () => {
  const L = new Learner(memoryStorage());
  let clock = 0;
  const m = new Mission(L, 0, seeded(11), () => clock);
  const seen = new Set();
  for (let i = 0; i < REGULAR_QUESTIONS; i++) {
    const f = m.next();
    seen.add(f.id);
    m.answer(f, true, 1200, inputMode(L.stat(f.id).box));
    clock += 4000;
  }
  assert.ok(seen.size >= 9, `only ${seen.size} different facts`);
});
