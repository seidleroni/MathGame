import * as THREE from 'three';

// Small helpers shared by the space and dungeon scenes.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
export const rand = (a, b) => a + Math.random() * (b - a);

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const glowTexture = () =>
  canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

// Big outlined numbers for answer labels, cached because they repeat a lot.
const labels = new Map();
export function labelTexture(text) {
  if (!labels.has(text)) {
    labels.set(
      text,
      canvasTexture(256, (g, s) => {
        g.font = `700 ${text.length > 1 ? 150 : 180}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 26;
        g.strokeStyle = '#1b1240';
        g.strokeText(text, s / 2, s / 2 + 8);
        g.fillStyle = '#ffffff';
        g.fillText(text, s / 2, s / 2 + 8);
      }),
    );
  }
  return labels.get(text);
}
