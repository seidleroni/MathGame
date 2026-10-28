import { FACTS, WORLDS, WORLD_FACTS, difficulty } from './facts.js';

const STORAGE_KEY = 'numberRocket.v1';
const SEC = 1000;
const HOUR = 3600 * SEC;
const DAY = 24 * HOUR;

// Leitner boxes with growing gaps between reviews (spaced repetition).
// Boxes 0–1 are still being learned and use multiple choice; from box 2 up the
// fact is "learned" and the child types the answer from memory.
export const INTERVALS = [0, 45 * SEC, 8 * HOUR, DAY, 3 * DAY, 7 * DAY];
export const MAX_BOX = INTERVALS.length - 1;
export const LEARNED_BOX = 2;
export const MASTERED_BOX = 4;
export const UNLOCK_SHARE = 0.75;
export const REGULAR_QUESTIONS = 12;
export const BOSS_HEALTH = 5;
export const BOSS_MAX_QUESTIONS = 10;
const WORKING_SET = 4; // how many shaky facts to juggle before adding new ones
const RECENT = 3; // don't repeat a fact within this many questions

export const inputMode = (box) => (box >= LEARNED_BOX ? 'keypad' : 'choice');
export const fastLimit = (mode) => (mode === 'keypad' ? 4000 : 3000);
export const timeLimit = (box) => [15, 12, 12, 10, 8, 7][box] * SEC;

const EMPTY_STAT = Object.freeze({ box: 0, seen: 0, right: 0, wrong: 0, due: 0, last: 0, avgMs: 0 });

function freshState() {
  return {
    facts: {},
    gems: 0,
    skin: 'classic',
    owned: ['classic'],
    unlocked: 0,
    worldStars: {},
    best: {},
    missions: 0,
    bestCombo: 0,
    xp: 0,
    pals: {},
    copilot: null,
    lightningBest: 0,
    sound: true,
    music: true,
    name: '',
  };
}

export class Learner {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.state = this.load();
  }

  load() {
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null');
      if (saved) return { ...freshState(), ...saved };
    } catch {
      // Corrupt or blocked storage: start fresh rather than crash.
    }
    return freshState();
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Private mode or full storage: progress just won't persist.
    }
  }

  reset() {
    const { sound, music, name } = this.state;
    this.state = { ...freshState(), sound, music, name };
    this.save();
  }

  stat(id) {
    return this.state.facts[id] ?? EMPTY_STAT;
  }

  record(fact, correct, ms, mode, now = Date.now()) {
    const prev = this.stat(fact.id);
    const s = { ...prev, seen: prev.seen + 1, last: now };
    const fast = correct && ms <= fastLimit(mode);
    if (correct) {
      s.right++;
      s.avgMs = prev.avgMs ? Math.round(prev.avgMs * 0.7 + ms * 0.3) : ms;
      if (prev.seen === 0) s.box = fast ? LEARNED_BOX : 1; // knew it already: skip ahead
      else if (s.box === 0) s.box = 1;
      // Only promote once the review is due, so learning is spread over time;
      // learned facts also need a quick answer to move up.
      else if (now >= prev.due && (s.box < LEARNED_BOX || fast)) s.box = Math.min(MAX_BOX, s.box + 1);
    } else {
      s.wrong++;
      s.box = s.box >= MASTERED_BOX ? LEARNED_BOX : s.box >= LEARNED_BOX ? 1 : 0;
    }
    s.due = now + INTERVALS[s.box];
    this.state.facts[fact.id] = s;
    return { fast, before: prev.box, after: s.box };
  }

  worldProgress(i) {
    const facts = WORLD_FACTS[i];
    let learned = 0;
    let mastered = 0;
    for (const f of facts) {
      const { box } = this.stat(f.id);
      if (box >= LEARNED_BOX) learned++;
      if (box >= MASTERED_BOX) mastered++;
    }
    return { total: facts.length, learned, mastered, share: learned / facts.length };
  }

  // Unlocks are permanent even if a fact later slips back a box.
  updateUnlocks() {
    const before = this.state.unlocked;
    while (this.state.unlocked < WORLDS.length - 1 && this.worldProgress(this.state.unlocked).share >= UNLOCK_SHARE) {
      this.state.unlocked++;
    }
    return this.state.unlocked > before ? this.state.unlocked : null;
  }

  // Learned facts from planets the child has reached: the Lightning Round pool.
  learnedFacts(minBox = LEARNED_BOX) {
    const reached = new Set(WORLD_FACTS.slice(0, this.state.unlocked + 1).flat().map((f) => f.id));
    return FACTS.filter((f) => reached.has(f.id) && this.stat(f.id).seen && this.stat(f.id).box >= minBox);
  }

  totals() {
    let learned = 0;
    let mastered = 0;
    let right = 0;
    let seen = 0;
    for (const f of FACTS) {
      const s = this.stat(f.id);
      if (s.box >= LEARNED_BOX) learned++;
      if (s.box >= MASTERED_BOX) mastered++;
      right += s.right;
      seen += s.seen;
    }
    return { total: FACTS.length, learned, mastered, accuracy: seen ? right / seen : 0, answered: seen };
  }
}

export function weightedPick(items, rng = Math.random) {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) return item;
  }
  return items[items.length - 1][0];
}

// One play session: 12 regular questions, then a boss battle that replays
// facts from this mission (retrieval practice) until the boss is beaten.
export class Mission {
  constructor(learner, worldIndex, rng = Math.random, now = () => Date.now()) {
    this.learner = learner;
    this.world = worldIndex;
    this.rng = rng;
    this.now = now;
    this.inWorld = new Set(WORLD_FACTS[worldIndex].map((f) => f.id));
    this.index = 0;
    this.asked = [];
    this.retry = [];
    this.recent = [];
    this.bossHealth = BOSS_HEALTH;
    this.bossQuestions = 0;
  }

  get phase() {
    return this.index < REGULAR_QUESTIONS ? 'regular' : 'boss';
  }

  get done() {
    return this.phase === 'boss' && (this.bossHealth <= 0 || this.bossQuestions >= BOSS_MAX_QUESTIONS);
  }

  next() {
    const fact = this.pick();
    this.recent.push(fact.id);
    if (this.recent.length > RECENT) this.recent.shift();
    return fact;
  }

  answer(fact, correct, ms, mode) {
    const result = this.learner.record(fact, correct, ms, mode, this.now());
    this.asked.push({ fact, correct, ms, mode, fast: result.fast, ...result });
    // A missed fact comes back after two other questions.
    if (!correct) this.retry.push({ fact, at: this.index + 3 });
    if (this.phase === 'boss') {
      this.bossQuestions++;
      if (correct) this.bossHealth--;
    }
    this.index++;
    return result;
  }

  pick() {
    const due = this.retry.findIndex((r) => r.at <= this.index);
    if (due >= 0) return this.retry.splice(due, 1)[0].fact;
    return this.phase === 'boss' ? this.pickBoss() : this.pickRegular();
  }

  pickRegular() {
    const t = this.now();
    const fresh = (f) => !this.recent.includes(f.id);
    // Learned facts already answered quickly this mission don't need drilling again now.
    const nailed = new Set(this.asked.filter((a) => a.fast).map((a) => a.fact.id));
    const groups = { new: [], shaky: [], due: [], practice: [] };
    const unseen = [];
    let shakyInWorld = 0;
    for (const f of FACTS) {
      const s = this.learner.stat(f.id);
      const inWorld = this.inWorld.has(f.id);
      if (!s.seen) {
        if (inWorld && fresh(f)) unseen.push(f);
      } else if (s.box < LEARNED_BOX) {
        if (inWorld) shakyInWorld++;
        if (fresh(f)) groups.shaky.push([f, (t >= s.due ? 3 : 1) * (inWorld ? 2 : 1)]);
      } else if (t >= s.due) {
        if (fresh(f)) groups.due.push([f, (inWorld ? 2 : 1) * (1 + Math.min(3, (t - s.due) / DAY))]);
      } else if (inWorld && fresh(f) && !nailed.has(f.id)) {
        const slow = s.avgMs > fastLimit(inputMode(s.box)) ? 1 : 0;
        groups.practice.push([f, 1 / s.box + slow]);
      }
    }
    // Only bring in new facts while the pile of shaky ones is small.
    if (shakyInWorld < WORKING_SET) {
      unseen
        .map((f) => [f, difficulty(f) + this.rng() * 4])
        .sort((x, y) => x[1] - y[1])
        .slice(0, 2)
        .forEach(([f]) => groups.new.push([f, 1]));
    }
    // A child who is breezing through gets new facts faster.
    const share = { new: shakyInWorld === 0 ? 0.7 : 0.35, shaky: 0.35, due: 0.2, practice: 0.1 };
    const options = Object.entries(groups)
      .filter(([, list]) => list.length)
      .map(([name, list]) => [list, share[name]]);
    if (!options.length) return this.fallback();
    return weightedPick(weightedPick(options, this.rng), this.rng);
  }

  pickBoss() {
    const byId = new Map();
    for (const a of this.asked) {
      const w = !a.correct ? 4 : a.fast ? 1 : 2;
      byId.set(a.fact.id, [a.fact, Math.max(byId.get(a.fact.id)?.[1] ?? 0, w)]);
    }
    const list = [...byId.values()].filter(([f]) => !this.recent.includes(f.id));
    return list.length ? weightedPick(list, this.rng) : this.pickRegular();
  }

  fallback() {
    const last = this.recent[this.recent.length - 1];
    const pool = WORLD_FACTS[this.world].filter((f) => f.id !== last);
    return pool[Math.floor(this.rng() * pool.length)] ?? FACTS[0];
  }

  summary() {
    const total = this.asked.length;
    const right = this.asked.filter((a) => a.correct).length;
    const fast = this.asked.filter((a) => a.fast).length;
    const accuracy = total ? right / total : 0;
    const stars = accuracy >= 0.9 && fast / total >= 0.5 ? 3 : accuracy >= 0.75 ? 2 : 1;
    const reached = (box) =>
      unique(this.asked.filter((a) => a.before < box && a.after >= box)).filter((f) => this.learner.stat(f.id).box >= box);
    const learned = reached(LEARNED_BOX);
    const mastered = reached(MASTERED_BOX);
    return { total, right, fast, accuracy, stars, learned, mastered, bossDefeated: this.bossHealth <= 0 };
  }
}

function unique(entries) {
  const seen = new Map();
  for (const e of entries) seen.set(e.fact.id, e.fact);
  return [...seen.values()];
}

export const LIGHTNING_SECONDS = 60;
export const LIGHTNING_MIN_FACTS = 8;

// Lightning Round: rapid recall of already-learned facts, leaning on the slow ones.
export function pickLightning(learner, recent, rng = Math.random) {
  // Misses can shrink the learned pool mid-round; fall back to anything practiced.
  let pool = learner.learnedFacts();
  if (pool.length < 4) pool = learner.learnedFacts(0);
  if (pool.length > recent.length) pool = pool.filter((f) => !recent.includes(f.id));
  const now = Date.now();
  const weighted = pool.map((f) => {
    const s = learner.stat(f.id);
    return [f, 1 + (s.avgMs > fastLimit('keypad') ? 2 : 0) + (now >= s.due ? 1 : 0)];
  });
  return weighted.length ? weightedPick(weighted, rng) : FACTS[0];
}
