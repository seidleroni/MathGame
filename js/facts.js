// Facts within 20: every addition fact with addends 0–10, plus the matching
// subtraction facts. Worlds introduce them one strategy at a time.

export const FACTS = buildFacts();
export const FACT_BY_ID = new Map(FACTS.map((f) => [f.id, f]));

function buildFacts() {
  const facts = [];
  for (let a = 0; a <= 10; a++) {
    for (let b = 0; b <= 10; b++) facts.push({ id: `${a}+${b}`, op: '+', a, b, answer: a + b });
  }
  for (let b = 0; b <= 10; b++) {
    for (let answer = 0; answer <= 10; answer++) {
      const a = b + answer;
      facts.push({ id: `${a}-${b}`, op: '-', a, b, answer });
    }
  }
  return facts;
}

const plus = (f) => f.op === '+';
const minus = (f) => f.op === '-';
const has = (f, ...ns) => ns.includes(f.a) || ns.includes(f.b);

// Ordered so each world builds on a strategy from the ones before it.
export const WORLDS = [
  { name: 'Moon Base', skill: '+0, +1, +2', color: '#cfd8dc', accent: '#78909c', test: (f) => plus(f) && Math.min(f.a, f.b) <= 2 },
  { name: 'Twin Planet', skill: 'Doubles', color: '#ff8a65', accent: '#ffe0b2', test: (f) => plus(f) && f.a === f.b },
  { name: 'Planet Ten', skill: 'Make 10', color: '#4fc3f7', accent: '#e1f5fe', test: (f) => plus(f) && f.answer === 10 },
  { name: 'Ring World', skill: '10 + a number', color: '#ffd54f', accent: '#fff8e1', ring: true, test: (f) => plus(f) && has(f, 10) },
  { name: 'Neighbor Nebula', skill: 'Near doubles', color: '#ba68c8', accent: '#f3e5f5', test: (f) => plus(f) && Math.abs(f.a - f.b) === 1 },
  { name: 'Nine Nova', skill: '+9 and +8', color: '#81c784', accent: '#e8f5e9', ring: true, test: (f) => plus(f) && has(f, 8, 9) },
  { name: 'Plus Galaxy', skill: 'All adding facts', color: '#f06292', accent: '#fce4ec', test: plus },
  { name: 'Minus Moon', skill: '−0, −1, −2', color: '#90caf9', accent: '#e3f2fd', test: (f) => minus(f) && f.b <= 2 },
  { name: 'Crater Canyon', skill: 'Take away within 10', color: '#ffb74d', accent: '#fff3e0', test: (f) => minus(f) && f.a <= 10 },
  { name: 'Halfway Haven', skill: 'Halves and tens', color: '#4db6ac', accent: '#e0f2f1', ring: true, test: (f) => minus(f) && (f.a === 2 * f.b || f.b === 10 || f.answer === 10) },
  { name: 'Teen Titan', skill: 'Take away from teens', color: '#e57373', accent: '#ffebee', test: (f) => minus(f) && f.a > 10 },
  { name: 'Champion Galaxy', skill: 'Everything!', color: '#ffd700', accent: '#7c4dff', ring: true, test: () => true },
];

export const WORLD_FACTS = WORLDS.map((w) => FACTS.filter(w.test));

export const factText = (f) => `${f.a} ${f.op === '+' ? '+' : '−'} ${f.b}`;

// Rough ordering for introducing new facts: small, friendly ones first.
export function difficulty(f) {
  return f.op === '+' ? f.answer + Math.min(f.a, f.b) * 0.5 : f.a + f.b * 0.5;
}

export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Wrong answers are near misses (off by one or two, or the other operation),
// so picking the right one takes real knowing rather than elimination.
export function makeChoices(fact, count, rng = Math.random) {
  const ans = fact.answer;
  const valid = (n) => n >= 0 && n <= 20 && n !== ans;
  const close = shuffle([ans - 1, ans + 1, ans - 2, ans + 2], rng).filter(valid);
  const other = fact.op === '+' ? Math.abs(fact.a - fact.b) : fact.a + fact.b;
  const far = shuffle([other, ans + 10, ans - 10, ans + 3, ans - 3], rng).filter(valid);
  const picks = new Set([ans]);
  for (const n of [close[0], close[1], ...shuffle([...close.slice(2), ...far], rng)]) {
    if (picks.size >= count) break;
    if (n !== undefined) picks.add(n);
  }
  while (picks.size < count) picks.add(Math.floor(rng() * 21));
  return shuffle([...picks], rng);
}

const countOn = (start, steps) =>
  `${start}… ${Array.from({ length: steps }, (_, i) => start + i + 1).join(', ')}`;
const countBack = (start, steps) =>
  `${start}… ${Array.from({ length: steps }, (_, i) => start - i - 1).join(', ')}`;

// A short strategy tip, matched to the thinking each world teaches.
export function hintFor(f) {
  const { a, b, answer } = f;
  if (f.op === '+') {
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    if (small === 0) return `Adding 0 changes nothing. ${big} stays ${big}!`;
    if (small <= 2) return `Start at ${big} and count on ${small}: ${countOn(big, small)}`;
    if (a === b) return `It's a double! ${a} and ${a} make ${answer}.`;
    if (big === 10) return `10 and ${small} is ${answer}. Just put a 1 in front of ${small}!`;
    if (answer === 10) return `${a} and ${b} are ten buddies. Together they make 10!`;
    if (big - small === 1) return `Near double! ${small} + ${small} = ${small * 2}, and 1 more is ${answer}.`;
    if (big === 9) return `9 is almost 10. 10 + ${small} = ${10 + small}, then 1 less is ${answer}.`;
    if (answer > 10) {
      const need = 10 - big;
      return `Make 10! ${big} + ${need} = 10, then ${small - need} more is ${answer}.`;
    }
    return `Start at ${big} and count on ${small}: ${countOn(big, small)}`;
  }
  if (b === 0) return `Taking away 0 takes nothing. Still ${a}!`;
  if (answer === 0) return `Take away everything and 0 is left.`;
  if (b <= 2) return `Count back ${b} from ${a}: ${countBack(a, b)}`;
  if (a === 2 * b) return `Double ${b} is ${a}, so ${a} − ${b} = ${b}.`;
  if (b === 10) return `Take the 10 away from ${a} and ${answer} is left.`;
  return `Think adding: ${b} + ? = ${a}. Since ${b} + ${answer} = ${a}, the answer is ${answer}!`;
}
