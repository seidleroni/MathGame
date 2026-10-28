// All sound is synthesized with Web Audio, so there are no files to load.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// I–V–vi–IV in C, one chord per bar of eight steps.
const CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.musicTimer = null;
    this.tempo = 112;
  }

  // Browsers only allow audio after a user gesture, so call this from taps.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, len);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.settings.music) this.startMusic();
  }

  suspend() {
    this.ctx?.suspend();
  }

  get on() {
    return !!this.ctx && this.settings.sound;
  }

  tone(freq, { to, dur = 0.15, type = 'sine', vol = 0.25, at = 0, bus } = {}) {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.3, freq = 1000, to, at = 0, bus } = {}) {
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus ?? this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click() {
    if (this.on) this.tone(660, { dur: 0.07, type: 'triangle', vol: 0.15 });
  }

  key() {
    if (this.on) this.tone(990, { dur: 0.05, vol: 0.12 });
  }

  laser() {
    if (!this.on) return;
    this.tone(1500, { to: 220, dur: 0.18, type: 'sawtooth', vol: 0.08 });
    this.tone(1000, { to: 160, dur: 0.16, type: 'square', vol: 0.04 });
  }

  boom(big = false) {
    if (!this.on) return;
    this.noise({ dur: big ? 0.9 : 0.45, vol: big ? 0.6 : 0.4, freq: 1400, to: 60 });
    this.tone(130, { to: 40, dur: big ? 0.6 : 0.3, vol: 0.35 });
  }

  correct(combo) {
    if (!this.on) return;
    const base = 72 + Math.min(combo, 12);
    [0, 4, 7, 12].forEach((step, i) => this.tone(midi(base + step), { dur: 0.2, type: 'triangle', vol: 0.16, at: i * 0.055 }));
  }

  fast() {
    if (this.on) this.noise({ dur: 0.35, vol: 0.18, freq: 400, to: 5000 });
  }

  wrong() {
    if (!this.on) return;
    this.tone(392, { to: 330, dur: 0.22, type: 'square', vol: 0.06 });
    this.tone(294, { to: 220, dur: 0.35, type: 'square', vol: 0.06, at: 0.18 });
  }

  gem() {
    if (!this.on) return;
    this.tone(midi(88), { dur: 0.08, type: 'square', vol: 0.05 });
    this.tone(midi(95), { dur: 0.22, type: 'square', vol: 0.05, at: 0.07 });
  }

  bossAppear() {
    if (!this.on) return;
    for (let i = 0; i < 3; i++) this.tone(110, { to: 260, dur: 0.5, type: 'sawtooth', vol: 0.08, at: i * 0.55 });
  }

  splat() {
    if (!this.on) return;
    this.noise({ dur: 0.25, vol: 0.3, freq: 600, to: 120 });
    this.tone(200, { to: 90, dur: 0.25, type: 'sine', vol: 0.25 });
  }

  fanfare(stars = 3) {
    if (!this.on) return;
    const notes = [67, 72, 76, 79, 84].slice(0, 2 + stars);
    notes.forEach((n, i) => this.tone(midi(n), { dur: 0.25, type: 'triangle', vol: 0.18, at: i * 0.14 }));
    const end = notes.length * 0.14;
    [72, 76, 79].forEach((n) => this.tone(midi(n + 12), { dur: 0.8, type: 'triangle', vol: 0.1, at: end }));
  }

  unlockWorld() {
    if (!this.on) return;
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), { dur: 0.3, type: 'square', vol: 0.05, at: i * 0.08 }));
  }

  setMusic(on) {
    this.settings.music = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setIntense(intense) {
    this.tempo = intense ? 150 : 112;
  }

  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.schedule(), 60);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  schedule() {
    if (this.ctx.state !== 'running') return;
    const stepLen = 60 / this.tempo / 2;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const at = this.nextTime - this.ctx.currentTime;
      const chord = CHORDS[Math.floor(this.step / 8) % CHORDS.length];
      const bus = this.musicBus;
      this.tone(midi(chord[ARP[this.step % 8]] + 12), { dur: stepLen * 0.9, type: 'triangle', vol: 0.06, at, bus });
      if (this.step % 4 === 0) this.tone(midi(chord[0] - 24), { dur: stepLen * 3, type: 'sine', vol: 0.12, at, bus });
      if (this.step % 2 === 1) this.noise({ dur: 0.04, vol: 0.03, freq: 8000, at, bus });
      this.nextTime += stepLen;
      this.step++;
    }
  }
}
