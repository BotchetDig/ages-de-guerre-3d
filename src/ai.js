// IA adverse : émet des commandes comme un joueur humain.
import * as C from './config.js';
import { canEvolve, baseXOf, dirOf, popOf, heroBusy } from './sim.js';

// Préférences de doctrine de l'IA (la plus haute l'emporte, avec un peu de hasard)
const DOCTRINE_PREF = { veteran: 8, eco: 7, fury: 6, fort: 5, loot: 4, scholar: 4, artillery: 3, medic: 3 };

export const DIFFICULTY = {
  easy:   { label: 'Facile',    power: 0.8,  income: 0.75, react: 0.9,  smart: 0.4 },
  normal: { label: 'Normal',    power: 1.0,  income: 1.0,  react: 0.55, smart: 0.75 },
  hard:   { label: 'Difficile', power: 1.18, income: 1.3,  react: 0.55,  smart: 1.0 },
};

export function createAI(level = 'normal', seed = 1) {
  return { level, cfg: DIFFICULTY[level], t: 1, seed, saving: false };
}

function rnd(ai) {
  ai.seed = (ai.seed * 16807) % 2147483647;
  return ai.seed / 2147483647;
}

export function aiThink(ai, g, o, dt, issue) {
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = ai.cfg.react * (0.7 + rnd(ai) * 0.6);
  const p = g.players[o];
  const d = dirOf(o);
  const myBase = baseXOf(o);

  if (canEvolve(p)) { issue({ c: 'evolve' }); return; }
  if (p.choice) {
    const [a, b] = p.choice;
    const sa = DOCTRINE_PREF[a] + rnd(ai) * 3, sb = DOCTRINE_PREF[b] + rnd(ai) * 3;
    issue({ c: 'doctrine', i: sa >= sb ? 0 : 1 });
    return;
  }

  // Posture : repli sous les tourelles seulement en situation critique (en retard d'un âge et base entamée)
  const wantHold = g.players[1 - o].age > p.age && p.hp / p.hpMax < 0.35 && ai.cfg.smart >= 0.7;
  if ((p.stance === 'hold') !== wantHold) { issue({ c: 'stance', v: wantHold ? 'hold' : 'advance' }); return; }

  const enemies = g.units.filter((u) => u.owner !== o);
  const mine = g.units.filter((u) => u.owner === o);
  const threat = enemies.filter((u) => Math.abs(u.x - myBase) < 22).length;
  const enemyFront = enemies.reduce((m, u) => Math.min(m, Math.abs(u.x - myBase)), Infinity);

  if (p.specialCd <= 0 && (threat >= 4 || (threat >= 2 && enemyFront < 10)) && rnd(ai) < ai.cfg.smart + 0.2) {
    issue({ c: 'special' });
    return;
  }

  const costs = [0, 1, 2].map((k) => C.unitStats(p.age, k).cost);
  const tCosts = [0, 1, 2].map((k) => C.turretStats(p.age, k).cost);
  const freeSlot = p.turrets.findIndex((t, i) => i < p.slots && !t);

  // Remplacer une tourelle obsolète quand on est riche
  if (p.gold > tCosts[2] * 2.5) {
    const old = p.turrets.findIndex((t) => t && t.age < p.age);
    if (old >= 0) { issue({ c: 'sell', slot: old }); return; }
  }
  // Tourelles : quand l'armée est déjà fournie ou sous pression
  if (freeSlot >= 0 && p.gold > tCosts[0] + costs[2] * (threat > 2 ? 0.3 : 1.2) && rnd(ai) < 0.5) {
    let k = 0;
    if (p.gold > tCosts[2] * 1.3) k = 2;
    else if (p.gold > tCosts[1] * 1.3) k = 1;
    issue({ c: 'turret', k });
    return;
  }
  if (freeSlot < 0 && p.slots < 4 && p.gold > C.SLOT_COSTS[p.slots] + costs[2] * 2 && rnd(ai) < 0.3) {
    issue({ c: 'slot' });
    return;
  }

  if (p.up < C.UPGRADE_MAX && p.gold > C.upgradeCost(p.up) + costs[2] * 2 && rnd(ai) < ai.cfg.smart) {
    issue({ c: 'upgrade' });
    return;
  }
  if (popOf(g, o) >= C.POP_CAP) return;
  // Héros : dès qu'on peut se le permettre sans vider la caisse
  const heroCost = C.unitStats(p.age, C.HERO_K).cost;
  if (!heroBusy(g, o) && p.gold > heroCost * 1.25 && p.queue.length < 3 && rnd(ai) < 0.4 + ai.cfg.smart * 0.4) {
    issue({ c: 'unit', k: C.HERO_K });
    return;
  }
  if (p.queue.length >= (p.gold > costs[2] * 3 ? 5 : 3)) return;
  // Composition : un tank devant, des tireurs derrière
  const ranged = mine.filter((u) => u.role === 'ranged').length;
  const front = mine.filter((u) => u.role !== 'ranged').length;
  let k;
  const r = rnd(ai);
  if (p.gold >= costs[2] * 1.15 && (r < 0.35 || p.gold > costs[2] * 4)) k = 2;
  else if (ranged < front * 0.8 && p.gold >= costs[1]) k = 1;
  else k = 0;
  if (p.gold >= costs[k]) issue({ c: 'unit', k });
}
