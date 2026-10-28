# Number Rocket 🚀

A 3D game (Three.js) that helps a 2nd grader memorize addition and subtraction facts within 20. It has two modes that share the same learning progress:

- **🚀 Space:** fly a rocket, blast the asteroid with the right answer, and fight a boss UFO at the end of every mission.
- **⚔️ Block Dungeons:** a blocky hero explores torch-lit dungeons. Monsters carry the answers, and the right one gets a sword slash. Beat the block golem at the end for treasure.

Works on phones and tablets (portrait or landscape) and on desktop. Nothing to install: it is a static web page.

## Play

- **Online:** turn on GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). The game will be at `https://<user>.github.io/MathGame/`. On a phone or iPad, use *Share → Add to Home Screen* to get a full-screen app icon. After one online visit it also works offline.
- **Locally:** `npm start`, then open http://localhost:8080. The server also prints a Wi-Fi address you can open on a phone or tablet on the same network.

## How it teaches

The game is built around how math facts actually get memorized: short practice spread out over time, recall instead of recognition, and growing speed.

| Idea | How the game does it |
|---|---|
| **Strategy-based order** | 12 planets introduce facts one strategy at a time: +0/+1/+2, doubles, make 10, 10 + n, near doubles, +9/+8, all addition, then −0/−1/−2, take away within 10, halves and tens, teen subtraction, and finally everything mixed. |
| **Small working set** | New facts are introduced only while fewer than 4 facts are still shaky. A child who struggles isn't flooded; a child who already knows them gets new facts quickly. |
| **Recognition, then recall** | New facts use 3 or 4 answer asteroids (near-miss choices like ±1 and ±2). Once a fact is learned, the child types the answer on a keypad, recalling it from memory. |
| **Spaced repetition** | Each fact moves through Leitner boxes with reviews after 45 s, 8 h, 1 day, 3 days and 7 days. Reviews of earlier planets are mixed into every mission. |
| **Speed** | Moving up from "learned" requires a fast answer (under 3 s with choices, 4 s with the keypad). Asteroids fall faster as a fact gets stronger. Fast answers earn double points and gems. |
| **Instant correction** | A miss pauses the game and shows the fact with ten-frame dots and a strategy tip ("Make 10! 8 + 2 = 10, then 3 more is 13"). The child taps the answer to blast it, and the fact comes back two questions later. |
| **Retrieval at the boss** | The boss battle replays facts from the same mission, weighted toward the ones that were missed or slow. |
| **Earned progression** | The next planet unlocks once 75% of the current planet's facts are learned. |

Grown-ups can open **📊 Progress** for a heat map of all 242 facts (tap a square for its accuracy, average time and next review).

Progress is saved in the browser's local storage on that device.

## Fun stuff

- **Block Dungeons:** 12 themed dungeons (Mossy Caves, Lava Forge, Frost Fortress…) with slimes, mushrooms, bats and skeletons. Monsters burst into cubes and drop gems. Each dungeon ends with a block golem boss and a treasure chest.
- **Armory:** gear from treasure chests (swords, axes, hammers, armor) shows on the hero. Learning every fact in a world earns its ✨ enchanted gear (the *Twin Blade* for doubles, the *Ten-Strike Sword* for make-10…), so the hero's gear shows what the child knows.
- **Space Pals:** 24 collectible critters (common, rare, legendary). Every defeated boss drops one. Pick a favorite as co-pilot and it cheers from the corner of the screen.
- **⚡ Lightning Round:** 60 seconds to blast as many learned facts as possible and beat your record. It unlocks after 8 learned facts, and a new record earns a pal. It doubles as speed practice.
- **Ranks:** points earn XP, from Space Cadet up to Space Legend, with a rank-up celebration.
- **Bosses:** each planet has its own named, colored UFO boss that taunts you when you miss and yelps when hit.
- **Golden bonus rocks:** now and then a whole wave turns gold and pays triple gems.
- **Streak flair:** streaks speed up the starfield and multiply points. The rocket trail catches fire at 5 in a row and turns rainbow at 10.
- Laser blasts, explosions, screen shake, fireworks for 3-star missions, 7 rocket paint jobs to buy with gems, and synthesized sound effects and music (each can be switched off on the title screen).

## Development

```
npm start      # local server on :8080
npm test       # learning-engine tests (node --test, no dependencies)
```

Add `?debug` to the URL to expose `window.rocket` for automated play-testing.

```
index.html          page shell and all UI screens
css/style.css       styles (mobile-first, safe-area aware)
js/main.js          app flow: screens, missions, input, results, shop, progress
js/scene.js         Three.js scene: starfield, rocket, asteroids, effects, boss
js/learner.js       spaced-repetition model and per-mission question picker
js/facts.js         the 242 facts, planets, answer choices and strategy hints
js/audio.js         Web Audio sound effects and music
js/skins.js         rocket paint jobs
js/dungeon.js       Three.js dungeon: corridor, hero, monsters, golem boss, chest
js/gfx.js           texture and label helpers shared by both scenes
js/rewards.js       ranks, Space Pals, bosses, dungeons and gear
sw.js               offline support (network first, cache fallback)
tests/              node:test tests for the learning engine
```

Three.js is loaded from jsDelivr through an import map, so there is no build step.
