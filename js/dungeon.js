import * as THREE from 'three';
import { DUNGEONS, gearById } from './rewards.js';
import { canvasTexture, clamp01, glowTexture, labelTexture, lerp, rand } from './gfx.js';

// A blocky dungeon crawl. It answers the same calls as the space scene
// (spawnChoices, shoot, wrong, showBoss, ...) so missions can run in either.

const ROWS = 34; // corridor rows kept alive, recycled as the hero walks
const HALF = 4; // floor spans x = -HALF..HALF
const WALL_H = 4;
const SPAWN_Z = -14;
const REACH_Z = -1.6; // a monster this close has reached the hero
const BOSS_Z = -11;
const ENTER_TIME = 0.45;
const WALK_TIME = 0.55;
const WALK_TILES = 2.5;
const GOLD = 0xffc93c;
const MOB_COLORS = [0x6bcb77, 0xff6b6b, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x2ee6d6, 0xffd93d];
const CAMERA_HOME = new THREE.Vector3(0, 7.2, 7);
const LOOK_HOME = new THREE.Vector3(0, 0, -5);
// Armory close-up: in front of the hero, who sits in the top part of the screen.
const SHOWCASE_CAM = new THREE.Vector3(0, 2, -5.6);
const SHOWCASE_LOOK = new THREE.Vector3(0, 0.9, 0);
const SHOWCASE_SHIFT = 0.2;
const tmpColor = new THREE.Color();
const box = new THREE.BoxGeometry(1, 1, 1);
const easeOutBounce = (t) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
};

// Grayscale 16x16 pixel art, tinted per dungeon through material colors.
function pixelTexture(draw) {
  const tex = canvasTexture(16, draw);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const noise = (g, lo, hi) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = Math.round(rand(lo, hi));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
};

const stoneTexture = () =>
  pixelTexture((g) => {
    noise(g, 185, 245);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 15, 16, 1);
    g.fillRect(15, 0, 1, 16);
  });

const brickTexture = () =>
  pixelTexture((g) => {
    noise(g, 175, 240);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (const y of [0, 8]) g.fillRect(0, y, 16, 1);
    for (const [x, y] of [[0, 0], [8, 8]]) g.fillRect(x, y, 1, 8);
  });

const plankTexture = () =>
  pixelTexture((g) => {
    noise(g, 150, 200);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (const y of [0, 5, 10, 15]) g.fillRect(0, y, 16, 1);
  });

const part = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(box, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
};

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export class Dungeon {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    this.camera.position.copy(CAMERA_HOME);
    this.camLook = LOOK_HOME.clone();

    this.scene.add(new THREE.HemisphereLight(0xfff2dd, 0x3a3048, 1.7));
    const sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
    sun.position.set(3, 10, 6);
    this.scene.add(sun);
    this.lantern = new THREE.PointLight(0xffc27a, 14, 16, 1.4);
    this.scene.add(this.lantern);

    this.glow = glowTexture();
    this.shadowGeo = new THREE.PlaneGeometry(1.3, 1.3);
    this.textures = { stone: stoneTexture(), brick: brickTexture(), plank: plankTexture() };
    this.fx = [];
    this.timers = [];
    this.flames = [];
    this.time = 0;
    this.paused = false;
    this.wave = null;
    this.onTimeout = null;
    this.heat = 0;
    this.swing = 0;
    this.bonk = 0;
    this.walkLeft = 0;
    this.facing = 0;
    this.shakeAmount = 0;
    this.offsetY = 0;
    this.targetFrac = 0.84;
    this.showcase = false;
    this.theme = DUNGEONS[0];

    this.buildCorridor();
    this.buildDust();
    this.buildHero();
    this.buildBoss();
    this.buildChest();
    this.setWorld(0);

    this.clock = new THREE.Clock();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setActive(on) {
    this.renderer.setAnimationLoop(on ? () => this.tick() : null);
    this.clock.getDelta();
  }

  // ---------- layout ----------

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.clearViewOffset();
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(LOOK_HOME);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Where the hero lands on screen before any shifting.
    this.naturalFrac = (1 - new THREE.Vector3(0, 0.9, 0).project(this.camera).y) / 2;
  }

  // Shift the picture so the hero sits this far down the screen (keeps him above the keypad).
  setRocketAnchor(frac) {
    this.targetFrac = frac;
  }

  setShowcase(on) {
    if (on && !this.showcase) {
      // Jump straight to the close-up rather than gliding through the walls.
      this.camera.position.copy(SHOWCASE_CAM);
      this.camLook.copy(SHOWCASE_LOOK);
      this.offsetY = SHOWCASE_SHIFT * window.innerHeight;
    }
    this.showcase = on;
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  after(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  setWarp() {}

  setHeat(level) {
    this.heat = level;
  }

  // ---------- the corridor ----------

  buildCorridor() {
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.floorMat = lambert(0xffffff, { map: this.textures.stone });
    this.wallMat = lambert(0xffffff, { map: this.textures.brick });
    const perFloor = HALF * 2 + 1;
    this.floor = new THREE.InstancedMesh(box, this.floorMat, ROWS * perFloor);
    this.walls = new THREE.InstancedMesh(box, this.wallMat, ROWS * WALL_H * 2);
    this.world.add(this.floor, this.walls);
    this.rows = Array.from({ length: ROWS }, (_, i) => ({ z: 5 - i, decor: null }));
    this.decorMats = {
      crate: lambert(0xa0703c, { map: this.textures.plank }),
      stick: lambert(0x6d4c2f),
      flame: new THREE.MeshBasicMaterial({ color: 0xffb02e }),
      crystal: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 }),
      banner: lambert(0xffffff),
    };
  }

  layoutRow(i) {
    const row = this.rows[i];
    const m = new THREE.Matrix4();
    const t = this.theme;
    const perFloor = HALF * 2 + 1;
    for (let k = 0; k < perFloor; k++) {
      m.makeTranslation(k - HALF, -0.5, row.z);
      this.floor.setMatrixAt(i * perFloor + k, m);
      const shade = ((k + row.z) & 1 ? 0.88 : 1) * rand(0.85, 1.05);
      this.floor.setColorAt(i * perFloor + k, tmpColor.set(t.floor).multiplyScalar(shade));
    }
    const pillar = ((row.z % 6) + 6) % 6 === 0;
    for (const [s, side] of [[0, -1], [1, 1]]) {
      const height = pillar ? WALL_H : 2 + Math.floor(rand(0, 2.99));
      for (let y = 0; y < WALL_H; y++) {
        const idx = (i * 2 + s) * WALL_H + y;
        if (y < height) {
          m.makeTranslation(side * (HALF + 1), y + 0.5, row.z);
          const ore = !pillar && Math.random() < 0.06;
          const shade = (pillar ? 0.8 : 1) * rand(0.8, 1.05);
          this.walls.setColorAt(idx, ore ? tmpColor.set(t.glow) : tmpColor.set(t.wall).multiplyScalar(shade));
        } else {
          m.makeScale(0, 0, 0);
        }
        this.walls.setMatrixAt(idx, m);
      }
    }
    this.floor.instanceMatrix.needsUpdate = true;
    this.walls.instanceMatrix.needsUpdate = true;
    this.floor.instanceColor.needsUpdate = true;
    this.walls.instanceColor.needsUpdate = true;

    if (row.decor) {
      this.world.remove(row.decor);
      this.flames = this.flames.filter((f) => f.row !== row);
    }
    row.decor = this.makeDecor(row, pillar);
    if (row.decor) this.world.add(row.decor);
  }

  makeDecor(row, pillar) {
    const g = new THREE.Group();
    const side = Math.random() < 0.5 ? -1 : 1;
    const wallX = side * (HALF + 0.45);
    const roll = Math.random();
    if (pillar) {
      // Torches on every pillar, both sides.
      for (const s of [-1, 1]) {
        g.add(part(0.12, 0.5, 0.12, this.decorMats.stick, s * (HALF + 0.4), 2.2, row.z));
        const flame = part(0.2, 0.25, 0.2, this.decorMats.flame, s * (HALF + 0.4), 2.55, row.z);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffa040, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.copy(flame.position);
        halo.scale.setScalar(1.6);
        g.add(flame, halo);
        this.flames.push({ row, flame, halo, phase: rand(0, 9) });
      }
    } else if (roll < 0.12) {
      g.add(part(0.8, 0.8, 0.8, this.decorMats.crate, side * (HALF - 0.6), 0.4, row.z));
      if (Math.random() < 0.5) g.add(part(0.6, 0.6, 0.6, this.decorMats.crate, side * (HALF - 0.6), 1.1, row.z));
    } else if (roll < 0.22) {
      const crystal = part(0.25, rand(0.6, 1.2), 0.25, this.decorMats.crystal, side * (HALF - 0.3), 0.4, row.z);
      crystal.rotation.z = side * 0.3;
      g.add(crystal);
    } else if (roll < 0.28) {
      g.add(part(0.06, 1.2, 0.7, this.decorMats.banner, wallX, 2.2, row.z));
    } else {
      return null;
    }
    return g;
  }

  buildDust() {
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([rand(-HALF, HALF), rand(0, 5), rand(-26, 4)], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, map: this.glow, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.dust);
  }

  setWorld(index) {
    this.theme = DUNGEONS[index];
    const t = this.theme;
    this.scene.background = new THREE.Color(t.fog);
    this.scene.fog = new THREE.Fog(t.fog, 14, 30);
    this.decorMats.crystal.color.set(t.glow);
    this.decorMats.crystal.emissive.set(t.glow);
    this.decorMats.banner.color.set(t.glow).multiplyScalar(0.8);
    this.dust.material.color.set(t.glow);
    this.world.position.z = 0;
    this.rows.forEach((row, i) => {
      row.z = 5 - i;
      this.layoutRow(i);
    });
  }

  walk(tiles) {
    this.walkLeft += tiles;
  }

  updateCorridor(dt) {
    if (this.walkLeft > 0) {
      const step = Math.min(this.walkLeft, (dt * WALK_TILES) / WALK_TIME);
      this.walkLeft -= step;
      this.world.position.z += step;
      this.rows.forEach((row, i) => {
        if (row.z + this.world.position.z > 6) {
          row.z -= ROWS;
          this.layoutRow(i);
        }
      });
    }
    for (const f of this.flames) {
      const k = 0.85 + Math.sin(this.time * 18 + f.phase) * 0.1 + Math.random() * 0.08;
      f.flame.scale.set(0.2 * k, 0.25 * (k + 0.1), 0.2 * k);
      f.halo.material.opacity = 0.6 + k * 0.25;
    }
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.15;
      if (y > 5) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    this.dust.position.z = this.world.position.z % 1;
  }

  // ---------- hero ----------

  buildHero() {
    const hero = new THREE.Group();
    this.heroMats = {
      armor: lambert(0x8d6e63),
      dark: lambert(0x5d4037),
      skin: lambert(0xf1c27d),
      cape: lambert(0xb71c1c),
      plume: lambert(0xe53935),
      belt: lambert(0x4e342e),
      eye: new THREE.MeshBasicMaterial({ color: 0x2b1d14 }),
    };
    const M = this.heroMats;
    const limb = (x, y, w, h, d, mat) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(part(w, h, d, mat, 0, -h / 2, 0));
      hero.add(pivot);
      return pivot;
    };
    this.legL = limb(-0.13, 0.5, 0.22, 0.5, 0.24, M.dark);
    this.legR = limb(0.13, 0.5, 0.22, 0.5, 0.24, M.dark);
    hero.add(part(0.56, 0.6, 0.32, M.armor, 0, 0.8, 0));
    hero.add(part(0.58, 0.08, 0.34, M.belt, 0, 0.55, 0));
    this.armL = limb(-0.37, 1.05, 0.18, 0.55, 0.2, M.armor);
    this.armR = limb(0.37, 1.05, 0.18, 0.55, 0.2, M.armor);
    this.armL.add(part(0.16, 0.12, 0.18, M.skin, 0, -0.6, 0));
    this.armR.add(part(0.16, 0.12, 0.18, M.skin, 0, -0.6, 0));
    hero.add(part(0.42, 0.42, 0.42, M.skin, 0, 1.33, 0));
    hero.add(part(0.08, 0.08, 0.02, M.eye, -0.1, 1.36, -0.215), part(0.08, 0.08, 0.02, M.eye, 0.1, 1.36, -0.215));
    hero.add(part(0.48, 0.18, 0.48, M.armor, 0, 1.56, 0));
    hero.add(part(0.08, 0.22, 0.32, M.plume, 0, 1.75, 0.04));
    this.cape = new THREE.Group();
    this.cape.position.set(0, 1.08, 0.18);
    this.cape.add(part(0.5, 0.8, 0.05, M.cape, 0, -0.4, 0));
    hero.add(this.cape);

    this.weapon = new THREE.Group();
    this.weapon.position.set(0, -0.6, 0);
    this.weapon.rotation.x = -Math.PI / 2;
    this.armR.add(this.weapon);
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.aura.position.y = 0.7;
    this.weapon.add(this.aura);

    this.hero = hero;
    this.scene.add(hero);
  }

  setGear(weaponId, armorId) {
    const armor = gearById(armorId) ?? gearById('leather');
    const weapon = gearById(weaponId) ?? gearById('wood-sword');
    const M = this.heroMats;
    const shiny = (g) => g.rarity === 'legendary' || g.rarity === 'enchanted';
    M.armor.color.set(armor.color);
    M.armor.emissive.set(armor.color).multiplyScalar(shiny(armor) ? 0.25 : 0);
    M.dark.color.set(armor.color).multiplyScalar(0.6);
    M.cape.color.set(shiny(armor) ? '#6a1b9a' : '#b71c1c');

    for (const child of [...this.weapon.children]) if (child !== this.aura) this.weapon.remove(child);
    const blade = lambert(weapon.color, { emissive: weapon.color, emissiveIntensity: shiny(weapon) ? 0.5 : 0.1 });
    const wood = lambert(0x6d4c2f);
    const gold = lambert(0xffc93c);
    if (weapon.shape === 'axe') {
      this.weapon.add(part(0.06, 0.85, 0.06, wood, 0, 0.35, 0), part(0.34, 0.28, 0.05, blade, 0.13, 0.66, 0));
    } else if (weapon.shape === 'hammer') {
      this.weapon.add(part(0.06, 0.75, 0.06, wood, 0, 0.3, 0), part(0.38, 0.24, 0.24, blade, 0, 0.7, 0));
    } else {
      this.weapon.add(part(0.06, 0.2, 0.06, wood, 0, 0, 0), part(0.3, 0.06, 0.08, gold, 0, 0.12, 0), part(0.09, 0.75, 0.04, blade, 0, 0.52, 0));
    }
    this.weaponGear = weapon;
    this.slashColor = new THREE.Color(weapon.color);
  }

  weaponTip() {
    this.hero.updateMatrixWorld(true);
    return this.aura.getWorldPosition(new THREE.Vector3());
  }

  faceToward(target) {
    this.facing = Math.atan2(-(target.x - this.hero.position.x), -(target.z - this.hero.position.z));
  }

  updateHero(dt) {
    const h = this.hero;
    const walking = this.walkLeft > 0;
    const t = this.time;
    const stride = walking ? Math.sin(t * 13) * 0.7 : 0;
    this.legL.rotation.x = lerp(this.legL.rotation.x, stride, 0.3);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -stride, 0.3);
    this.armL.rotation.x = lerp(this.armL.rotation.x, -stride * 0.8, 0.3);
    h.position.y = walking ? Math.abs(Math.sin(t * 13)) * 0.08 : Math.sin(t * 2.5) * 0.02;
    this.cape.rotation.x = 0.15 + (walking ? 0.25 : 0) + Math.sin(t * 3) * 0.06;

    // Sword swing: wind up, then chop forward.
    if (this.swing > 0) {
      this.swing += dt / 0.24;
      const s = Math.min(1, this.swing);
      this.armR.rotation.x = s < 0.35 ? lerp(-0.5, -2.9, s / 0.35) : lerp(-2.9, 0.5, (s - 0.35) / 0.65);
      if (this.swing >= 1) this.swing = 0;
    } else {
      this.armR.rotation.x = lerp(this.armR.rotation.x, -0.5 + stride * 0.3, 0.2);
    }

    if (this.showcase) {
      h.rotation.y = Math.sin(t * 0.7) * 0.6;
    } else {
      this.facing = lerp(this.facing, 0, Math.min(1, dt * 2.5));
      h.rotation.y = this.facing;
    }

    this.bonk = Math.max(0, this.bonk - dt * 2);
    h.position.z = this.bonk * 0.5;
    this.heroMats.skin.emissive.setRGB(this.bonk * 0.8, 0, 0);

    const a = this.aura;
    a.visible = this.heat > 0;
    if (this.heat === 2) a.material.color.setHSL((t * 0.8) % 1, 1, 0.6);
    else if (this.heat === 1) a.material.color.setHSL(0.06 + Math.random() * 0.04, 1, 0.55);
    a.scale.setScalar((this.heat === 2 ? 1.3 : 1) * (0.9 + Math.random() * 0.25));
    this.lantern.position.set(h.position.x, 3, h.position.z - 4);
  }

  // ---------- monsters ----------

  mobMat(color, golden) {
    return golden
      ? new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.8, roughness: 0.3, emissive: GOLD, emissiveIntensity: 0.3 })
      : lambert(color);
  }

  makeMob(value, kind, color, golden = false) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const main = this.mobMat(color, golden);
    const eye = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
    const mats = [main];
    body.scale.setScalar(1.35);
    const mob = { group: g, body, value, kind, color: golden ? GOLD : color, golden, alive: true, wiggle: 0, phase: rand(0, 9), mats, height: 1 };
    if (kind === 'slime') {
      main.transparent = true;
      main.opacity = 0.78;
      body.add(part(0.95, 0.95, 0.95, main, 0, 0.48, 0));
      const core = lambert(new THREE.Color(color).multiplyScalar(0.6));
      mats.push(core);
      body.add(part(0.45, 0.45, 0.45, core, 0, 0.42, 0));
      body.add(part(0.14, 0.14, 0.04, eye, -0.2, 0.62, 0.49), part(0.14, 0.14, 0.04, eye, 0.2, 0.62, 0.49), part(0.26, 0.07, 0.04, eye, 0, 0.36, 0.49));
      mob.height = 1;
    } else if (kind === 'shroom') {
      const stem = lambert(0xf5ead6);
      body.add(part(0.42, 0.55, 0.42, stem, 0, 0.3, 0));
      body.add(part(0.95, 0.4, 0.95, main, 0, 0.75, 0));
      const dot = lambert(0xffffff);
      body.add(part(0.18, 0.06, 0.18, dot, -0.22, 0.96, 0.15), part(0.14, 0.06, 0.14, dot, 0.25, 0.96, -0.2), part(0.16, 0.16, 0.04, dot, 0.15, 0.78, 0.48));
      body.add(part(0.1, 0.12, 0.04, eye, -0.1, 0.38, 0.22), part(0.1, 0.12, 0.04, eye, 0.1, 0.38, 0.22));
      mob.height = 1.05;
    } else if (kind === 'bat') {
      body.position.y = 1.2;
      body.add(part(0.42, 0.36, 0.36, main, 0, 0, 0));
      const red = new THREE.MeshBasicMaterial({ color: 0xff3d3d });
      body.add(part(0.09, 0.09, 0.04, red, -0.1, 0.05, 0.19), part(0.09, 0.09, 0.04, red, 0.1, 0.05, 0.19));
      body.add(part(0.1, 0.14, 0.1, main, -0.14, 0.24, 0), part(0.1, 0.14, 0.1, main, 0.14, 0.24, 0));
      mob.wings = [-1, 1].map((s) => {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.2, 0.05, 0);
        pivot.add(part(0.55, 0.05, 0.34, main, s * 0.28, 0, 0));
        body.add(pivot);
        return pivot;
      });
      mob.height = 1.6;
    } else {
      // Skeleton: carries the "?" for typed answers.
      const bone = golden ? main : lambert(0xe8e4d8);
      if (!golden) mats.push(bone);
      const dark = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
      mob.legs = [-0.12, 0.12].map((x) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.55, 0);
        pivot.add(part(0.12, 0.55, 0.12, bone, 0, -0.27, 0));
        body.add(pivot);
        return pivot;
      });
      body.add(part(0.44, 0.5, 0.22, bone, 0, 0.82, 0));
      for (const y of [0.72, 0.84, 0.96]) body.add(part(0.46, 0.04, 0.24, dark, 0, y, 0));
      body.add(part(0.12, 0.5, 0.12, bone, -0.3, 0.82, 0.05), part(0.12, 0.5, 0.12, bone, 0.3, 0.82, 0.05));
      body.add(part(0.42, 0.4, 0.4, bone, 0, 1.3, 0));
      body.add(part(0.12, 0.12, 0.04, dark, -0.1, 1.33, 0.2), part(0.12, 0.12, 0.04, dark, 0.1, 1.33, 0.2), part(0.2, 0.05, 0.04, dark, 0, 1.18, 0.2));
      mob.height = 1.55;
    }
    const shadow = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ map: this.glow, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);
    mob.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(String(value)), depthTest: false, transparent: true }));
    mob.label.scale.setScalar(1.75);
    mob.height *= 1.35;
    mob.label.position.y = mob.height + 0.75;
    mob.label.renderOrder = 10;
    g.add(mob.label);
    if (golden) {
      mob.sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: GOLD, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      mob.sparkle.position.y = mob.height / 2;
      mob.sparkle.scale.setScalar(2.4);
      g.add(mob.sparkle);
    }
    this.scene.add(g);
    return mob;
  }

  spawnChoices(values, duration, golden = false) {
    const n = values.length;
    const span = Math.min(6.6, n * 2.1);
    const kinds = ['slime', 'shroom', 'bat'];
    const colors = [...MOB_COLORS].sort(() => Math.random() - 0.5);
    const mobs = values.map((value, i) => {
      const m = this.makeMob(value, kinds[Math.floor(Math.random() * kinds.length)], colors[i], golden);
      m.x = -span / 2 + (span * (i + 0.5)) / n;
      return m;
    });
    this.startWave(mobs, duration);
    return mobs;
  }

  spawnTarget(duration, golden = false) {
    const m = this.makeMob('?', 'skeleton', 0xe8e4d8, golden);
    m.x = 0;
    this.startWave([m], duration);
    return m;
  }

  startWave(mobs, duration) {
    this.clearWave();
    const walking = !this.boss.active;
    if (walking) this.walk(WALK_TILES);
    const startZ = this.boss.active ? -7.5 : SPAWN_Z;
    mobs.forEach((m, i) => {
      m.startZ = startZ + (i % 2) * 0.8;
      m.group.position.set(m.x, 6, m.startZ);
      m.group.visible = false;
    });
    this.wave = { asteroids: mobs, elapsed: walking ? -WALK_TIME : 0, duration: duration / 1000, timedOut: false, landed: false };
  }

  setLabel(m, text) {
    m.label.material.map = labelTexture(text);
    m.label.material.needsUpdate = true;
  }

  waveMs() {
    return this.wave ? Math.max(0, (this.wave.elapsed - ENTER_TIME) * 1000) : 0;
  }

  find(value) {
    return this.wave?.asteroids.find((m) => m.alive && m.value === value);
  }

  pick(clientX, clientY) {
    if (!this.wave || this.wave.elapsed < ENTER_TIME * 0.5) return null;
    let best = null;
    let bestD = Infinity;
    for (const m of this.wave.asteroids) {
      if (!m.alive) continue;
      // Tapping the monster or the number above it both count.
      const p = m.group.position;
      const spots = [new THREE.Vector3(p.x, p.y + m.height * 0.5, p.z), new THREE.Vector3(p.x, p.y + m.label.position.y, p.z)];
      for (const s of spots) {
        const sp = this.toScreen(s);
        const d = Math.hypot(sp.x - clientX, sp.y - clientY);
        if (d < 64 && d < bestD) {
          best = m;
          bestD = d;
        }
      }
    }
    return best;
  }

  updateWave(dt) {
    const w = this.wave;
    if (!w) return;
    if (!this.paused) w.elapsed += dt;
    const p = clamp01((w.elapsed - ENTER_TIME) / w.duration);
    const t = this.time;
    for (const m of w.asteroids) {
      if (!m.group.parent) continue;
      if (w.elapsed < 0) continue;
      m.group.visible = true;
      const enter = clamp01(w.elapsed / ENTER_TIME);
      const y = (1 - easeOutBounce(enter)) * 6;
      const z = lerp(m.startZ, REACH_Z, p);
      const x = lerp(m.x, m.x * 0.35, p);
      m.group.position.set(x, y, z);
      if (m.kind === 'slime') {
        const hop = Math.abs(Math.sin(t * 7 + m.phase));
        m.body.position.y = hop * 0.35;
        const squash = (1 - hop) * 0.15;
        m.body.scale.set(1.35 * (1 + squash), 1.35 * (1 - squash), 1.35 * (1 + squash));
      } else if (m.kind === 'shroom') {
        m.body.rotation.z = Math.sin(t * 6 + m.phase) * 0.18;
      } else if (m.kind === 'bat') {
        m.body.position.y = 1.2 + Math.sin(t * 4 + m.phase) * 0.2;
        m.wings.forEach((wing, i) => (wing.rotation.z = (i ? -1 : 1) * Math.sin(t * 22 + m.phase) * 0.7));
      } else if (m.legs) {
        m.legs.forEach((leg, i) => (leg.rotation.x = (i ? 1 : -1) * Math.sin(t * 8 + m.phase) * 0.5));
      }
      if (m.wiggle > 0) {
        m.wiggle = Math.max(0, m.wiggle - dt);
        m.body.rotation.y = (1 - m.wiggle / 0.6) * Math.PI * 2;
      }
      if (m.highlight) m.label.scale.setScalar(1.75 * (1.15 + Math.sin(t * 8) * 0.15));
      if (m.sparkle) m.sparkle.material.opacity = 0.4 + Math.sin(t * 6 + m.phase) * 0.25;
    }
    if (!w.landed && w.elapsed >= ENTER_TIME) {
      w.landed = true;
      for (const m of w.asteroids) this.puff(m.group.position, 0xcfc6b8, 0.5);
    }
    if (p >= 1 && !w.timedOut && !this.paused) {
      w.timedOut = true;
      this.bonk = 1;
      this.shakeAmount = 0.25;
      this.onTimeout?.();
    }
  }

  removeMob(m) {
    m.alive = false;
    this.scene.remove(m.group);
    m.group.traverse((o) => {
      if (o.geometry && o.geometry !== box && o.geometry !== this.shadowGeo) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  clearWave() {
    if (!this.wave) return;
    for (const m of this.wave.asteroids) if (m.group.parent) this.removeMob(m);
    this.wave = null;
  }

  // The other monsters run off into the dark.
  dismissOthers(keep) {
    for (const m of this.wave?.asteroids ?? []) {
      if (m === keep || !m.alive) continue;
      m.alive = false;
      const start = m.group.position.clone();
      this.addFx(0.4, (t) => {
        m.group.position.set(start.x + Math.sign(start.x || 1) * t * 4, start.y + Math.sin(t * Math.PI) * 0.8, start.z - t * 3);
        m.group.scale.setScalar(1 - t);
      }, () => this.removeMob(m));
    }
  }

  wrong(m) {
    if (!m) return;
    m.wiggle = 0.6;
    for (const mat of m.mats) mat.color?.lerp(tmpColor.set(0x555566), 0.6);
    this.shakeAmount = Math.max(this.shakeAmount, 0.12);
  }

  highlight(m) {
    if (!m) return;
    m.highlight = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    m.group.add(ring);
  }

  shoot(m, onHit) {
    if (!m?.group.parent) {
      onHit?.();
      return;
    }
    this.dismissOthers(m);
    m.alive = false;
    if (this.wave) this.wave.timedOut = true;
    const target = () => m.group.position.clone().add(new THREE.Vector3(0, m.height * 0.5, 0));
    this.faceToward(m.group.position);
    this.swing = 0.001;
    this.after(0.1, () =>
      this.slash(this.weaponTip(), target, this.slashColor, 0.16, () => {
        const at = target();
        this.voxelBurst(at, m.color, 1);
        this.gemsToHero(at, m.golden ? 6 : 2);
        this.removeMob(m);
        if (this.wave?.asteroids.every((r) => !r.group.parent)) this.wave = null;
        this.shakeAmount = Math.max(this.shakeAmount, 0.2);
        onHit?.(this.toScreen(at));
      }),
    );
  }

  // ---------- effects ----------

  addFx(duration, update, done, obj) {
    this.fx.push({ t: 0, duration, update, done, obj });
  }

  disposeFx(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o.geometry && o.geometry !== box) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  // A glowing crescent that flies from the weapon to the target.
  slash(from, getTarget, color, duration, onArrive) {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.09, 6, 20, Math.PI),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.6);
    g.add(arc, halo);
    g.position.copy(from);
    this.scene.add(g);
    this.addFx(
      duration,
      (t) => {
        const to = getTarget();
        g.position.lerpVectors(from, to, t);
        arc.rotation.z = -t * 6;
        g.scale.setScalar(1 + t * 0.6);
      },
      onArrive,
      g,
    );
  }

  // The signature effect: things break into little bouncing cubes.
  voxelBurst(at, color, size = 1) {
    const g = new THREE.Group();
    const mats = [lambert(color), lambert(new THREE.Color(color).multiplyScalar(0.65)), lambert(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4))];
    const cubes = [];
    const n = Math.round(16 * size);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(box, mats[i % 3]);
      const s = rand(0.12, 0.24) * Math.sqrt(size);
      c.scale.setScalar(s);
      c.position.copy(at);
      c.userData = { v: new THREE.Vector3(rand(-3, 3), rand(2, 6), rand(-2, 3)).multiplyScalar(Math.sqrt(size)), spin: rand(-8, 8), s };
      cubes.push(c);
      g.add(c);
    }
    this.scene.add(g);
    this.puff(at, 0xffffff, size);
    let last = 0;
    this.addFx(
      1.2,
      (t) => {
        const dt = (t - last) * 1.2;
        last = t;
        for (const c of cubes) {
          const { v } = c.userData;
          v.y -= 18 * dt;
          c.position.addScaledVector(v, dt);
          if (c.position.y < c.userData.s / 2) {
            c.position.y = c.userData.s / 2;
            v.y *= -0.35;
            v.x *= 0.7;
            v.z *= 0.7;
          }
          c.rotation.x += c.userData.spin * dt;
          c.rotation.y += c.userData.spin * dt;
          c.scale.setScalar(c.userData.s * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1));
        }
      },
      null,
      g,
    );
  }

  puff(at, color, size = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.7, depthWrite: false }));
    s.position.copy(at);
    this.scene.add(s);
    this.addFx(0.5, (t) => {
      s.scale.setScalar((0.8 + t * 2.2) * size);
      s.material.opacity = 0.7 * (1 - t);
    }, null, s);
  }

  // Little gems hop from a beaten monster to the hero.
  gemsToHero(at, count) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 0.6 });
    const geo = new THREE.OctahedronGeometry(0.14);
    const g = new THREE.Group();
    const gems = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.userData.off = new THREE.Vector3(rand(-0.8, 0.8), rand(0.5, 1.5), rand(-0.5, 0.5));
      g.add(m);
      return m;
    });
    this.scene.add(g);
    this.addFx(0.8, (t) => {
      const hero = this.hero.position.clone().add(new THREE.Vector3(0, 1, 0));
      for (const m of gems) {
        const k = Math.max(0, (t - 0.25) / 0.75);
        const mid = at.clone().add(m.userData.off);
        m.position.lerpVectors(t < 0.25 ? at : mid, t < 0.25 ? mid : hero, t < 0.25 ? t / 0.25 : k * k);
        m.rotation.y += 0.3;
      }
    }, null, g);
  }

  celebrate(count = 8) {
    for (let i = 0; i < count; i++) {
      this.after(i * 0.2, () => {
        const at = new THREE.Vector3(rand(-3, 3), rand(2, 4.5), rand(-12, -6));
        this.voxelBurst(at, MOB_COLORS[i % MOB_COLORS.length], rand(0.8, 1.3));
      });
    }
  }

  // ---------- boss: a block golem ----------

  buildBoss() {
    const g = new THREE.Group();
    this.bossMat = new THREE.MeshLambertMaterial({ color: 0x6b8f3a, emissive: 0xffffff, emissiveIntensity: 0 });
    this.bossDark = lambert(0x3e5222);
    this.bossEye = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    const gold = lambert(0xffc93c, { emissive: 0xffc93c, emissiveIntensity: 0.3 });
    g.add(part(0.75, 1.1, 0.75, this.bossDark, -0.55, 0.55, 0), part(0.75, 1.1, 0.75, this.bossDark, 0.55, 0.55, 0));
    g.add(part(2.1, 1.5, 1.15, this.bossMat, 0, 1.85, 0));
    g.add(part(0.5, 0.4, 0.06, this.bossDark, -0.5, 2.1, 0.6), part(0.4, 0.3, 0.06, this.bossDark, 0.6, 1.6, 0.6));
    this.bossArms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.35, 2.45, 0);
      pivot.add(part(0.6, 1.5, 0.6, this.bossMat, 0, -0.7, 0), part(0.8, 0.6, 0.8, this.bossDark, 0, -1.6, 0));
      g.add(pivot);
      return pivot;
    });
    g.add(part(1.05, 0.95, 0.95, this.bossMat, 0, 3.1, 0));
    g.add(part(0.26, 0.16, 0.05, this.bossEye, -0.25, 3.18, 0.48), part(0.26, 0.16, 0.05, this.bossEye, 0.25, 3.18, 0.48));
    g.add(part(1.1, 0.12, 0.06, this.bossDark, 0, 3.36, 0.48), part(0.5, 0.1, 0.05, this.bossDark, 0, 2.86, 0.48));
    g.add(part(1.15, 0.2, 1.05, gold, 0, 3.66, 0));
    for (const x of [-0.45, -0.15, 0.15, 0.45]) g.add(part(0.16, 0.3, 0.16, gold, x, 3.9, 0.35));
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffe14d, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    eyeGlow.position.set(0, 3.18, 0.6);
    eyeGlow.scale.set(1.8, 0.8, 1);
    g.add(eyeGlow);
    this.bossEyeGlow = eyeGlow;
    g.visible = false;
    this.scene.add(g);
    this.boss = { group: g, active: false, rise: 0, knock: 0, flash: 0, slam: 0, sink: 0, escape: false };
  }

  showBoss(color = 0x6b8f3a) {
    const b = this.boss;
    const c = new THREE.Color(this.theme.boss.color ?? color);
    this.bossMat.color.copy(c);
    this.bossDark.color.copy(c).multiplyScalar(0.55);
    this.bossEye.color.set(this.theme.glow);
    this.bossEyeGlow.material.color.set(this.theme.glow);
    Object.assign(b, { active: true, rise: 0.001, knock: 0, flash: 0, slam: 0, sink: 0, escape: false });
    b.group.visible = true;
    b.group.scale.setScalar(0.85);
    b.group.rotation.set(0, 0, 0);
    b.group.position.set(0, -4.5, BOSS_Z);
    this.chest.visible = false;
    this.shakeAmount = 0.4;
    for (let i = 0; i < 5; i++) this.after(i * 0.2, () => this.voxelBurst(new THREE.Vector3(rand(-1.5, 1.5), 0.2, BOSS_Z + rand(-0.5, 1)), new THREE.Color(this.theme.floor).getHex(), 0.7));
  }

  bossScreen() {
    return this.toScreen(this.boss.group.position.clone().add(new THREE.Vector3(0, 3.4, 0)));
  }

  hideBoss() {
    this.boss.active = false;
    this.boss.group.visible = false;
  }

  hitBoss(onHit) {
    const b = this.boss;
    const target = () => b.group.position.clone().add(new THREE.Vector3(0, 2.2, 0.6));
    this.after(0.12, () => {
      this.faceToward(b.group.position);
      this.swing = 0.001;
      this.after(0.1, () =>
        this.slash(this.weaponTip(), target, this.slashColor, 0.3, () => {
          this.voxelBurst(target(), this.bossMat.color.getHex(), 0.9);
          b.flash = 1;
          b.knock = 0.8;
          this.shakeAmount = Math.max(this.shakeAmount, 0.3);
          onHit?.();
        }),
      );
    });
  }

  // The golem slams the floor and a shockwave rolls out to the hero.
  bossAttack(onHit) {
    const b = this.boss;
    b.slam = 1;
    this.after(0.35, () => {
      this.shakeAmount = 0.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.1, 40),
        new THREE.MeshBasicMaterial({ color: this.theme.glow, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.05, b.group.position.z + 1);
      this.scene.add(ring);
      const fromZ = ring.position.z;
      this.addFx(0.5, (t) => {
        ring.position.z = lerp(fromZ, 0, t);
        ring.scale.setScalar(1 + t * 1.5);
      }, () => {
        this.bonk = 1;
        this.voxelBurst(new THREE.Vector3(0, 0.6, 0.2), new THREE.Color(this.theme.glow).getHex(), 0.5);
        onHit?.();
      }, ring);
    });
  }

  defeatBoss(onDone) {
    const b = this.boss;
    for (let i = 0; i < 8; i++) {
      this.after(i * 0.17, () => {
        const at = b.group.position.clone().add(new THREE.Vector3(rand(-1.2, 1.2), rand(0.5, 3.5), 0.6));
        this.voxelBurst(at, i % 2 ? this.bossMat.color.getHex() : MOB_COLORS[i % MOB_COLORS.length], 1.1);
        this.shakeAmount = 0.35;
        b.flash = 1;
      });
    }
    this.after(1.35, () => {
      this.voxelBurst(b.group.position.clone().add(new THREE.Vector3(0, 2, 0)), this.bossMat.color.getHex(), 3);
      this.hideBoss();
      this.openChest();
    });
    this.after(2.4, () => onDone?.());
  }

  bossEscape() {
    this.boss.escape = true;
    this.after(1.6, () => this.hideBoss());
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b.group.visible) return;
    const t = this.time;
    let y = 0;
    if (b.rise > 0 && b.rise < 1) {
      b.rise = Math.min(1, b.rise + dt / 1.2);
      y = -4.5 * (1 - b.rise);
    }
    if (b.escape) {
      b.sink = Math.min(1, b.sink + dt / 1.5);
      y = -5 * b.sink;
    }
    b.knock = Math.max(0, b.knock - dt * 2);
    b.group.position.set(Math.sin(t * 0.6) * 0.8, y, BOSS_Z - b.knock);
    b.group.rotation.y = Math.sin(t * 0.9) * 0.15;
    if (b.slam > 0) {
      b.slam = Math.max(0, b.slam - dt * 2.2);
      const raise = b.slam > 0.5 ? (1 - b.slam) * 2 : b.slam * 2;
      this.bossArms.forEach((a) => (a.rotation.x = -raise * 2.6));
    } else {
      this.bossArms.forEach((a, i) => (a.rotation.x = Math.sin(t * 1.6 + i * Math.PI) * 0.25));
    }
    b.flash = Math.max(0, b.flash - dt * 3);
    this.bossMat.emissiveIntensity = b.flash * 0.8;
    this.bossEyeGlow.material.opacity = 0.45 + Math.sin(t * 5) * 0.2;
  }

  // ---------- treasure chest ----------

  buildChest() {
    const g = new THREE.Group();
    const wood = lambert(0x8d5a2b, { map: this.textures.plank });
    const gold = lambert(0xffc93c, { emissive: 0xffc93c, emissiveIntensity: 0.25 });
    g.add(part(1.3, 0.8, 0.85, wood, 0, 0.4, 0));
    g.add(part(1.34, 0.12, 0.89, gold, 0, 0.7, 0), part(0.12, 0.82, 0.89, gold, -0.45, 0.4, 0), part(0.12, 0.82, 0.89, gold, 0.45, 0.4, 0));
    this.chestLid = new THREE.Group();
    this.chestLid.position.set(0, 0.8, -0.43);
    this.chestLid.add(part(1.3, 0.35, 0.85, wood, 0, 0.17, 0.43), part(0.22, 0.25, 0.08, gold, 0, 0.05, 0.88));
    g.add(this.chestLid);
    this.chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffe082, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.chestGlow.position.y = 1.2;
    this.chestGlow.scale.setScalar(4);
    g.add(this.chestGlow);
    g.visible = false;
    this.chest = g;
    this.scene.add(g);
  }

  openChest() {
    const c = this.chest;
    c.visible = true;
    c.position.set(0, 6, -8);
    this.chestLid.rotation.x = 0;
    this.chestGlow.material.opacity = 0;
    this.addFx(0.5, (t) => (c.position.y = (1 - easeOutBounce(t)) * 6), () => {
      this.puff(c.position, 0xcfc6b8, 1.2);
      this.addFx(0.4, (t) => {
        this.chestLid.rotation.x = -t * 1.9;
        this.chestGlow.material.opacity = t;
      }, () => {
        for (let i = 0; i < 3; i++) this.after(i * 0.15, () => this.voxelBurst(c.position.clone().add(new THREE.Vector3(0, 1, 0)), GOLD, 1));
      });
    });
  }

  // ---------- frame loop ----------

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.updateCorridor(dt);
    this.updateHero(dt);
    this.updateWave(dt);
    this.updateBoss(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      f.update?.(clamp01(f.t / f.duration));
      if (f.t >= f.duration) {
        this.fx.splice(i, 1);
        if (f.obj) this.disposeFx(f.obj);
        f.done?.();
      }
    }
    const due = this.timers.filter((t) => t.at <= this.time);
    if (due.length) {
      this.timers = this.timers.filter((t) => t.at > this.time);
      due.forEach((t) => t.fn());
    }

    const cam = this.camera;
    if (this.showcase) {
      cam.position.lerp(SHOWCASE_CAM, Math.min(1, dt * 4));
      this.camLook.lerp(SHOWCASE_LOOK, Math.min(1, dt * 4));
      this.offsetY = lerp(this.offsetY, SHOWCASE_SHIFT * window.innerHeight, Math.min(1, dt * 4));
    } else {
      cam.position.lerp(CAMERA_HOME, Math.min(1, dt * 4));
      this.camLook.lerp(LOOK_HOME, Math.min(1, dt * 4));
      this.offsetY = lerp(this.offsetY, (this.naturalFrac - this.targetFrac) * window.innerHeight, Math.min(1, dt * 5));
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.9);
    const s = this.shakeAmount;
    cam.position.x += rand(-s, s) * 0.5;
    cam.lookAt(this.camLook);
    cam.setViewOffset(window.innerWidth, window.innerHeight, 0, this.offsetY, window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, cam);
    cam.position.x = lerp(cam.position.x, 0, 0.5);
  }

  reset() {
    this.clearWave();
    this.timers = [];
    this.hideBoss();
    this.chest.visible = false;
    this.paused = false;
    this.heat = 0;
    this.bonk = 0;
    this.swing = 0;
    this.showcase = false;
  }
}
