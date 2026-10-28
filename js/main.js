import { Space } from './scene.js';
import { Sfx } from './audio.js';
import { WORLDS, FACT_BY_ID, factText, hintFor, makeChoices } from './facts.js';
import { Learner, Mission, inputMode, timeLimit, BOSS_HEALTH, REGULAR_QUESTIONS, UNLOCK_SHARE } from './learner.js';
import { SKINS } from './skins.js';

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

const SCREENS = ['title', 'map', 'hud', 'results', 'shop', 'progress'];
// Where the rocket sits on each screen: [fraction down the screen, scale].
const ROCKET_SPOTS = { title: [0.56, 1.5], map: [1.3, 0.8], hud: [0.86, 0.9], results: [0.86, 0.9], shop: [0.42, 1.9], progress: [1.3, 0.7] };
let current = 'title';

function show(name) {
  current = name;
  for (const s of SCREENS) $(`#screen-${s}`).classList.toggle('hidden', s !== name);
  space.setRocketAnchor(...ROCKET_SPOTS[name]);
  if (name !== 'shop') space.setSkin(learner.state.skin);
  if (name === 'map') renderMap();
  if (name === 'shop') renderShop();
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

// Audio can only start from a user gesture; iOS is picky about which one.
for (const type of ['pointerdown', 'touchend', 'click']) {
  document.addEventListener(type, () => sfx.unlock(), { capture: true });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn, .icon-btn, .world, .skin')) sfx.click();
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
$('#btn-progress').onclick = () => show('progress');

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

function renderMap() {
  const list = $('#world-list');
  list.innerHTML = '';
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

// ---------- mission ----------

let game = null;
let lastWorld = 0;

// setTimeout that is dropped if the player has left this mission.
function later(ms, fn) {
  const g = game;
  setTimeout(() => {
    if (g && game === g) fn();
  }, ms);
}

function startMission(world) {
  lastWorld = world;
  space.reset();
  space.setWorld(world);
  game = {
    world,
    mission: new Mission(learner, world),
    score: 0,
    combo: 0,
    bestCombo: 0,
    gems: 0,
    fact: null,
    mode: null,
    entry: '',
    target: null,
    locked: true,
    paused: false,
    bossShown: false,
  };
  show('hud');
  $('#keypad').classList.add('hidden');
  $('#boss-bar').classList.add('hidden');
  $('#question').classList.add('hidden');
  sfx.setIntense(false);
  updateHud();
  banner(`${WORLDS[world].name}<small>${WORLDS[world].skill}</small>`);
  later(1500, nextQuestion);
}

function nextQuestion() {
  const m = game.mission;
  if (m.done) return endBossFight();
  if (m.phase === 'boss' && !game.bossShown) return startBossFight();

  const fact = m.next();
  const box = learner.stat(fact.id).box;
  Object.assign(game, { fact, mode: inputMode(box), entry: '', locked: false });
  const q = $('#question');
  q.classList.remove('hidden', 'enter');
  void q.offsetWidth;
  q.classList.add('enter');
  $('#q-text').textContent = factText(fact);
  setAnswer('?');
  const duration = timeLimit(box);
  if (game.mode === 'choice') {
    $('#keypad').classList.add('hidden');
    space.setRocketAnchor(...ROCKET_SPOTS.hud);
    // Brand-new facts get 3 choices; facts being learned get 4.
    space.spawnChoices(makeChoices(fact, box === 0 ? 3 : 4), duration);
    game.target = null;
  } else {
    $('#keypad').classList.remove('hidden');
    anchorAboveKeypad();
    game.target = space.spawnTarget(duration);
    setAnswer('?', 'typing');
  }
  updateHud();
}

function anchorAboveKeypad() {
  const r = $('#keypad').getBoundingClientRect();
  const blocksMiddle = r.left < window.innerWidth / 2 && r.right > window.innerWidth / 2;
  if (blocksMiddle) space.setRocketAnchor(Math.max(0.45, (r.top - 60) / window.innerHeight), 0.75);
  else space.setRocketAnchor(...ROCKET_SPOTS.hud);
}

window.addEventListener('resize', () => {
  if (current === 'hud' && game?.mode === 'keypad') anchorAboveKeypad();
});

function startBossFight() {
  game.bossShown = true;
  space.clearWave();
  $('#question').classList.add('hidden');
  $('#keypad').classList.add('hidden');
  space.setRocketAnchor(...ROCKET_SPOTS.hud);
  space.showBoss();
  sfx.bossAppear();
  sfx.setIntense(true);
  banner('BOSS BATTLE!<small>Right answers zap the alien!</small>');
  $('#boss-bar').classList.remove('hidden');
  updateBossBar();
  later(2200, nextQuestion);
}

function endBossFight() {
  game.locked = true;
  space.clearWave();
  $('#question').classList.add('hidden');
  $('#keypad').classList.add('hidden');
  space.setRocketAnchor(...ROCKET_SPOTS.hud);
  if (game.mission.bossHealth <= 0) {
    banner('BOSS DEFEATED!');
    for (let i = 0; i < 5; i++) later(i * 200, () => sfx.boom(i === 4));
    space.defeatBoss();
    later(2600, finishMission);
  } else {
    banner('The alien flew away!<small>Get it next time!</small>');
    space.bossEscape();
    later(2000, finishMission);
  }
}

function setAnswer(text, cls = '') {
  const el = $('#q-answer');
  el.textContent = text;
  el.className = `q-answer ${cls}`;
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
  const boss = game.mission.phase === 'boss';
  const { fast } = game.mission.answer(game.fact, correct, space.waveMs(), game.mode);
  learner.save();
  if (correct) onCorrect(rock, fast, boss);
  else onMiss(value, rock, boss);
}

const PRAISE = ['Nice!', 'Great!', 'Yes!', 'Awesome!', 'Super!', 'Boom!', 'You got it!'];
const FAST_PRAISE = ['⚡ Lightning!', '⚡ Super fast!', '⚡ Zoom!', '⚡ Speedy!'];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function onCorrect(rock, fast, boss) {
  const g = game;
  g.combo++;
  g.bestCombo = Math.max(g.bestCombo, g.combo);
  const mult = Math.min(4, 1 + Math.floor(g.combo / 5));
  const points = (fast ? 20 : 10) * mult;
  const gems = fast ? 2 : 1;
  g.score += points;
  g.gems += gems;
  setAnswer(String(g.fact.answer), 'right');
  space.setWarp(1 + Math.min(g.combo, 10) * 0.3);
  sfx.laser();
  space.shoot(rock, (at) => {
    sfx.boom();
    sfx.correct(g.combo);
    if (fast) sfx.fast();
    pop(at.x, at.y, `+${points}`, fast ? 'fast' : '');
    pop(at.x, at.y - 46, fast ? pickOne(FAST_PRAISE) : pickOne(PRAISE), 'gold');
    later(150, () => {
      sfx.gem();
      bumpGems();
    });
  });
  if (boss) {
    space.hitBoss(() => {
      sfx.boom();
      updateBossBar();
    });
  }
  if (g.combo % 5 === 0) banner(`🔥 ${g.combo} in a row!${mult > 1 ? `<small>Points x${Math.min(4, 1 + Math.floor(g.combo / 5))}</small>` : ''}`);
  updateHud();
  later(boss ? 1200 : 850, nextQuestion);
}

function onMiss(value, rock, boss) {
  const g = game;
  const timedOut = value === null;
  g.combo = 0;
  space.setWarp(1);
  sfx.wrong();
  setAnswer(timedOut ? '?' : String(value), 'wrong');
  space.wrong(rock);
  if (boss) space.bossAttack(() => sfx.splat());
  space.paused = true;
  const correctRock = g.mode === 'choice' ? space.find(g.fact.answer) : g.target;
  space.highlight(correctRock);
  updateHud();
  later(timedOut ? 300 : 700, () => showHint(g.fact, timedOut, correctRock));
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
  const m = game.mission;
  $('#progress-fill').style.width = `${Math.min(1, m.index / REGULAR_QUESTIONS) * 100}%`;
  $('#score').textContent = game.score;
  const combo = $('#combo');
  combo.textContent = game.combo >= 2 ? `🔥 x${game.combo}` : '';
  combo.classList.remove('hot');
  void combo.offsetWidth;
  combo.classList.add('hot');
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

function finishMission() {
  const g = game;
  const sum = g.mission.summary();
  const bonus = (sum.bossDefeated ? 5 : 0) + (sum.stars === 3 ? 5 : 0);
  g.gems += bonus;
  const st = learner.state;
  st.gems += g.gems;
  st.missions++;
  st.bestCombo = Math.max(st.bestCombo, g.bestCombo);
  st.worldStars[g.world] = Math.max(st.worldStars[g.world] ?? 0, sum.stars);
  const newBest = g.score > (st.best[g.world] ?? 0);
  if (newBest) st.best[g.world] = g.score;
  const unlocked = learner.updateUnlocks();
  learner.save();

  game = null;
  space.reset();
  sfx.setIntense(false);
  renderResults(g, sum, bonus, newBest, unlocked);
  show('results');
  sfx.fanfare(sum.stars);
  if (sum.stars === 3) space.celebrate();
  if (unlocked !== null) setTimeout(() => sfx.unlockWorld(), 1300);
}

function renderResults(g, sum, bonus, newBest, unlocked) {
  const name = learner.state.name;
  $('#res-title').textContent = sum.stars === 3 ? `Superstar${name ? `, ${name}` : ''}!` : name ? `Great flying, ${name}!` : 'Mission complete!';
  $$('#res-stars span').forEach((s, i) => {
    s.className = i < sum.stars ? 'on' : '';
    s.style.animationDelay = `${0.3 + i * 0.3}s`;
  });
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
  const nextNote = g.world === learner.state.unlocked && g.world < WORLDS.length - 1 && need > 0 ? ` · ${need} more to open the next planet` : '';
  $('#res-world').innerHTML = `${WORLDS[g.world].name}: ${prog.learned}/${prog.total} learned${nextNote}
    <div class="track"><div class="fill" style="width:${prog.share * 100}%"></div></div>`;

  const unlock = $('#res-unlock');
  unlock.classList.toggle('hidden', unlocked === null);
  if (unlocked !== null) unlock.textContent = `🎉 New planet: ${WORLDS[unlocked].name}!`;
  $('#btn-again').textContent = unlocked !== null ? '🚀 Next planet' : '↻ Again';
  $('#btn-again').onclick = () => startMission(unlocked ?? lastWorld);
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
  window.rocket = { space, learner, startMission, get game() { return game; } };
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
