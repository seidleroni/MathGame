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

// Dungeon mode: the same 12 fact sets as the planets, as dungeons.
// floor/wall/fog/glow color the dungeon; boss is the golem at the end.
export const DUNGEONS = [
  { name: 'Mossy Caves', floor: '#7d8a6a', wall: '#5f6b55', fog: '#141a12', glow: '#9cff57', boss: { name: 'Mossy Golem', color: '#6b8f3a' } },
  { name: 'Twin Tombs', floor: '#c9a86a', wall: '#a8874e', fog: '#1e1508', glow: '#ffb74d', boss: { name: 'Twin Mummy King', color: '#d4b26a' } },
  { name: 'Ten Mines', floor: '#6d6d75', wall: '#4e4e57', fog: '#0f0f16', glow: '#ffd54f', boss: { name: 'Ten-Ton Troll', color: '#8d6e63' } },
  { name: 'Ring Ruins', floor: '#8fa3a8', wall: '#6c8288', fog: '#0f1a1d', glow: '#80deea', boss: { name: 'Ring Guardian', color: '#4fc3f7' } },
  { name: 'Crystal Halls', floor: '#6a5a8a', wall: '#4d3f6b', fog: '#130d22', glow: '#e040fb', boss: { name: 'Crystal Queen', color: '#ba68c8' } },
  { name: 'Lava Forge', floor: '#5a3a35', wall: '#3e2622', fog: '#200805', glow: '#ff6d00', boss: { name: 'Magma Brute', color: '#e64a19' } },
  { name: 'Frost Fortress', floor: '#a9c8dd', wall: '#7fa6c0', fog: '#0c1824', glow: '#b3e5fc', boss: { name: 'Frost Giant', color: '#81d4fa' } },
  { name: 'Swamp Sewers', floor: '#5b6b48', wall: '#435236', fog: '#0f150a', glow: '#c6ff00', boss: { name: 'Bog Blob', color: '#7cb342' } },
  { name: 'Bone Crypt', floor: '#9e9a8e', wall: '#77736a', fog: '#141312', glow: '#e0e0e0', boss: { name: 'Skull Lord', color: '#eeeeee' } },
  { name: 'Coral Caverns', floor: '#4d8f8a', wall: '#356b67', fog: '#06181a', glow: '#64ffda', boss: { name: 'Coral Crab', color: '#ff7043' } },
  { name: 'Shadow Tower', floor: '#3d3550', wall: '#2a2338', fog: '#08060e', glow: '#b388ff', boss: { name: 'Shadow Knight', color: '#5e35b1' } },
  { name: 'Golden Citadel', floor: '#c8a64a', wall: '#a07f2a', fog: '#1a1404', glow: '#fff59d', boss: { name: 'Block King', color: '#ffc107' } },
];

// Armory gear. Chest gear drops from beaten dungeon bosses; enchanted gear is
// earned only by learning every fact in its world, so gear shows what you know.
export const GEAR = [
  { id: 'wood-sword', slot: 'weapon', shape: 'sword', name: 'Wooden Sword', color: '#a0703c', rarity: 'common' },
  { id: 'stone-sword', slot: 'weapon', shape: 'sword', name: 'Stone Sword', color: '#9e9e9e', rarity: 'common' },
  { id: 'iron-axe', slot: 'weapon', shape: 'axe', name: 'Iron Axe', color: '#e0e0e0', rarity: 'common' },
  { id: 'gold-sword', slot: 'weapon', shape: 'sword', name: 'Golden Sword', color: '#ffd54f', rarity: 'rare' },
  { id: 'storm-hammer', slot: 'weapon', shape: 'hammer', name: 'Storm Hammer', color: '#64b5f6', rarity: 'rare' },
  { id: 'crystal-sword', slot: 'weapon', shape: 'sword', name: 'Crystal Sword', color: '#4dd0e1', rarity: 'legendary' },
  { id: 'fire-axe', slot: 'weapon', shape: 'axe', name: 'Fire Axe', color: '#ff5722', rarity: 'legendary' },
  { id: 'leather', slot: 'armor', name: 'Leather Tunic', color: '#8d6e63', rarity: 'common' },
  { id: 'chain', slot: 'armor', name: 'Chain Mail', color: '#90a4ae', rarity: 'common' },
  { id: 'forest', slot: 'armor', name: 'Forest Cloak', color: '#558b2f', rarity: 'common' },
  { id: 'iron-armor', slot: 'armor', name: 'Iron Armor', color: '#cfd8dc', rarity: 'rare' },
  { id: 'gold-armor', slot: 'armor', name: 'Gold Armor', color: '#ffca28', rarity: 'rare' },
  { id: 'crystal-armor', slot: 'armor', name: 'Crystal Armor', color: '#80deea', rarity: 'legendary' },
  { id: 'shadow-armor', slot: 'armor', name: 'Shadow Armor', color: '#5e35b1', rarity: 'legendary' },
  { id: 'count-cutlass', slot: 'weapon', shape: 'sword', name: 'Count-On Cutlass', color: '#8bc34a', rarity: 'enchanted', world: 0 },
  { id: 'twin-blade', slot: 'weapon', shape: 'sword', name: 'Twin Blade', color: '#ff8a65', rarity: 'enchanted', world: 1 },
  { id: 'ten-strike', slot: 'weapon', shape: 'sword', name: 'Ten-Strike Sword', color: '#4fc3f7', rarity: 'enchanted', world: 2 },
  { id: 'ring-mail', slot: 'armor', name: 'Ring Mail', color: '#ffd54f', rarity: 'enchanted', world: 3 },
  { id: 'neighbor-hammer', slot: 'weapon', shape: 'hammer', name: 'Neighbor Hammer', color: '#ba68c8', rarity: 'enchanted', world: 4 },
  { id: 'nova-plate', slot: 'armor', name: 'Nova Plate', color: '#81c784', rarity: 'enchanted', world: 5 },
  { id: 'plus-paladin', slot: 'armor', name: 'Plus Paladin Armor', color: '#f06292', rarity: 'enchanted', world: 6 },
  { id: 'minus-mace', slot: 'weapon', shape: 'hammer', name: 'Minus Mace', color: '#90caf9', rarity: 'enchanted', world: 7 },
  { id: 'crater-cloak', slot: 'armor', name: 'Crater Cloak', color: '#ffb74d', rarity: 'enchanted', world: 8 },
  { id: 'halving-axe', slot: 'weapon', shape: 'axe', name: 'Halving Axe', color: '#4db6ac', rarity: 'enchanted', world: 9 },
  { id: 'titan-armor', slot: 'armor', name: 'Titan Armor', color: '#e57373', rarity: 'enchanted', world: 10 },
  { id: 'champion-blade', slot: 'weapon', shape: 'sword', name: 'Champion Blade', color: '#ffd700', rarity: 'enchanted', world: 11 },
];

export const gearById = (id) => GEAR.find((g) => g.id === id);
const SHAPE_ICONS = { sword: '🗡️', axe: '🪓', hammer: '🔨' };
export const gearIcon = (g) => (g.slot === 'armor' ? '🛡️' : SHAPE_ICONS[g.shape]);

// Chest loot, weighted by rarity, re-rolling once on a duplicate.
export function rollGear(owned = [], rng = Math.random) {
  const pool = GEAR.filter((g) => g.rarity !== 'enchanted');
  const roll = () => {
    const total = pool.reduce((sum, g) => sum + RARITY_WEIGHT[g.rarity], 0);
    let r = rng() * total;
    for (const g of pool) {
      r -= RARITY_WEIGHT[g.rarity];
      if (r < 0) return g;
    }
    return pool[0];
  };
  const first = roll();
  return owned.includes(first.id) ? roll() : first;
}

// Enchanted gear whose world is now fully learned but isn't owned yet.
export function enchantedEarned(worldProgress, owned = []) {
  return GEAR.filter((g) => g.rarity === 'enchanted' && !owned.includes(g.id) && worldProgress(g.world).share >= 1);
}
