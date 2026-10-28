import * as THREE from 'three';
import { WORLDS } from './facts.js';
import { skinById } from './skins.js';

const CAMERA_Z = 12;
const MIN_VIEW_WIDTH = 7.2;
const ROCK_COLORS = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff, 0xff9f1c, 0x2ee6d6];
const ENTER_TIME = 0.45;
const GOLD = 0xffc93c;
const tmpColor = new THREE.Color();

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTexture = () =>
  canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

function planetTexture(world) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = world.color;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = rand(0.12, 0.3);
      g.fillStyle = i % 2 ? world.accent : '#000';
      g.fillRect(0, rand(0, s), s, rand(4, 26));
    }
    for (let i = 0; i < 18; i++) {
      g.globalAlpha = rand(0.1, 0.25);
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(rand(0, s), rand(0, s), rand(3, 14), 0, Math.PI * 2);
      g.fill();
    }
  });
}

// Everything 3D: the space backdrop, the player's rocket, number asteroids,
// lasers, explosions and the boss. The DOM UI drives it through this API.
export class Space {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a24);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.camera.position.set(0, 0, CAMERA_Z);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x2a1050, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(4, 6, 8);
    this.scene.add(sun);

    this.glow = glowTexture();
    this.labels = new Map();
    this.fx = [];
    this.timers = [];
    this.time = 0;
    this.speed = 1;
    this.heat = 0;
    this.warp = 1;
    this.shakeAmount = 0;
    this.paused = false;
    this.wave = null;
    this.onTimeout = null;
    this.rocketAnchor = { frac: 0.55, scale: 1.3 };
    this.aim = 0;
    this.wobble = 0;
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.ballGeo = new THREE.SphereGeometry(1, 16, 12);

    this.buildStars();
    this.buildNebula();
    this.buildRocket();
    this.buildTrail();
    this.buildBoss();
    this.setWorld(0);

    this.clock = new THREE.Clock();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------- layout ----------

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    let viewH = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(25));
    // Narrow portrait screens: widen the view so asteroids still fit.
    if (viewH * aspect < MIN_VIEW_WIDTH) viewH = MIN_VIEW_WIDTH / aspect;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewH / 2 / CAMERA_Z));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewH = viewH;
    this.viewW = viewH * aspect;
    this.placePlanet();
  }

  // World y (at z = 0) of a point this fraction of the way down the screen.
  worldY(frac) {
    return (0.5 - frac) * this.viewH;
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  setRocketAnchor(frac, scale) {
    this.rocketAnchor = { frac, scale };
  }

  get rocketY() {
    return this.worldY(this.rocketAnchor.frac);
  }

  setWarp(w) {
    this.warp = w;
  }

  after(seconds, fn) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  // ---------- backdrop ----------

  buildStars() {
    const count = 1600;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos.set([rand(-45, 45), rand(-60, 60), rand(-80, -4)], i * 3);
      c.setHSL(rand(0.5, 0.75), rand(0.2, 0.8), rand(0.7, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.35,
      map: this.glow,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildNebula() {
    this.nebula = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      s.position.set(rand(-25, 25), rand(-18, 18), -70);
      s.scale.setScalar(rand(35, 55));
      this.nebula.push(s);
      this.scene.add(s);
    }
    this.planet = new THREE.Group();
    this.planetBall = new THREE.Mesh(new THREE.SphereGeometry(7, 48, 32), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    this.planetRing = new THREE.Mesh(
      new THREE.RingGeometry(9, 12.5, 64),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.55 }),
    );
    this.planetRing.rotation.x = -1.2;
    this.planet.add(this.planetBall, this.planetRing);
    this.planet.rotation.z = 0.3;
    this.scene.add(this.planet);
  }

  placePlanet() {
    const depth = CAMERA_Z + 55;
    const h = this.viewH * (depth / CAMERA_Z);
    this.planet.position.set(h * this.camera.aspect * 0.32, h * 0.22, -55);
  }

  setWorld(index) {
    const world = WORLDS[index];
    this.planetBall.material.map?.dispose();
    this.planetBall.material.map = planetTexture(world);
    this.planetBall.material.needsUpdate = true;
    this.planetRing.material.color.set(world.accent);
    this.planetRing.visible = !!world.ring;
    const hues = [world.color, world.accent, '#5b3cc4', '#1c6dd0'];
    this.nebula.forEach((s, i) => s.material.color.set(hues[i]));
  }

  // ---------- rocket ----------

  buildRocket() {
    this.rocket = new THREE.Group();
    this.rocketBody = new THREE.Group();
    this.rocket.add(this.rocketBody);
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 });
    this.accentMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15 });
    this.windowMat = new THREE.MeshStandardMaterial({ roughness: 0.1, emissiveIntensity: 0.7 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x8890a0, roughness: 0.3, metalness: 0.8 });

    const bodyProfile = [
      [0, -0.6], [0.3, -0.6], [0.39, -0.4], [0.43, -0.1], [0.43, 0.3], [0.37, 0.6],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.rocketBody.add(new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 32), this.bodyMat));
    const noseProfile = [[0.37, 0.6], [0.3, 0.85], [0.17, 1.05], [0.0, 1.2]].map(([x, y]) => new THREE.Vector2(x, y));
    this.rocketBody.add(new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 32), this.accentMat));

    const porthole = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), this.windowMat);
    porthole.scale.z = 0.5;
    porthole.position.set(0, 0.22, 0.41);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 24), metal);
    rim.position.copy(porthole.position);
    this.rocketBody.add(porthole, rim);

    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0.15);
    finShape.lineTo(0.38, -0.35);
    finShape.lineTo(0.38, -0.7);
    finShape.lineTo(0, -0.5);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: false });
    finGeo.translate(0.33, 0, -0.03);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, this.accentMat);
      fin.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
      this.rocketBody.add(fin);
    }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.2, 20), metal);
    nozzle.position.y = -0.68;
    this.rocketBody.add(nozzle);

    this.flameMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.9, 16, 1, true), this.flameMat);
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -1.2;
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.55, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    core.position.y = 0.15;
    this.flame.add(core);
    this.rocket.add(this.flame);

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x7cf7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.rocket.add(this.shield);
    this.scene.add(this.rocket);
  }

  setSkin(id) {
    const skin = skinById(id);
    this.skin = skin;
    this.bodyMat.color.set(skin.body);
    this.bodyMat.metalness = skin.metal ? 0.75 : 0.15;
    this.accentMat.color.set(skin.accent);
    this.windowMat.color.set(skin.window);
    this.windowMat.emissive.set(skin.window);
    this.flameMat.color.set(skin.flame);
    this.trailColor = new THREE.Color(skin.flame);
  }

  noseWorld() {
    const s = this.rocket.scale.x;
    const r = this.rocket.rotation.z;
    return new THREE.Vector3(this.rocket.position.x - Math.sin(r) * 1.2 * s, this.rocket.position.y + Math.cos(r) * 1.2 * s, 0.2);
  }

  buildTrail() {
    const n = 120;
    this.trail = { n, next: 0, life: new Float32Array(n), vel: new Float32Array(n * 2), emit: 0 };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.trailPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.5, map: this.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.trailPoints);
  }

  // Streak flair: 0 = normal, 1 = on fire, 2 = rainbow.
  setHeat(level) {
    this.heat = level;
    this.trailPoints.material.size = [0.5, 0.75, 0.85][level];
  }

  updateTrail(dt) {
    const t = this.trail;
    const pos = this.trailPoints.geometry.attributes.position;
    const col = this.trailPoints.geometry.attributes.color;
    t.emit += dt * (this.heat ? 110 : 70);
    const s = this.rocket.scale.x;
    const r = this.rocket.rotation.z;
    while (t.emit >= 1) {
      t.emit--;
      const i = t.next;
      t.next = (t.next + 1) % t.n;
      t.life[i] = 0.6;
      const ox = this.rocket.position.x + Math.sin(r) * 1.1 * s;
      const oy = this.rocket.position.y - Math.cos(r) * 1.1 * s;
      pos.setXYZ(i, ox + rand(-0.12, 0.12) * s, oy, 0);
      t.vel[i * 2] = rand(-0.4, 0.4) + Math.sin(r) * 3;
      t.vel[i * 2 + 1] = -rand(3, 5) * (0.6 + this.speed * 0.4);
    }
    for (let i = 0; i < t.n; i++) {
      if (t.life[i] <= 0) continue;
      t.life[i] -= dt;
      const k = Math.max(0, t.life[i] / 0.6);
      pos.setXY(i, pos.getX(i) + t.vel[i * 2] * dt, pos.getY(i) + t.vel[i * 2 + 1] * dt);
      const c = this.heat === 2 ? tmpColor.setHSL((i / 24 + this.time * 0.8) % 1, 1, 0.6) : this.heat === 1 ? tmpColor.setHSL(0.02 + (i % 5) * 0.025, 1, 0.55) : this.trailColor;
      col.setXYZ(i, c.r * k, c.g * k, c.b * k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // ---------- asteroids ----------

  labelTexture(text) {
    if (!this.labels.has(text)) {
      this.labels.set(
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
    return this.labels.get(text);
  }

  makeAsteroid(value, radius, color, golden = false) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    const seed = rand(0, 10);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      // Bumps depend only on position, so shared corners stay joined.
      const bump = 1 + 0.16 * Math.sin(v.x * 4.1 + seed) * Math.cos(v.y * 3.3 + seed * 1.7) + 0.08 * Math.sin(v.z * 7 + seed);
      v.multiplyScalar(bump);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = golden
      ? new THREE.MeshStandardMaterial({ color: GOLD, flatShading: true, roughness: 0.25, metalness: 0.85, emissive: GOLD, emissiveIntensity: 0.35 })
      : new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, emissive: color, emissiveIntensity: 0.18 });
    if (golden) color = GOLD;
    const rock = new THREE.Mesh(geo, mat);
    rock.scale.setScalar(radius);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(radius * 3.4);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTexture(String(value)), depthTest: false, transparent: true }));
    label.scale.setScalar(radius * 1.75);
    label.position.z = radius * 1.1;
    label.renderOrder = 10;
    const group = new THREE.Group();
    group.add(halo, rock, label);
    this.scene.add(group);
    return {
      group, rock, mat, halo, label, value, radius, color,
      alive: true,
      spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)),
      wiggle: 0,
      phase: rand(0, Math.PI * 2),
      golden,
    };
  }

  startWave(asteroids, duration) {
    this.clearWave();
    const startFrac = this.boss.active ? 0.47 : asteroids.length === 1 ? 0.3 : 0.36;
    const endY = this.rocketY + 1.3 * this.rocketAnchor.scale;
    // Keep some room to fall even when the keypad pushes the rocket up.
    const startY = Math.max(this.worldY(startFrac), endY + 1.5);
    asteroids.forEach((a, i) => {
      a.startY = startY - (i % 2) * a.radius * 0.5;
      a.fromY = this.viewH / 2 + 2 + i * 0.6;
      a.group.position.set(a.x, a.fromY, 0);
    });
    this.wave = { asteroids, elapsed: 0, duration: duration / 1000, endY, timedOut: false };
  }

  spawnChoices(values, duration, golden = false) {
    const n = values.length;
    const span = Math.min(this.viewW * 0.88, n * 2.7);
    const radius = Math.min(0.85, (span / n) * 0.36);
    const colors = [...ROCK_COLORS].sort(() => Math.random() - 0.5);
    const rocks = values.map((value, i) => {
      const a = this.makeAsteroid(value, radius, colors[i], golden);
      a.x = -span / 2 + (span * (i + 0.5)) / n;
      return a;
    });
    this.startWave(rocks, duration);
    return rocks;
  }

  spawnTarget(duration, golden = false) {
    const a = this.makeAsteroid('?', 0.85, ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)], golden);
    a.x = 0;
    this.startWave([a], duration);
    return a;
  }

  setLabel(a, text) {
    a.label.material.map = this.labelTexture(text);
    a.label.material.needsUpdate = true;
  }

  // Response time, not counting the fly-in or any paused time.
  waveMs() {
    return this.wave ? Math.max(0, (this.wave.elapsed - ENTER_TIME) * 1000) : 0;
  }

  find(value) {
    return this.wave?.asteroids.find((a) => a.alive && a.value === value);
  }

  pick(clientX, clientY) {
    if (!this.wave) return null;
    let best = null;
    let bestD = Infinity;
    for (const a of this.wave.asteroids) {
      if (!a.alive) continue;
      const s = this.toScreen(a.group.position);
      const r = (a.radius / this.viewH) * window.innerHeight;
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      // Generous hit area for small fingers.
      if (d < Math.max(r * 1.6, 48) && d < bestD) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }

  updateWave(dt) {
    const w = this.wave;
    if (!w) return;
    if (!this.paused) w.elapsed += dt;
    const p = clamp01((w.elapsed - ENTER_TIME) / w.duration);
    for (const a of w.asteroids) {
      if (!a.group.parent) continue;
      const enter = clamp01(w.elapsed / ENTER_TIME);
      const y = enter < 1 ? lerp(a.fromY, a.startY, easeOutBack(enter)) : lerp(a.startY, w.endY, p);
      const sway = Math.sin(this.time * 1.3 + a.phase) * 0.12;
      const wiggle = a.wiggle > 0 ? Math.sin(a.wiggle * 40) * 0.15 * a.wiggle : 0;
      a.wiggle = Math.max(0, a.wiggle - dt);
      a.group.position.set(a.x + sway + wiggle, y, 0);
      a.rock.rotation.x += a.spin.x * dt;
      a.rock.rotation.y += a.spin.y * dt;
      const danger = p > 0.7 ? (p - 0.7) / 0.3 : 0;
      if (a.golden) a.rock.rotation.y += dt * 2;
      const pulse = a.highlight ? 1.3 + Math.sin(this.time * 8) * 0.3 : 1 + Math.sin(this.time * (4 + danger * 12)) * 0.12 * (0.3 + danger);
      a.halo.scale.setScalar(a.radius * 3.4 * pulse);
      if (a.highlight) a.halo.material.color.set(0xfff27a);
    }
    if (p >= 1 && !w.timedOut && !this.paused) {
      w.timedOut = true;
      this.onTimeout?.();
    }
  }

  removeAsteroid(a) {
    a.alive = false;
    this.scene.remove(a.group);
    a.rock.geometry.dispose();
    a.mat.dispose();
    a.halo.material.dispose();
    a.label.material.dispose();
  }

  clearWave() {
    if (!this.wave) return;
    for (const a of this.wave.asteroids) if (a.group.parent) this.removeAsteroid(a);
    this.wave = null;
  }

  // Shrink away every asteroid except the one being blasted.
  dismissOthers(keep) {
    for (const a of this.wave?.asteroids ?? []) {
      if (a === keep || !a.alive) continue;
      a.alive = false;
      const start = a.group.scale.x;
      this.addFx(0.3, (t) => a.group.scale.setScalar(start * (1 - t)), () => this.removeAsteroid(a));
    }
  }

  wrong(a) {
    if (!a) return;
    a.wiggle = 0.5;
    a.mat.color.set(0x5d5f73);
    a.mat.emissive.set(0x5d1020);
    a.halo.material.color.set(0x553344);
    this.shakeAmount = Math.max(this.shakeAmount, 0.15);
  }

  highlight(a) {
    if (a) a.highlight = true;
  }

  shoot(a, onHit) {
    if (!a?.group.parent) {
      onHit?.();
      return;
    }
    this.dismissOthers(a);
    a.alive = false;
    if (this.wave) this.wave.timedOut = true;
    const to = a.group.position.clone();
    this.aim = Math.atan2(-(to.x - this.rocket.position.x), to.y - this.rocket.position.y);
    this.rocket.rotation.z = this.aim;
    this.beam(this.noseWorld(), to, 0x7df9ff);
    this.after(0.09, () => {
      const at = a.group.position.clone();
      this.explode(at, a.color, 1);
      this.removeAsteroid(a);
      if (this.wave?.asteroids.every((r) => !r.group.parent)) this.wave = null;
      this.shakeAmount = Math.max(this.shakeAmount, 0.22);
      onHit?.(this.toScreen(at));
    });
  }

  // ---------- effects ----------

  addFx(duration, update, done, obj) {
    this.fx.push({ t: 0, duration, update, done, obj });
  }

  disposeFx(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o.geometry && o.geometry !== this.beamGeo && o.geometry !== this.ballGeo) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  beam(from, to, color) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const group = new THREE.Group();
    const mk = (r, opacity) => {
      const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.scale.set(r, len, r);
      return m;
    };
    group.add(mk(0.05, 1), mk(0.16, 0.35));
    group.position.copy(from).addScaledVector(dir, 0.5);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(group);
    this.addFx(0.22, (t) => group.children.forEach((m, i) => (m.material.opacity = (1 - t) * (i ? 0.35 : 1))), null, group);
  }

  explode(at, color, size = 1) {
    const n = Math.round(50 * size);
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7) * size);
      vel.push(v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.5 * size, map: this.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(at);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.copy(at);
    const chunks = new THREE.Group();
    const chunkMat = new THREE.MeshStandardMaterial({ color, flatShading: true, transparent: true });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.TetrahedronGeometry(rand(0.1, 0.22) * size), chunkMat);
      c.position.copy(at);
      c.userData.v = new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(0, 3)).multiplyScalar(size);
      chunks.add(c);
    }
    const group = new THREE.Group();
    group.add(sparks, flash, ring, chunks);
    this.scene.add(group);
    let last = 0;
    this.addFx(
      1,
      (t) => {
        const dt = t - last;
        last = t;
        const p = geo.attributes.position;
        for (let i = 0; i < n; i++) {
          vel[i].multiplyScalar(1 - dt * 2.5);
          p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt);
        }
        p.needsUpdate = true;
        sparks.material.opacity = 1 - t;
        flash.scale.setScalar((1 + t * 4) * size * 1.6);
        flash.material.opacity = Math.max(0, 1 - t * 4);
        ring.scale.setScalar(1 + t * 6 * size);
        ring.material.opacity = Math.max(0, 1 - t * 1.8);
        for (const c of chunks.children) {
          c.position.addScaledVector(c.userData.v, dt);
          c.rotation.x += dt * 6;
          c.rotation.y += dt * 5;
        }
        chunkMat.opacity = 1 - t;
      },
      null,
      group,
    );
  }

  // Fireworks for a great result.
  celebrate(count = 8) {
    for (let i = 0; i < count; i++) {
      this.after(i * 0.22, () => {
        const at = new THREE.Vector3(rand(-0.4, 0.4) * this.viewW, rand(-0.1, 0.4) * this.viewH, rand(-3, 0));
        this.explode(at, ROCK_COLORS[i % ROCK_COLORS.length], rand(0.8, 1.4));
      });
    }
  }

  projectile(from, getTarget, color, duration, onArrive) {
    const ball = new THREE.Group();
    ball.add(
      new THREE.Mesh(this.ballGeo, new THREE.MeshBasicMaterial({ color })),
      new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    ball.children[0].scale.setScalar(0.22);
    ball.children[1].scale.setScalar(1.3);
    ball.position.copy(from);
    this.scene.add(ball);
    this.addFx(
      duration,
      (t) => {
        const to = getTarget();
        ball.position.set(lerp(from.x, to.x, t), lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 0.6, lerp(from.z, to.z, t));
      },
      () => onArrive?.(),
      ball,
    );
  }

  // ---------- boss ----------

  buildBoss() {
    const group = new THREE.Group();
    this.bossMat = new THREE.MeshStandardMaterial({ color: 0x8e44ad, metalness: 0.55, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
    const saucer = new THREE.Mesh(new THREE.SphereGeometry(1.3, 40, 20), this.bossMat);
    saucer.scale.y = 0.3;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 10, 48), new THREE.MeshStandardMaterial({ color: 0xd1c4e9, metalness: 0.7, roughness: 0.2 }));
    rim.rotation.x = Math.PI / 2;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.35, roughness: 0.05 }),
    );
    dome.position.y = 0.2;
    const skin = new THREE.MeshStandardMaterial({ color: 0x7ee35b, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), skin);
    head.position.y = 0.42;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.pupils = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), white);
      eye.position.set(side * 0.13, 0.48, 0.26);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), black);
      pupil.position.set(side * 0.13, 0.47, 0.36);
      this.pupils.push(pupil);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), skin);
      stalk.position.set(side * 0.15, 0.82, 0);
      stalk.rotation.z = -side * 0.35;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4fd8 }));
      tip.position.set(side * 0.21, 0.97, 0);
      group.add(eye, pupil, stalk, tip);
    }
    this.bossLights = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial());
      light.position.set(Math.cos(a) * 1.18, -0.05, Math.sin(a) * 1.18);
      this.bossLights.push(light);
      group.add(light);
    }
    group.add(saucer, rim, dome, head);
    group.rotation.x = 0.35;
    group.visible = false;
    this.scene.add(group);
    this.boss = { group, active: false, knock: 0, flash: 0, fall: 0, y: 0 };
  }

  showBoss(color = 0x8e44ad) {
    this.bossMat.color.set(color);
    const b = this.boss;
    b.active = true;
    b.fall = 0;
    b.knock = 0;
    b.escape = false;
    b.group.visible = true;
    b.group.rotation.set(0.35, 0, 0);
    b.group.scale.setScalar(Math.min(1, this.viewW / 7.5));
    b.y = this.viewH / 2 + 3;
    b.group.position.set(0, b.y, -1);
  }

  bossEscape() {
    this.boss.escape = true;
    this.after(1.5, () => this.hideBoss());
  }

  bossScreen() {
    return this.toScreen(this.boss.group.position);
  }

  hideBoss() {
    this.boss.active = false;
    this.boss.group.visible = false;
  }

  hitBoss(onHit) {
    const b = this.boss;
    this.after(0.12, () => {
      this.projectile(this.noseWorld(), () => b.group.position, 0xffe14d, 0.32, () => {
        this.explode(b.group.position.clone().add(new THREE.Vector3(rand(-0.5, 0.5), -0.2, 0.6)), 0xffb02e, 0.8);
        b.flash = 1;
        b.knock = 0.8;
        this.shakeAmount = Math.max(this.shakeAmount, 0.3);
        onHit?.();
      });
    });
  }

  bossAttack(onHit) {
    const b = this.boss;
    this.projectile(b.group.position.clone(), () => this.rocket.position, 0x8dff4f, 0.55, () => {
      this.explode(this.rocket.position.clone().add(new THREE.Vector3(0, 0.6, 0.5)), 0x8dff4f, 0.7);
      this.shield.material.opacity = 0.6;
      this.wobble = 1;
      onHit?.();
    });
  }

  defeatBoss(onDone) {
    const b = this.boss;
    for (let i = 0; i < 7; i++) {
      this.after(i * 0.18, () => {
        const off = new THREE.Vector3(rand(-1.2, 1.2), rand(-0.4, 0.6), 0.5);
        this.explode(b.group.position.clone().add(off), ROCK_COLORS[i % ROCK_COLORS.length], 1.1);
        this.shakeAmount = 0.35;
        b.flash = 1;
      });
    }
    this.after(1.2, () => {
      b.fall = 0.001;
      this.explode(b.group.position.clone(), 0xffffff, 2);
    });
    this.after(2.2, () => {
      this.hideBoss();
      onDone?.();
    });
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b.group.visible) return;
    const target = b.escape ? this.viewH / 2 + 5 : this.worldY(0.31);
    b.y = lerp(b.y, target, Math.min(1, dt * 2.5));
    b.knock = Math.max(0, b.knock - dt * 2);
    if (b.fall > 0) {
      b.fall += dt;
      b.group.position.y -= b.fall * b.fall * 12 * dt;
      b.group.rotation.z += dt * 6;
      b.group.scale.multiplyScalar(1 - dt * 0.6);
    } else {
      b.group.position.set(Math.sin(this.time * 0.9) * this.viewW * 0.2, b.y + b.knock + Math.sin(this.time * 2.2) * 0.12, -1);
      b.group.rotation.z = Math.sin(this.time * 1.4) * 0.12;
    }
    b.flash = Math.max(0, b.flash - dt * 3);
    this.bossMat.emissiveIntensity = b.flash;
    this.bossLights.forEach((l, i) => l.material.color.setHSL(((this.time * 0.6 + i / 12) % 1), 1, 0.6));
    const look = clamp01((this.rocket.position.x - b.group.position.x) / 4 + 0.5) - 0.5;
    this.pupils.forEach((p, i) => (p.position.x = (i ? 0.13 : -0.13) + look * 0.06));
  }

  // ---------- frame loop ----------

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    this.speed = lerp(this.speed, this.warp, Math.min(1, dt * 2));
    const sp = this.stars.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      let y = sp.getY(i) - dt * 3 * this.speed;
      if (y < -60) y += 120;
      sp.setY(i, y);
    }
    sp.needsUpdate = true;
    this.stars.material.size = 0.35 + (this.speed - 1) * 0.08;
    this.planetBall.rotation.y += dt * 0.05;

    const { frac, scale } = this.rocketAnchor;
    const r = this.rocket;
    const k = Math.min(1, dt * 5);
    r.scale.setScalar(lerp(r.scale.x, scale, k));
    this.rocketBaseY = lerp(this.rocketBaseY ?? this.worldY(frac), this.worldY(frac), k);
    r.position.y = this.rocketBaseY + Math.sin(this.time * 2.2) * 0.08;
    r.position.x = lerp(r.position.x, Math.sin(this.time * 4) * 0.08 * this.wobble, k);
    this.aim = lerp(this.aim, 0, Math.min(1, dt * 2.5));
    r.rotation.z = this.aim + Math.sin(this.time * 30) * 0.08 * this.wobble;
    this.wobble = Math.max(0, this.wobble - dt * 1.5);
    this.rocketBody.rotation.y = Math.sin(this.time * 0.8) * 0.55;
    this.flame.scale.set(1 + Math.sin(this.time * 40) * 0.08, (0.9 + Math.random() * 0.25) * (0.8 + this.speed * 0.2), 1);
    this.shield.material.opacity = Math.max(0, this.shield.material.opacity - dt * 1.2);
    this.updateTrail(dt);

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

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.9);
    const s = this.shakeAmount;
    this.camera.position.set(rand(-s, s), rand(-s, s), CAMERA_Z);
    this.renderer.render(this.scene, this.camera);
  }

  // Drop everything from a mission (used when quitting part-way).
  reset() {
    this.clearWave();
    this.timers = [];
    this.hideBoss();
    this.paused = false;
    this.warp = 1;
    this.setHeat(0);
  }
}
