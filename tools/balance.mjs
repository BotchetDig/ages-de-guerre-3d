// Fait jouer l'IA contre elle-même pour vérifier le rythme de la partie.
// Usage : node tools/balance.mjs [nbParties] [diffA] [diffB]
// Difficultés : easy | normal | hard | human (profil « joueur humain » : réagit lentement, dépense moins bien)
import { createGame, step, applyCommand, startGame } from '../src/sim.js';
import { createAI, aiThink, DIFFICULTY } from '../src/ai.js';
import { TICK, AGES } from '../src/config.js';

const N = +(process.argv[2] ?? 6);
const lv = [process.argv[3] ?? 'normal', process.argv[4] ?? 'normal'];

const HUMAN = { label: 'Humain', power: 1, income: 1, react: 2.5, smart: 0.5 };
const makeAI = (level, seed) => {
  if (level !== 'human') return createAI(level, seed);
  const ai = createAI('normal', seed);
  ai.cfg = HUMAN;
  return ai;
};
const cfgOf = (level) => (level === 'human' ? HUMAN : DIFFICULTY[level]);

const fmt = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}`;
const durations = [];
for (let n = 0; n < N; n++) {
  const g = createGame();
  g.rng = 1000 + n * 77;
  startGame(g);
  const ais = [makeAI(lv[0], 7 + n), makeAI(lv[1], 9001 + n * 3)];
  g.players.forEach((p, i) => { p.incomeMult = cfgOf(lv[i]).income; p.powerMult = cfgOf(lv[i]).power; });
  const ageAt = [[0], [0]];
  const turrets = [0, 0];
  const heroes = [0, 0];
  let peakUnits = 0; const minHp = [1, 1];
  while (!g.over && g.t < 60 * 40) {
    for (let o = 0; o < 2; o++) {
      aiThink(ais[o], g, o, TICK, (cmd) => {
        if (!applyCommand(g, o, cmd)) return;
        if (cmd.c === 'evolve') ageAt[o].push(Math.round(g.t));
        if (cmd.c === 'turret') turrets[o]++;
        if (cmd.c === 'unit' && cmd.k === 3) heroes[o]++;
      });
    }
    step(g, TICK);
    g.events.length = 0;
    peakUnits = Math.max(peakUnits, g.units.length);
    g.players.forEach((p, i) => (minHp[i] = Math.min(minHp[i], p.hp / p.hpMax)));
  }
  durations.push(g.t);
  console.log(
    `#${n} ${g.over ? 'gagnant J' + g.winner : 'TIMEOUT'} en ${fmt(g.t)} | pic ${peakUnits} | ` +
      g.players.map((p, i) => `J${i} ${AGES[p.age].name} (âges ${ageAt[i].slice(1).map(fmt).join(',')}) tourelles ${turrets[i]} héros ${heroes[i]} doct ${p.doctrines.join('+')} minHP ${Math.round(minHp[i] * 100)}%`).join(' | ')
  );
}
durations.sort((a, b) => a - b);
console.log(`Durée médiane : ${fmt(durations[Math.floor(durations.length / 2)])}`);
