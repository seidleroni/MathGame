// Things to earn: ranks from XP, and collectible Space Pals dropped by bosses.

export const RANKS = [
  { xp: 0, name: 'Space Cadet', badge: '🌱' },
  { xp: 600, name: 'Pilot', badge: '🚀' },
  { xp: 1500, name: 'Captain', badge: '🛸' },
  { xp: 3000, name: 'Commander', badge: '⭐' },
  { xp: 5000, name: 'Star Ranger', badge: '🌠' },
  { xp: 8000, name: 'Galaxy Hero', badge: '🏆' },
  { xp: 12000, name: 'Space Legend', badge: '👑' },
];

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  const progress = next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1;
  return { index: i, ...RANKS[i], next, progress };
}

const RARITY_WEIGHT = { common: 6, rare: 2.5, legendary: 0.8 };

export const PALS = [
  { id: 'zib', emoji: '👾', name: 'Zib', rarity: 'common' },
  { id: 'blorp', emoji: '👽', name: 'Blorp', rarity: 'common' },
  { id: 'beep', emoji: '🤖', name: 'Beep-Boop', rarity: 'common' },
  { id: 'squidge', emoji: '🦑', name: 'Squidge', rarity: 'common' },
  { id: 'octo', emoji: '🐙', name: 'Octo', rarity: 'common' },
  { id: 'hopper', emoji: '🐸', name: 'Hopper', rarity: 'common' },
  { id: 'peep', emoji: '🐥', name: 'Peep', rarity: 'common' },
  { id: 'rover', emoji: '🐶', name: 'Rover', rarity: 'common' },
  { id: 'comet', emoji: '🐱', name: 'Comet Cat', rarity: 'common' },
  { id: 'bunny', emoji: '🐰', name: 'Moon Bunny', rarity: 'common' },
  { id: 'buzz', emoji: '🐝', name: 'Buzz', rarity: 'common' },
  { id: 'dot', emoji: '🐞', name: 'Dot', rarity: 'common' },
  { id: 'foxy', emoji: '🦊', name: 'Foxy Fuzz', rarity: 'rare' },
  { id: 'pando', emoji: '🐼', name: 'Pando', rarity: 'rare' },
  { id: 'pip', emoji: '🐧', name: 'Ice Pip', rarity: 'rare' },
  { id: 'hoot', emoji: '🦉', name: 'Hoot', rarity: 'rare' },
  { id: 'shellby', emoji: '🐢', name: 'Shellby', rarity: 'rare' },
  { id: 'pinchy', emoji: '🦀', name: 'Pinchy', rarity: 'rare' },
  { id: 'splash', emoji: '🐳', name: 'Splash', rarity: 'rare' },
  { id: 'trex', emoji: '🦖', name: 'T-Rocket', rarity: 'legendary' },
  { id: 'blaze', emoji: '🐉', name: 'Blaze', rarity: 'legendary' },
  { id: 'sparkle', emoji: '🦄', name: 'Sparkle', rarity: 'legendary' },
  { id: 'twinkle', emoji: '🌟', name: 'Twinkle', rarity: 'legendary' },
  { id: 'mothership', emoji: '🛸', name: 'Mothership', rarity: 'legendary' },
];

export const palById = (id) => PALS.find((p) => p.id === id);

// Weighted by rarity; a duplicate gets one re-roll so new pals keep coming.
export function rollPal(owned = {}, rng = Math.random) {
  const roll = () => {
    const total = PALS.reduce((sum, p) => sum + RARITY_WEIGHT[p.rarity], 0);
    let r = rng() * total;
    for (const p of PALS) {
      r -= RARITY_WEIGHT[p.rarity];
      if (r < 0) return p;
    }
    return PALS[0];
  };
  const first = roll();
  return owned[first.id] ? roll() : first;
}

// One boss per planet, in planet order.
export const BOSSES = [
  { name: 'Zorg', color: '#8e44ad' },
  { name: 'Twinkle Twin', color: '#e8457a' },
  { name: 'Ten-Tacle', color: '#1e88e5' },
  { name: 'Ringo', color: '#f39c12' },
  { name: 'Nebby', color: '#9b59b6' },
  { name: 'Nova Ned', color: '#27ae60' },
  { name: 'Plus Pirate', color: '#c0392b' },
  { name: 'Minus Max', color: '#2980b9' },
  { name: 'Crater Crab', color: '#e67e22' },
  { name: 'Half-Pint', color: '#16a085' },
  { name: 'Teen Titan', color: '#d81b60' },
  { name: 'Galaxy King', color: '#f1c40f' },
];
