import { Space } from './scene.js';
import { Sfx } from './audio.js';
import { WORLDS, FACT_BY_ID, factText, hintFor, makeChoices } from './facts.js';
import {
  Learner, Mission, inputMode, timeLimit, fastLimit, pickLightning,
  BOSS_HEALTH, REGULAR_QUESTIONS, UNLOCK_SHARE, LIGHTNING_SECONDS, LIGHTNING_MIN_FACTS,
} from './learner.js';
import { SKINS } from './skins.js';
import { PALS, BOSSES, palById, rankFor, rollPal } from './rewards.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const learner = new Learner();
const sfx = new Sfx(learner.state);

let space;
try {
  space = new Space($('#scene'));
} catch (err) {
  $('#nogl').classList.remove('hidden');
  throw err;
}
space.setSkin(learner.state.skin);
document.fonts?.load('700 100px Fredoka').catch(() => {});

// ---------- screens ----------

const SCREENS = ['title', 'map', 'hud', 'results', 'shop', 'pals', 'progress'];
// Where the rocket sits on each screen: [fraction down the screen, scale].
const ROCKET_SPOTS = {
  title: [0.5, 1.3], map: [1.3, 0.8], hud: [0.86, 0.9], results: [0.86, 0.9],
  shop: [0.42, 1.9], pals: [1.3, 0.8], progress: [1.3, 0.7],
};
let current = 'title';

function show(name) {
  current = name;
  for (const s of SCREENS) $(`#screen-${s}`).classList.toggle('hidden', s !== name);
  space.setRocketAnchor(...ROCKET_SPOTS[name]);
  if (name !== 'shop') space.setSkin(learner.state.skin);
  if (name === 'title') renderTitle();
  if (name === 'map') renderMap();
  if (name === 'shop') renderShop();
  if (name === 'pals') renderPals();
  if (name === 'progress') renderProgress();
  refreshGems();
}

function refreshGems() {
  $$('.gems').forEach((el) => (el.textContent = learner.state.gems));
}

function bumpGems() {
  const pill = $('#hud-gems').parentElement;
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}

// Restart a CSS animation by toggling its class.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Audio can only start from a user gesture; iOS is picky about which one.
for (const type of ['pointerdown', 'touchend', 'click']) {
  document.addEventListener(type, () => sfx.unlock(), { capture: true });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn, .icon-btn, .world, .skin, .pal')) sfx.click();
});

$$('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));

// ---------- title ----------

const nameInput = $('#pilot-name');
nameInput.value = learner.state.name;
nameInput.addEventListener('input', () => {
  learner.state.name = nameInput.value.trim();
  learner.save();
});
nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && nameInput.blur());

$('#btn-play').onclick = () => show('map');
$('#btn-shop').onclick = () => show('shop');
$('#btn-pals').onclick = () => show('pals');
$('#btn-progress').onclick = () => show('progress');

function renderTitle() {
  const rank = rankFor(learner.state.xp);
  $('#rank-badge').textContent = rank.badge;
  $('#rank-name').textContent = rank.name;
  $('#rank-next').textContent = rank.next ? `${rank.next.xp - learner.state.xp} XP to ${rank.next.name}` : 'Top rank!';
  $('#rank-fill').style.width = `${rank.progress * 100}%`;
  $('#pal-total').textContent = Object.keys(learner.state.pals).length;
}

function renderToggles() {
  $('#btn-sound').classList.toggle('off', !learner.state.sound);
  $('#btn-music').classList.toggle('off', !learner.state.music);
}
$('#btn-sound').onclick = () => {
  learner.state.sound = !learner.state.sound;
  learner.save();
  renderToggles();
};
$('#btn-music').onclick = () => {
  sfx.setMusic(!learner.state.music);
  learner.save();
  renderToggles();
};
renderToggles();

// ---------- planet map ----------

const starsText = (n) => [0, 1, 2].map((i) => (i < n ? '★' : '<span class="dim">★</span>')).join('');

function lightningCard() {
  const learned = learner.learnedFacts().length;
  const locked = learned < LIGHTNING_MIN_FACTS;
  const btn = document.createElement('button');
  btn.className = `world lightning${locked ? ' locked' : ''}`;
  btn.innerHTML = `
    <div class="planet-icon bolt">${locked ? '🔒' : '⚡'}</div>
    <div>
      <div class="world-name">Lightning Round</div>
      <div class="world-skill">${locked ? `Learn ${LIGHTNING_MIN_FACTS - learned} more facts to unlock` : `${LIGHTNING_SECONDS} seconds. How many can you blast?`}</div>
      ${locked ? '' : `<div class="world-meta"><span>🏆 Best: ${learner.state.lightningBest}</span></div>`}
    </div>`;
  btn.onclick = () => (locked ? sfx.wrong() : startLightning());
  return btn;
}

function renderMap() {
  const list = $('#world-list');
  list.innerHTML = '';
  list.appendChild(lightningCard());
  const { unlocked, worldStars } = learner.state;
  WORLDS.forEach((w, i) => {
    const locked = i > unlocked;
    const prog = learner.worldProgress(i);
    const stars = worldStars[i] ?? 0;
    const btn = document.createElement('button');
    btn.className = `world${locked ? ' locked' : ''}${i === unlocked ? ' current' : ''}`;
    let detail;
    if (!locked) {
      detail = `
        <div class="world-meta"><span class="mini-stars">${starsText(stars)}</span><span>${prog.learned}/${prog.total} learned</span></div>
        <div class="track"><div class="fill" style="width:${prog.share * 100}%"></div></div>`;
    } else if (i === unlocked + 1) {
      detail = `<div class="world-skill">Learn ${Math.round(UNLOCK_SHARE * 100)}% of ${WORLDS[i - 1].name} to open</div>`;
    } else {
      detail = '';
    }
    btn.innerHTML = `
      <div class="planet-icon${w.ring ? ' ring' : ''}" style="background: radial-gradient(circle at 35% 30%, ${w.accent}, ${w.color} 62%)">${locked ? '🔒' : ''}</div>
      <div>
        <div class="world-name">${w.name}${i === unlocked && !stars ? '<span class="badge">NEW</span>' : ''}</div>
        <div class="world-skill">${w.skill}</div>
        ${detail}
      </div>`;
    btn.onclick = () => (locked ? sfx.wrong() : startMission(i));
    list.appendChild(btn);
  });
  list.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

// ---------- shared game state ----------

let game = null;
let lastWorld = 0;

// setTimeout that is dropped if the player has left this game.
function later(ms, fn) {
  const g = game;
  setTimeout(() => {
    if (g && game === g) fn();
  }, ms);
}

function newGame(kind, extra) {
  space.reset();
  game = {
    kind, score: 0, combo: 0, bestCombo: 0, gems: 0,
    fact: null, mode: null, entry: '', target: null,
    locked: true, paused: false, ...extra,
  };
  show('hud');
  $('#keypad').classList.add('hidden');
  $('#boss-bar').classList.add('hidden');
  $('#question').classList.add('hidden');
  $('#progress-fill').classList.toggle('timer', kind === 'lightning');
  sfx.setIntense(kind === 'lightning');
  setupCopilot();
  updateHud();
}

function showQuestion(fact) {
  const q = $('#question');
  q.classList.remove('hidden');
  replay(q, 'enter');
  $('#q-text').textContent = factText(fact);
  setAnswer('?');
}

function showKeypad() {
  $('#keypad').classList.remove('hidden');
  anchorAboveKeypad();
  setAnswer('?', 'typing');
}

function anchorAboveKeypad() {
  const r = $('#keypad').getBoundingClientRect();
  const blocksMiddle = r.left < window.innerWidth / 2 && r.right > window.innerWidth / 2;
  if (blocksMiddle) space.setRocketAnchor(Math.max(0.45, (r.top - 60) / window.innerHeight), 0.75);
  else space.setRocketAnchor(...ROCKET_SPOTS.hud);
  placeCopilot();
}

window.addEventListener('resize', () => {
  if (current === 'hud' && game?.mode === 'keypad') anchorAboveKeypad();
});

function setAnswer(text, cls = '') {
  const el = $('#q-answer');
  el.textContent = text;
  el.className = `q-answer ${cls}`;
}

function updateHeat() {
  space.setHeat(game.combo >= 10 ? 2 : game.combo >= 5 ? 1 : 0);
  space.setWarp(1 + Math.min(game.combo, 10) * 0.3);
}

// ---------- co-pilot ----------

const PRAISE = ['Nice!', 'Great!', 'Yes!', 'Awesome!', 'Super!', 'Boom!', 'You got it!', 'Woo-hoo!'];
const FAST_PRAISE = ['⚡ Lightning!', '⚡ Super fast!', '⚡ Zoom!', '⚡ Speedy!'];
const ENCOURAGE = ['Almost! Try this trick.', 'You can do it!', "Let's learn it!", 'Oops! No worries.'];
const BOSS_OUCH = ['Ouch!', 'Oof!', 'Hey!', 'Yikes!', 'No fair!'];
const BOSS_TAUNT = ['Hee hee!', 'Missed me!', 'Nyah nyah!', 'Ha ha!'];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function setupCopilot() {
  const pal = palById(learner.state.copilot);
  $('#copilot').classList.toggle('hidden', !pal);
  $('#copilot-bubble').classList.add('hidden');
  if (pal) $('#copilot-face').textContent = pal.emoji;
  placeCopilot();
}

function placeCopilot() {
  const pad = $('#keypad');
  const bottom = pad.classList.contains('hidden') ? 16 : window.innerHeight - pad.getBoundingClientRect().top + 10;
  $('#copilot').style.bottom = `${bottom}px`;
}

let sayTimer;
// The co-pilot cheers in a speech bubble; without one, praise floats up instead.
function say(text, at, mood = 'happy') {
  if (!palById(learner.state.copilot)) {
    if (at) pop(at.x, at.y - 46, text, 'gold');
    return;
  }
  const bubble = $('#copilot-bubble');
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  replay(bubble, 'show');
  replay($('#copilot-face'), mood);
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => bubble.classList.add('hidden'), 1800);
}

// ---------- planet missions ----------

function startMission(world) {
  lastWorld = world;
  space.setWorld(world);
  newGame('mission', { world, mission: new Mission(learner, world), bossShown: false, goldens: 0, golden: false });
  banner(`${WORLDS[world].name}<small>${WORLDS[world].skill}</small>`);
  later(1500, nextQuestion);
}

function nextQuestion() {
  const m = game.mission;
  if (m.done) return endBossFight();
  if (m.phase === 'boss' && !game.bossShown) return startBossFight();

  const fact = m.next();
  const box = learner.stat(fact.id).box;
  // Now and then a whole wave turns golden and pays triple gems.
  const golden = m.phase === 'regular' && m.index >= 2 && game.goldens < 2 && Math.random() < 0.15;
  if (golden) game.goldens++;
  Object.assign(game, { fact, mode: inputMode(box), entry: '', locked: false, golden });
  showQuestion(fact);
  $('#question').classList.toggle('golden', golden);
  const duration = timeLimit(box);
  if (game.mode === 'choice') {
    $('#keypad').classList.add('hidden');
    space.setRocketAnchor(...ROCKET_SPOTS.hud);
    placeCopilot();
    // Brand-new facts get 3 choices; facts being learned get 4.
    space.spawnChoices(makeChoices(fact, box === 0 ? 3 : 4), duration, golden);
    game.target = null;
  } else {
    showKeypad();
    game.target = space.spawnTarget(duration, golden);
  }
  if (golden) {
    sfx.gem();
    const q = $('#question').getBoundingClientRect();
    pop(q.left + q.width / 2, q.bottom + 20, '⭐ BONUS ROCK! ×3 💎', 'gold');
  }
  updateHud();
}

function startBossFight() {
  game.bossShown = true;
  space.clearWave();
  $('#question').classList.add('hidden');
  $('#keypad').classList.add('hidden');
  placeCopilot();
  space.setRocketAnchor(...ROCKET_SPOTS.hud);
  space.showBoss(BOSSES[game.world].color);
  sfx.bossAppear();
  sfx.setIntense(true);
  banner(`${BOSSES[game.world].name} attacks!<small>Right answers zap the alien!</small>`);
  say('Zap that alien!', null);
  $('#boss-bar').classList.remove('hidden');
  updateBossBar();
  later(2200, nextQuestion);
}

function endBossFight() {
  game.locked = true;
  space.clearWave();
  $('#question').classList.add('hidden');
  $('#keypad').classList.add('hidden');
  placeCopilot();
  space.setRocketAnchor(...ROCKET_SPOTS.hud);
  if (game.mission.bossHealth <= 0) {
    banner(`${BOSSES[game.world].name} is beaten!`);
    say('We did it!!', null);
    for (let i = 0; i < 5; i++) later(i * 200, () => sfx.boom(i === 4));
    space.defeatBoss();
    later(2600, finishMission);
  } else {
    banner(`${BOSSES[game.world].name} flew away!<small>Get it next time!</small>`);
    space.bossEscape();
    later(2000, finishMission);
  }
}

// ---------- input ----------

$('#scene').addEventListener('pointerdown', (e) => {
  if (current !== 'hud' || !game || game.locked || game.paused || game.mode !== 'choice') return;
  const rock = space.pick(e.clientX, e.clientY);
  if (rock) answer(rock.value, rock);
});

$('#keypad').addEventListener('pointerdown', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (!key) return;
  e.preventDefault();
  pressKey(key);
});

document.addEventListener('keydown', (e) => {
  if (current !== 'hud' || !game) return;
  if (e.key === 'Escape') return game.paused ? resume() : pause();
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('back');
  else if (e.key === 'Enter') pressKey('fire');
});

function pressKey(key) {
  if (!game || game.locked || game.paused || game.mode !== 'keypad') return;
  if (key === 'fire') {
    if (game.entry) answer(Number(game.entry), game.target);
    return;
  }
  if (key === 'back') game.entry = game.entry.slice(0, -1);
  else if (game.entry === '0') game.entry = key;
  else if (game.entry.length < 2) game.entry += key;
  sfx.key();
  setAnswer(game.entry || '?', 'typing');
  space.setLabel(game.target, game.entry || '?');
  // No answer is more than two digits, so the second digit fires.
  if (game.entry.length === 2) answer(Number(game.entry), game.target);
}

space.onTimeout = () => {
  if (current === 'hud' && game && !game.locked && !game.paused) answer(null, game.target);
};

function answer(value, rock) {
  game.locked = true;
  const correct = value === game.fact.answer;
  if (game.kind === 'lightning') return lightningAnswer(value, correct, rock);
  const boss = game.mission.phase === 'boss';
  const { fast } = game.mission.answer(game.fact, correct, space.waveMs(), game.mode);
  learner.save();
  if (correct) onCorrect(rock, fast, boss);
  else onMiss(value, rock, boss);
}

function onCorrect(rock, fast, boss) {
  const g = game;
  g.combo++;
  g.bestCombo = Math.max(g.bestCombo, g.combo);
  const mult = Math.min(4, 1 + Math.floor(g.combo / 5));
  const points = (fast ? 20 : 10) * mult;
  const gems = (fast ? 2 : 1) * (g.golden ? 3 : 1);
  g.score += points;
  g.gems += gems;
  setAnswer(String(g.fact.answer), 'right');
  updateHeat();
  sfx.laser();
  space.shoot(rock, (at) => {
    sfx.boom();
    sfx.correct(g.combo);
    if (fast) sfx.fast();
    pop(at.x, at.y, g.golden ? `+${gems} 💎` : `+${points}`, fast || g.golden ? 'fast' : '');
    if (g.golden) {
      space.celebrate(3);
      say('Bonus gems!', at);
    } else if (g.combo % 5 === 0) {
      say(`🔥 ${g.combo} in a row!${mult > 1 ? ` Points ×${mult}!` : ''}`, at);
    } else {
      say(fast ? pickOne(FAST_PRAISE) : pickOne(PRAISE), at);
    }
    for (let i = 0; i < Math.min(gems, 4); i++) later(150 + i * 110, () => sfx.gem());
    later(150, bumpGems);
  });
  if (boss) {
    space.hitBoss(() => {
      sfx.boom();
      updateBossBar();
      const b = space.bossScreen();
      pop(b.x, b.y - 30, pickOne(BOSS_OUCH), 'boss');
    });
  }
  updateHud();
  later(boss ? 1200 : 850, nextQuestion);
}

function onMiss(value, rock, boss) {
  const g = game;
  const timedOut = value === null;
  g.combo = 0;
  updateHeat();
  sfx.wrong();
  setAnswer(timedOut ? '?' : String(value), 'wrong');
  space.wrong(rock);
  say(pickOne(ENCOURAGE), null, 'sad');
  if (boss) {
    space.bossAttack(() => sfx.splat());
    const b = space.bossScreen();
    pop(b.x, b.y - 30, pickOne(BOSS_TAUNT), 'boss');
  }
  space.paused = true;
  const correctRock = g.mode === 'choice' ? space.find(g.fact.answer) : g.target;
  space.highlight(correctRock);
  updateHud();
  later(timedOut ? 300 : 700, () => showHint(g.fact, timedOut, correctRock));
}

// ---------- lightning round ----------

const LIGHTNING_ROCK_MS = 9000;
let clockTimer;

function startLightning() {
  space.setWorld(learner.state.unlocked);
  newGame('lightning', { count: 0, recent: [], timeLeft: LIGHTNING_SECONDS * 1000, over: false });
  banner('⚡ LIGHTNING ROUND<small>Blast as many as you can!</small>');
  later(1800, () => {
    banner('GO!');
    startClock();
    nextLightning();
  });
}

function startClock() {
  const g = game;
  let last = performance.now();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (game !== g) return clearInterval(clockTimer);
    const now = performance.now();
    if (!g.paused) g.timeLeft -= now - last;
    last = now;
    $('#progress-fill').style.width = `${Math.max(0, g.timeLeft / (LIGHTNING_SECONDS * 1000)) * 100}%`;
    if (g.timeLeft <= 0) {
      clearInterval(clockTimer);
      endLightning();
    }
  }, 100);
}

function nextLightning() {
  if (game.over) return;
  const fact = pickLightning(learner, game.recent);
  game.recent.push(fact.id);
  if (game.recent.length > 3) game.recent.shift();
  Object.assign(game, { fact, mode: 'keypad', entry: '', locked: false });
  showQuestion(fact);
  showKeypad();
  game.target = space.spawnTarget(LIGHTNING_ROCK_MS);
}

function lightningAnswer(value, correct, rock) {
  const g = game;
  const ms = space.waveMs();
  learner.record(g.fact, correct, ms, 'keypad');
  learner.save();
  if (correct) {
    g.count++;
    g.combo++;
    g.bestCombo = Math.max(g.bestCombo, g.combo);
    g.score += (ms <= fastLimit('keypad') ? 20 : 10) * Math.min(4, 1 + Math.floor(g.combo / 5));
    setAnswer(String(g.fact.answer), 'right');
    updateHeat();
    sfx.laser();
    space.shoot(rock, (at) => {
      sfx.boom();
      sfx.correct(g.combo);
      pop(at.x, at.y, `${g.count}!`, 'fast');
      if (g.combo % 5 === 0) say(`${g.combo} in a row!`, at);
    });
    later(380, nextLightning);
  } else {
    g.combo = 0;
    updateHeat();
    sfx.wrong();
    setAnswer(value === null ? '?' : String(value), 'wrong');
    space.wrong(rock);
    later(650, () => {
      setAnswer(String(g.fact.answer), 'right');
      space.setLabel(rock, String(g.fact.answer));
      space.shoot(rock);
    });
    later(1300, nextLightning);
  }
  updateHud();
}

function endLightning() {
  game.over = true;
  game.locked = true;
  space.clearWave();
  $('#question').classList.add('hidden');
  $('#keypad').classList.add('hidden');
  placeCopilot();
  space.setRocketAnchor(...ROCKET_SPOTS.hud);
  sfx.boom(true);
  banner(`TIME!<small>${game.count} blasted</small>`);
  later(1800, finishLightning);
}

// ---------- hint card ----------

function renderFrames(f) {
  const cells = [];
  if (f.op === '+') {
    for (let i = 0; i < f.a; i++) cells.push('a');
    for (let i = 0; i < f.b; i++) cells.push('b');
  } else {
    for (let i = 0; i < f.a; i++) cells.push(i < f.answer ? 'a' : 'gone');
  }
  const frames = Math.max(1, Math.ceil(cells.length / 10));
  let html = '';
  for (let k = 0; k < frames; k++) {
    html += '<div class="frame">';
    for (let i = 0; i < 10; i++) html += `<i class="${cells[k * 10 + i] ?? ''}"></i>`;
    html += '</div>';
  }
  $('#hint-frames').innerHTML = html;
}

function showHint(fact, timedOut, rock) {
  $('#hint-title').textContent = timedOut ? "Time's up! Here's a trick:" : "Almost! Here's a trick:";
  $('#hint-fact').innerHTML = `${factText(fact)} = <b>${fact.answer}</b>`;
  renderFrames(fact);
  $('#hint-text').textContent = hintFor(fact);
  const go = $('#hint-go');
  go.textContent = `Blast ${fact.answer}!`;
  // A short wait so the hint gets read rather than tapped past.
  go.disabled = true;
  later(1300, () => (go.disabled = false));
  $('#hint').classList.remove('hidden');
  go.onclick = () => {
    $('#hint').classList.add('hidden');
    space.paused = false;
    if (game.mode === 'keypad') space.setLabel(rock, String(fact.answer));
    setAnswer(String(fact.answer), 'right');
    sfx.laser();
    space.shoot(rock, () => sfx.boom());
    later(800, nextQuestion);
  };
}

// ---------- HUD bits ----------

function updateHud() {
  if (game.kind === 'mission') {
    $('#progress-fill').style.width = `${Math.min(1, game.mission.index / REGULAR_QUESTIONS) * 100}%`;
    $('#score').textContent = game.score;
  } else {
    $('#score').textContent = `⚡ ${game.count}`;
  }
  const combo = $('#combo');
  combo.textContent = game.combo >= 2 ? `🔥 x${game.combo}` : '';
  replay(combo, 'hot');
  $('#hud-gems').textContent = learner.state.gems + game.gems;
}

function updateBossBar() {
  $('#boss-fill').style.width = `${(Math.max(0, game.mission.bossHealth) / BOSS_HEALTH) * 100}%`;
}

let bannerTimer;
function banner(html) {
  const el = $('#banner');
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}

function pop(x, y, text, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $('#pops').appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ---------- pause ----------

$('#btn-pause').onclick = pause;
$('#btn-resume').onclick = resume;
$('#btn-quit').onclick = () => {
  $('#pause').classList.add('hidden');
  $('#hint').classList.add('hidden');
  game = null;
  clearInterval(clockTimer);
  space.reset();
  sfx.setIntense(false);
  show('map');
};

function pause() {
  if (!game || current !== 'hud') return;
  game.paused = true;
  space.paused = true;
  $('#pause').classList.remove('hidden');
}

function resume() {
  $('#pause').classList.add('hidden');
  if (!game) return;
  game.paused = false;
  space.paused = !$('#hint').classList.contains('hidden');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  sfx.suspend();
  pause();
});

// ---------- results ----------

function grantPal() {
  const st = learner.state;
  const pal = rollPal(st.pals);
  const dup = !!st.pals[pal.id];
  st.pals[pal.id] = (st.pals[pal.id] ?? 0) + 1;
  if (!st.copilot) st.copilot = pal.id;
  if (dup) st.gems += 10;
  return { pal, dup };
}

// XP, rank-ups and pal drops are shared by both game kinds.
function applyRewards(g, palDrop) {
  const st = learner.state;
  const before = rankFor(st.xp);
  st.xp += g.score;
  st.gems += g.gems;
  st.bestCombo = Math.max(st.bestCombo, g.bestCombo);
  const after = rankFor(st.xp);
  const drop = palDrop ? grantPal() : null;
  return { xp: g.score, rank: after, rankUp: after.index > before.index, drop };
}

function finishMission() {
  const g = game;
  const sum = g.mission.summary();
  g.gems += (sum.bossDefeated ? 5 : 0) + (sum.stars === 3 ? 5 : 0);
  const st = learner.state;
  st.missions++;
  st.worldStars[g.world] = Math.max(st.worldStars[g.world] ?? 0, sum.stars);
  const newBest = g.score > (st.best[g.world] ?? 0);
  if (newBest) st.best[g.world] = g.score;
  const rewards = applyRewards(g, sum.bossDefeated);
  const unlocked = learner.updateUnlocks();
  learner.save();
  closeGame();

  const name = st.name;
  $('#res-title').textContent = sum.stars === 3 ? `Superstar${name ? `, ${name}` : ''}!` : name ? `Great flying, ${name}!` : 'Mission complete!';
  showStars(sum.stars);
  $('#res-big').classList.add('hidden');
  $('#res-stats').innerHTML = `
    <div>✅ Right: <b>${sum.right}/${sum.total}</b></div>
    <div>⚡ Fast: <b>${sum.fast}</b></div>
    <div>🔥 Best streak: <b>${g.bestCombo}</b></div>
    <div>🏆 Score: <b>${g.score}</b>${newBest ? ' <small>NEW BEST!</small>' : ''}</div>
    <div>💎 Gems: <b>+${g.gems}</b></div>
    <div>👾 Boss: <b>${sum.bossDefeated ? 'Zapped!' : 'Escaped'}</b></div>`;
  const chips = (facts, cls) => facts.map((f) => `<span class="chip ${cls}">${factText(f)} = ${f.answer}</span>`).join('');
  let learned = '';
  if (sum.learned.length) learned += `<div class="label">New facts in your brain:</div>${chips(sum.learned, '')}`;
  if (sum.mastered.length) learned += `<div class="label">Mastered:</div>${chips(sum.mastered, 'gold')}`;
  $('#res-learned').innerHTML = learned;

  const prog = learner.worldProgress(g.world);
  const need = Math.ceil(prog.total * UNLOCK_SHARE) - prog.learned;
  const nextNote = g.world === st.unlocked && g.world < WORLDS.length - 1 && need > 0 ? ` · ${need} more to open the next planet` : '';
  $('#res-world').innerHTML = `${WORLDS[g.world].name}: ${prog.learned}/${prog.total} learned${nextNote}
    <div class="track"><div class="fill" style="width:${prog.share * 100}%"></div></div>`;
  $('#res-world').classList.remove('hidden');

  const unlock = $('#res-unlock');
  unlock.classList.toggle('hidden', unlocked === null);
  if (unlocked !== null) unlock.textContent = `🎉 New planet: ${WORLDS[unlocked].name}!`;
  $('#btn-again').textContent = unlocked !== null ? '🚀 Next planet' : '↻ Again';
  $('#btn-again').onclick = () => startMission(unlocked ?? lastWorld);

  showRewards(rewards);
  show('results');
  sfx.fanfare(sum.stars);
  if (sum.stars === 3) space.celebrate();
  if (unlocked !== null) setTimeout(() => sfx.unlockWorld(), 1300);
}

function finishLightning() {
  const g = game;
  const st = learner.state;
  const record = g.count > st.lightningBest;
  if (record) st.lightningBest = g.count;
  g.gems += Math.ceil(g.count / 2) + (record ? 5 : 0);
  const rewards = applyRewards(g, record && g.count >= 5);
  learner.save();
  closeGame();

  $('#res-title').textContent = record ? 'NEW RECORD!' : 'Lightning Round';
  $('#res-stars').classList.add('hidden');
  const big = $('#res-big');
  big.classList.remove('hidden');
  big.innerHTML = `⚡ ${g.count}<small>facts blasted in ${LIGHTNING_SECONDS} seconds</small>`;
  $('#res-stats').innerHTML = `
    <div>🏆 Record: <b>${st.lightningBest}</b></div>
    <div>🔥 Best streak: <b>${g.bestCombo}</b></div>
    <div>⭐ Score: <b>${g.score}</b></div>
    <div>💎 Gems: <b>+${g.gems}</b></div>`;
  $('#res-learned').innerHTML = record ? '' : `<div class="label">Beat ${st.lightningBest} to set a new record!</div>`;
  $('#res-world').classList.add('hidden');
  $('#res-unlock').classList.add('hidden');
  $('#btn-again').textContent = '⚡ Again';
  $('#btn-again').onclick = startLightning;

  showRewards(rewards);
  show('results');
  sfx.fanfare(record ? 3 : 2);
  if (record) space.celebrate();
}

function closeGame() {
  game = null;
  clearInterval(clockTimer);
  space.reset();
  sfx.setIntense(false);
}

function showStars(n) {
  $('#res-stars').classList.remove('hidden');
  $$('#res-stars span').forEach((s, i) => {
    s.className = i < n ? 'on' : '';
    s.style.animationDelay = `${0.3 + i * 0.3}s`;
  });
}

function showRewards({ xp, rank, rankUp, drop }) {
  $('#res-xp').innerHTML = `+${xp} XP · ${rank.badge} ${rank.name}
    <div class="track"><div class="fill xp" style="width:${rank.progress * 100}%"></div></div>`;
  const rankEl = $('#res-rank');
  rankEl.classList.toggle('hidden', !rankUp);
  if (rankUp) {
    rankEl.textContent = `${rank.badge} RANK UP! You're a ${rank.name}!`;
    setTimeout(() => sfx.unlockWorld(), 900);
    space.celebrate(6);
  }
  const palEl = $('#res-pal');
  palEl.classList.toggle('hidden', !drop);
  if (drop) {
    const { pal, dup } = drop;
    palEl.className = `pal-reveal ${pal.rarity}`;
    palEl.innerHTML = `
      <div class="pal-emoji">${pal.emoji}</div>
      <div><div class="pal-found">${dup ? 'Found again:' : 'New Space Pal!'}</div>
      <div class="pal-name">${pal.name}</div>
      <div class="pal-rarity">${pal.rarity}${dup ? ' · +10 💎' : ''}</div></div>`;
    setTimeout(() => sfx.gem(), 700);
  }
}

$('#btn-tomap').onclick = () => show('map');

// ---------- hangar (shop) ----------

function renderShop() {
  const list = $('#skin-list');
  list.innerHTML = '';
  const st = learner.state;
  for (const skin of SKINS) {
    const owned = st.owned.includes(skin.id);
    const btn = document.createElement('button');
    btn.className = `skin${st.skin === skin.id ? ' selected' : ''}${!owned && st.gems < skin.price ? ' cant' : ''}`;
    const label = st.skin === skin.id ? 'Flying ✓' : owned ? 'Use' : `💎 ${skin.price}`;
    btn.innerHTML = `
      <span class="swatch" style="background: conic-gradient(${skin.body} 0 50%, ${skin.accent} 0 75%, ${skin.flame} 0)"></span>
      <span>${skin.name}</span>
      <span class="price">${label}</span>`;
    btn.onclick = () => {
      if (owned) {
        st.skin = skin.id;
      } else if (st.gems >= skin.price) {
        st.gems -= skin.price;
        st.owned.push(skin.id);
        st.skin = skin.id;
        sfx.unlockWorld();
        space.celebrate(4);
      } else {
        // Can't afford it yet: show it off anyway and say how many more gems.
        space.setSkin(skin.id);
        btn.querySelector('.price').textContent = `Need ${skin.price - st.gems} more 💎`;
        return;
      }
      learner.save();
      space.setSkin(st.skin);
      renderShop();
      refreshGems();
    };
    list.appendChild(btn);
  }
}

// ---------- space pals ----------

function renderPals() {
  const st = learner.state;
  const grid = $('#pal-grid');
  grid.innerHTML = '';
  $('#pal-count').textContent = `${Object.keys(st.pals).length}/${PALS.length}`;
  for (const pal of PALS) {
    const owned = !!st.pals[pal.id];
    const btn = document.createElement('button');
    btn.className = `pal ${pal.rarity}${owned ? '' : ' missing'}${st.copilot === pal.id ? ' selected' : ''}`;
    btn.innerHTML = owned
      ? `<span class="pal-emoji">${pal.emoji}</span><span class="pal-name">${pal.name}</span><span class="pal-tag">${st.copilot === pal.id ? 'Co-pilot ✓' : pal.rarity}</span>`
      : `<span class="pal-emoji">❔</span><span class="pal-name">???</span><span class="pal-tag">${pal.rarity}</span>`;
    btn.onclick = () => {
      if (!owned) return sfx.wrong();
      st.copilot = pal.id;
      learner.save();
      renderPals();
    };
    grid.appendChild(btn);
  }
}

// ---------- grown-up progress view ----------

const BOX_NAMES = ['Tricky', 'Learning', 'Learned', 'Strong', 'Mastered', 'Mastered'];

function whenDue(due) {
  const ms = due - Date.now();
  if (ms <= 0) return 'now';
  if (ms < 3600e3) return `in ${Math.ceil(ms / 60e3)} min`;
  if (ms < 86400e3) return `in ${Math.round(ms / 3600e3)} hours`;
  return `in ${Math.round(ms / 86400e3)} days`;
}

function renderGrid(el, symbol, factFor) {
  el.innerHTML = '';
  const head = (text) => {
    const d = document.createElement('div');
    d.className = 'head';
    d.textContent = text;
    el.appendChild(d);
  };
  head(symbol);
  for (let c = 0; c <= 10; c++) head(c);
  for (let r = 0; r <= 10; r++) {
    head(r);
    for (let c = 0; c <= 10; c++) {
      const f = factFor(r, c);
      const s = learner.stat(f.id);
      const cell = document.createElement('button');
      cell.className = s.seen ? `b${s.box}` : 'b-none';
      cell.setAttribute('aria-label', factText(f));
      cell.onclick = () => {
        $$('.fact-grid .sel').forEach((x) => x.classList.remove('sel'));
        cell.classList.add('sel');
        $('#cell-info').textContent = s.seen
          ? `${factText(f)} = ${f.answer} · ${BOX_NAMES[s.box]} · ${s.right}/${s.seen} right · about ${(s.avgMs / 1000).toFixed(1)}s · review ${whenDue(s.due)}`
          : `${factText(f)} = ${f.answer} · not practiced yet`;
      };
      el.appendChild(cell);
    }
  }
}

function renderProgress() {
  const t = learner.totals();
  const st = learner.state;
  $('#prog-summary').innerHTML = `
    <div><b>${t.learned}/${t.total}</b>facts learned</div>
    <div><b>${t.mastered}</b>facts mastered</div>
    <div><b>${st.missions}</b>missions flown</div>
    <div><b>${t.answered ? Math.round(t.accuracy * 100) : 0}%</b>answers right</div>`;
  renderGrid($('#grid-add'), '+', (r, c) => FACT_BY_ID.get(`${r}+${c}`));
  renderGrid($('#grid-sub'), '−', (r, c) => FACT_BY_ID.get(`${r + c}-${r}`));
  $('#cell-info').textContent = 'Tap a square to see a fact.';
}

let resetArmed = null;
$('#btn-reset').onclick = () => {
  const btn = $('#btn-reset');
  if (!resetArmed) {
    btn.textContent = 'Tap again to erase everything';
    resetArmed = setTimeout(() => {
      resetArmed = null;
      btn.textContent = 'Reset progress';
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  btn.textContent = 'Reset progress';
  learner.reset();
  sfx.settings = learner.state;
  space.setSkin(learner.state.skin);
  renderProgress();
  refreshGems();
};

// ---------- go ----------

show('title');

// `?debug` exposes internals for automated play-testing.
if (new URLSearchParams(location.search).has('debug')) {
  window.rocket = { space, learner, startMission, startLightning, get game() { return game; } };
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
