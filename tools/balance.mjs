// Fait jouer l'IA contre elle-même pour vérifier le rythme de la partie.
// Usage : node tools/balance.mjs [nbParties] [diffA] [diffB]
import { createGame, step, applyCommand } from '../src/sim.js';
import { createAI, aiThink, DIFFICULTY } from '../src/ai.js';
import { TICK, AGES } from '../src/config.js';

const N = +(process.argv[2] ?? 6);
const lv = [process.argv[3] ?? 'normal', process.argv[4] ?? 'normal'];

for (let n = 0; n < N; n++) {
  const g = createGame();
  g.rng = 1000 + n * 77;
  const ais = [createAI(lv[0], 7 + n), createAI(lv[1], 9001 + n * 3)];
  g.players.forEach((p, i) => { p.incomeMult = DIFFICULTY[lv[i]].income; p.powerMult = DIFFICULTY[lv[i]].power; });
  const ageAt = [[0], [0]];
  let peakUnits = 0; const minHp = [1, 1];
  while (!g.over && g.t < 60 * 40) {
    for (let o = 0; o < 2; o++) {
      aiThink(ais[o], g, o, TICK, (cmd) => {
        if (applyCommand(g, o, cmd) && cmd.c === 'evolve') ageAt[o].push(Math.round(g.t));
      });
    }
    step(g, TICK);
    g.events.length = 0;
    peakUnits = Math.max(peakUnits, g.units.length); g.players.forEach((p, i) => (minHp[i] = Math.min(minHp[i], p.hp / p.hpMax)));
  }
  const fmt = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}`;
  console.log(
    `#${n} ${g.over ? 'gagnant J' + g.winner : 'TIMEOUT'} en ${fmt(g.t)} | pic unités ${peakUnits} | ` +
      g.players.map((p, i) => `J${i} ${AGES[p.age].name} (âges à ${ageAt[i].map(fmt).join(',')}) kills ${p.kills} minHP ${Math.round(minHp[i]*100)}%`).join(' | ')
  );
}
