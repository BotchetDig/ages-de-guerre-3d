// Données de jeu : toutes les valeurs d'équilibrage sont ici.
// La simulation (sim.js) ne dépend que de ce fichier, ce qui permet de la faire tourner sous Node (tools/balance.mjs).

export const TICK = 1 / 30;
export const BASE_X = 30;          // position des bases : -BASE_X (joueur 0) et +BASE_X (joueur 1)
export const BASE_HALF = 2.6;      // demi-largeur de la hitbox d'une base
export const SPAWN_OFFSET = 3.6;
export const START_GOLD = 250;
export const QUEUE_MAX = 5;
export const POP_CAP = 18;          // unités vivantes + en production, par joueur
export const SPECIAL_CD = 55;
export const SLOT_COSTS = [0, 300, 1000, 3000];
export const COST_MULT = [1, 3.4, 11, 36, 115];
export const POWER_MULT = [1, 3.0, 9.0, 27, 80];
export const TRICKLE = [8, 22, 60, 170, 480];  // or/s passif par âge (source principale de revenus)
export const XP_TRICKLE = [4.2, 16.5, 58, 200, 0]; // XP/s passive : la progression ne dépend pas que du rythme des combats
export const KILL_GOLD = 0.6;                 // × coût de l'unité tuée
export const KILL_XP = 0.45;
export const SPEND_XP = 0.18;                 // XP par pièce d'or dépensée (unités, tourelles)
export const LOSS_XP = 0.15;                  // XP consolation pour le camp qui perd l'unité
export const TURRET_REFUND = 0.5;
export const SIEGE_MULT = 2;          // dégâts des unités contre les bases
export const EROSION_START = 12 * 60;  // après ce temps, les bases subissent des dégâts accrus
export const EROSION_PER_MIN = 0.25;   // +25% de dégâts subis par minute au-delà
export const EROSION_DECAY = 0.003;    // et perte de 0,3% des PV max par seconde
export const UPGRADE_MAX = 5;
export const UPGRADE_BONUS = 0.2;   // +20% PV et dégâts par niveau (unités produites ensuite)
// Prix fixe par niveau, indépendant de l'âge : investir tôt ou tard coûte pareil.
export const UPGRADE_COSTS = [200, 600, 1500, 4000, 10000];
export const upgradeCost = (lvl) => UPGRADE_COSTS[lvl] ?? Infinity;

// Dynamisme du combat
export const CRIT_CHANCE = 0.12;     // coups critiques des unités
export const CRIT_MULT = 2;
export const CHARGE_RANGE = 6;       // la mêlée charge quand l'ennemi est à moins de 6 m
export const CHARGE_MULT = 1.6;
export const KNOCKBACK_HEAVY = 0.7;  // recul infligé par un coup d'unité lourde
export const KNOCKBACK_AOE = 0.9;    // recul infligé par une explosion
export const HOLD_LINE = 13;         // posture « tenir la ligne » : distance max depuis sa base

const ROLE = {
  melee:  { cost: 15,  hp: 55,  dmg: 12, range: 0.5, cd: 1.0, speed: 3.6, build: 0.6, r: 0.45, hitY: 1.0 },
  ranged: { cost: 25,  hp: 38,  dmg: 8,  range: 7.5, cd: 1.3, speed: 3.3, build: 0.8, r: 0.45, hitY: 1.0 },
  heavy:  { cost: 100, hp: 250, dmg: 30, range: 0.6, cd: 1.6, speed: 2.5, build: 1.8, r: 1.1,  hitY: 1.6 },
};

const TURRET_ROLE = {
  single: { cost: 90,  dmg: 24, cd: 1.0,  range: 12,  aoe: 0 },
  splash: { cost: 170, dmg: 26, cd: 2.0,  range: 13,  aoe: 2.6 },
  rapid:  { cost: 260, dmg: 7.5, cd: 0.3, range: 10,  aoe: 0 },
};

// Projectiles : vitesse (u/s) et hauteur d'arc.
export const PROJ = {
  stone:   { speed: 14, arc: 1.4 },
  dart:    { speed: 24, arc: 0.4 },
  rock:    { speed: 12, arc: 4.0 },
  arrow:   { speed: 19, arc: 1.8 },
  bolt:    { speed: 30, arc: 0.3 },
  bullet:  { speed: 55, arc: 0 },
  ball:    { speed: 20, arc: 1.2 },
  shell:   { speed: 22, arc: 3.0 },
  rocket:  { speed: 17, arc: 1.0 },
  laser:   { speed: 70, arc: 0 },
  plasma:  { speed: 26, arc: 0.3 },
  ion:     { speed: 22, arc: 1.5 },
  tesla:   { speed: 120, arc: 0 },
  meteor:  { speed: 30, arc: 0 },
  volley:  { speed: 30, arc: 0 },
  bomb:    { speed: 30, arc: 0 },
  orbital: { speed: 90, arc: 0 },
};

export const AGES = [
  {
    id: 'prehistoric', name: 'Préhistoire', xpNext: 1000, baseHp: 600,
    units: [
      { name: 'Cogneur',  role: 'melee' },
      { name: 'Frondeur', role: 'ranged', proj: 'stone' },
      { name: 'Mammouth', role: 'heavy' },
    ],
    turrets: [
      { name: 'Lance-pierres', role: 'single', proj: 'stone' },
      { name: 'Catapulte',     role: 'splash', proj: 'rock' },
      { name: 'Sarbacanes',    role: 'rapid',  proj: 'dart' },
    ],
    special: { name: 'Pluie de météores', proj: 'meteor', count: 14, dmg: 45, aoe: 2.6 },
  },
  {
    id: 'medieval', name: 'Médiéval', xpNext: 4000, baseHp: 1500,
    units: [
      { name: 'Épéiste',   role: 'melee' },
      { name: 'Archer',    role: 'ranged', proj: 'arrow' },
      { name: 'Chevalier', role: 'heavy', speed: 3.1 },
    ],
    turrets: [
      { name: 'Baliste',     role: 'single', proj: 'bolt' },
      { name: 'Trébuchet',   role: 'splash', proj: 'rock' },
      { name: 'Arbalétriers', role: 'rapid', proj: 'arrow' },
    ],
    special: { name: 'Volée de flèches', proj: 'volley', count: 30, dmg: 22, aoe: 1.4 },
  },
  {
    id: 'gunpowder', name: 'Âge de la poudre', xpNext: 14000, baseHp: 4200,
    units: [
      { name: 'Grenadier',    role: 'melee' },
      { name: 'Mousquetaire', role: 'ranged', proj: 'bullet', range: 8.5 },
      { name: 'Canon',        role: 'heavy', proj: 'ball', range: 6, speed: 2.0, hp: 200, dmg: 34 },
    ],
    turrets: [
      { name: 'Couleuvrine', role: 'single', proj: 'ball' },
      { name: 'Mortier',     role: 'splash', proj: 'shell' },
      { name: 'Orgue',       role: 'rapid',  proj: 'bullet' },
    ],
    special: { name: "Barrage d'artillerie", proj: 'ball', count: 16, dmg: 40, aoe: 2.4 },
  },
  {
    id: 'modern', name: 'Ère moderne', xpNext: 48000, baseHp: 12000,
    units: [
      { name: 'Commando', role: 'melee' },
      { name: 'Fusilier', role: 'ranged', proj: 'bullet', range: 9 },
      { name: 'Char',     role: 'heavy', proj: 'shell', range: 6.5, speed: 2.3, hp: 280 },
    ],
    turrets: [
      { name: 'Canon AT',        role: 'single', proj: 'shell' },
      { name: 'Lance-roquettes', role: 'splash', proj: 'rocket' },
      { name: 'Mitrailleuse',    role: 'rapid',  proj: 'bullet' },
    ],
    special: { name: 'Frappe aérienne', proj: 'bomb', count: 12, dmg: 55, aoe: 3.0 },
  },
  {
    id: 'future', name: 'Futur', xpNext: Infinity, baseHp: 36000,
    units: [
      { name: 'Lame plasma', role: 'melee' },
      { name: 'Blaster',     role: 'ranged', proj: 'laser', range: 9 },
      { name: 'Méca',        role: 'heavy', proj: 'plasma', range: 4.5, speed: 2.2, hp: 300 },
    ],
    turrets: [
      { name: 'Laser',         role: 'single', proj: 'laser' },
      { name: 'Canon ionique', role: 'splash', proj: 'ion' },
      { name: 'Tesla',         role: 'rapid',  proj: 'tesla' },
    ],
    special: { name: 'Laser orbital', proj: 'orbital', count: 10, dmg: 80, aoe: 3.2 },
  },
];

// Emplacements de tourelles relatifs à la base (dx orienté vers l'ennemi).
export const TURRET_SLOTS = [
  { dx: 1.7, y: 4.6 },
  { dx: -0.4, y: 6.9 },
  { dx: 2.5, y: 2.6 },
  { dx: -1.9, y: 5.4 },
];

const cache = new Map();
export function unitStats(age, k) {
  const key = age * 10 + k;
  if (cache.has(key)) return cache.get(key);
  const def = AGES[age].units[k];
  const base = ROLE[def.role];
  const pm = POWER_MULT[age];
  const s = {
    age, k, name: def.name, role: def.role,
    cost: Math.round(base.cost * COST_MULT[age]),
    hp: Math.round((def.hp ?? base.hp) * pm),
    dmg: (def.dmg ?? base.dmg) * pm,
    range: def.range ?? base.range,
    atkCd: def.cd ?? base.cd,
    speed: def.speed ?? base.speed,
    build: def.build ?? base.build,
    r: base.r, hitY: base.hitY,
    proj: def.proj ?? null,
  };
  cache.set(key, s);
  return s;
}

export function turretStats(age, k) {
  const def = AGES[age].turrets[k];
  const base = TURRET_ROLE[def.role];
  return {
    age, k, name: def.name, role: def.role, proj: def.proj,
    cost: Math.round(base.cost * COST_MULT[age]),
    dmg: base.dmg * POWER_MULT[age],
    atkCd: base.cd, range: base.range, aoe: base.aoe,
  };
}

export function specialStats(age) {
  const s = AGES[age].special;
  return { ...s, dmg: s.dmg * POWER_MULT[age] };
}
