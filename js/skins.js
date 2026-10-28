// Rocket paint jobs, bought in the Hangar with gems.
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, body: '#f2f4f8', accent: '#ff4d4d', window: '#6fd3ff', flame: '#ffa62b' },
  { id: 'ocean', name: 'Ocean', price: 25, body: '#3fa9f5', accent: '#0b3d91', window: '#b8f3ff', flame: '#5ce1ff' },
  { id: 'jungle', name: 'Jungle', price: 40, body: '#43b049', accent: '#ffe23b', window: '#c8ff9e', flame: '#9cff57' },
  { id: 'candy', name: 'Candy', price: 60, body: '#ff9ad5', accent: '#9b5de5', window: '#fff3a8', flame: '#ff5fa2' },
  { id: 'lava', name: 'Lava', price: 90, body: '#3a3a3a', accent: '#ff5722', window: '#ffcc00', flame: '#ff3d00' },
  { id: 'galaxy', name: 'Galaxy', price: 130, body: '#5e35b1', accent: '#00e5ff', window: '#ff80ab', flame: '#b388ff' },
  { id: 'gold', name: 'Gold', price: 200, body: '#ffcf40', accent: '#fff6d5', window: '#80deea', flame: '#ffee58', metal: true },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) ?? SKINS[0];
