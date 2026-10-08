// Simulation pure (aucune dépendance au rendu). Autoritaire côté hôte / solo.
import * as C from './config.js';

export const dirOf = (o) => (o === 0 ? 1 : -1);
export const baseXOf = (o) => (o === 0 ? -C.BASE_X : C.BASE_X);
export const turretPos = (o, slot) => {
  const s = C.TURRET_SLOTS[slot];
  return { x: baseXOf(o) + dirOf(o) * s.dx, y: s.y };
};
const BASE = { base: true };

function newPlayer(i) {
  return {
    i, gold: C.START_GOLD, xp: 0, age: 0,
    hp: C.AGES[0].baseHp, hpMax: C.AGES[0].baseHp,
    queue: [], slots: 1, turrets: [null, null, null, null],
    specialCd: 10, incomeMult: 1, powerMult: 1, up: 0, kills: 0, lost: 0,
    stance: 'advance', // 'advance' | 'hold' (tenir la ligne près de la base)
  };
}

export function createGame() {
  return {
    t: 0, tick: 0, nextId: 1, over: false, winner: -1,
    players: [newPlayer(0), newPlayer(1)],
    units: [], projectiles: [], strikes: [], events: [],
    rng: 12345,
  };
}

function rand(g) {
  // mulberry32 : reproductible pour les tests d'équilibrage
  let t = (g.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- Commandes ----------

export function popOf(g, o) {
  let n = g.players[o].queue.length;
  for (const u of g.units) if (u.owner === o && !u.dead) n++;
  return n;
}

export function canEvolve(p) {
  return p.age < C.AGES.length - 1 && p.xp >= C.AGES[p.age].xpNext;
}

export function applyCommand(g, o, cmd) {
  if (g.over) return false;
  const p = g.players[o];
  switch (cmd.c) {
    case 'unit': {
      const s = C.unitStats(p.age, cmd.k);
      if (p.queue.length >= C.QUEUE_MAX || p.gold < s.cost || popOf(g, o) >= C.POP_CAP) return false;
      p.gold -= s.cost;
      p.xp += s.cost * C.SPEND_XP;
      p.queue.push({ age: p.age, k: cmd.k, t: s.build, total: s.build });
      return true;
    }
    case 'turret': {
      const s = C.turretStats(p.age, cmd.k);
      const slot = p.turrets.findIndex((t, i) => i < p.slots && !t);
      if (slot < 0 || p.gold < s.cost) return false;
      p.gold -= s.cost;
      p.xp += s.cost * C.SPEND_XP;
      p.turrets[slot] = { age: p.age, k: cmd.k, cd: 0.6 };
      g.events.push({ e: 'turret', o, slot });
      return true;
    }
    case 'slot': {
      if (p.slots >= 4) return false;
      const cost = C.SLOT_COSTS[p.slots];
      if (p.gold < cost) return false;
      p.gold -= cost;
      p.slots++;
      g.events.push({ e: 'slot', o, slot: p.slots - 1 });
      return true;
    }
    case 'sell': {
      let slot = cmd.slot ?? -1;
      if (slot < 0) for (let i = 3; i >= 0; i--) if (p.turrets[i]) { slot = i; break; }
      const t = p.turrets[slot];
      if (!t) return false;
      p.gold += Math.round(C.turretStats(t.age, t.k).cost * C.TURRET_REFUND);
      p.turrets[slot] = null;
      g.events.push({ e: 'sell', o, slot });
      return true;
    }
    case 'upgrade': {
      if (p.up >= C.UPGRADE_MAX) return false;
      const cost = C.upgradeCost(p.up);
      if (p.gold < cost) return false;
      p.gold -= cost;
      p.xp += cost * C.SPEND_XP;
      p.up++;
      g.events.push({ e: 'upgrade', o, lvl: p.up });
      return true;
    }
    case 'stance': {
      p.stance = cmd.v ?? (p.stance === 'hold' ? 'advance' : 'hold');
      g.events.push({ e: 'stance', o, v: p.stance });
      return true;
    }
    case 'cancel': {
      const q = p.queue.pop();
      if (!q) return false;
      p.gold += C.unitStats(q.age, q.k).cost;
      p.xp -= C.unitStats(q.age, q.k).cost * C.SPEND_XP;
      return true;
    }
    case 'special': {
      if (p.specialCd > 0) return false;
      const s = C.specialStats(p.age);
      p.specialCd = C.SPECIAL_CD;
      for (let i = 0; i < s.count; i++) {
        g.strikes.push({ o, age: p.age, t: 0.4 + (i / s.count) * 2.4 + rand(g) * 0.15 });
      }
      g.events.push({ e: 'special', o, age: p.age });
      return true;
    }
    case 'evolve': {
      if (!canEvolve(p)) return false;
      const pct = p.hp / p.hpMax;
      p.age++;
      p.hpMax = C.AGES[p.age].baseHp;
      p.hp = Math.max(1, Math.round(p.hpMax * Math.min(1, pct + 0.15)));
      g.events.push({ e: 'evolve', o, age: p.age });
      return true;
    }
  }
  return false;
}

// ---------- Boucle ----------

export function step(g, dt) {
  if (g.over) return;
  g.t += dt;
  g.tick++;
  g.byId = new Map();
  for (const u of g.units) g.byId.set(u.id, u);

  for (const p of g.players) stepPlayer(g, p, dt);
  if (g.t > C.EROSION_START) {
    for (const p of g.players) {
      p.hp -= p.hpMax * C.EROSION_DECAY * dt;
      if (p.hp <= 0 && !g.over) damageBase(g, p.i, 0, baseXOf(p.i));
    }
  }
  const lists = [[], []];
  for (const u of g.units) if (!u.dead) lists[u.owner].push(u);
  lists[0].sort((a, b) => b.x - a.x);   // front en premier
  lists[1].sort((a, b) => a.x - b.x);
  g.lists = lists;

  stepUnits(g, lists, dt);
  stepTurrets(g, lists, dt);
  stepStrikes(g, lists, dt);
  stepProjectiles(g, dt);
  g.units = g.units.filter((u) => !u.dead);
}

function stepPlayer(g, p, dt) {
  p.gold += C.TRICKLE[p.age] * p.incomeMult * dt;
  p.specialCd = Math.max(0, p.specialCd - dt);
  const q = p.queue[0];
  if (!q) return;
  q.t -= dt;
  if (q.t > 0) return;
  const s = C.unitStats(q.age, q.k);
  const sx = baseXOf(p.i) + dirOf(p.i) * C.SPAWN_OFFSET;
  for (const u of g.units) {
    if (u.owner === p.i && !u.dead && Math.abs(u.x - sx) < u.r + s.r + 0.3) return; // zone de spawn occupée
  }
  p.queue.shift();
  const m = (1 + p.up * C.UPGRADE_BONUS) * p.powerMult;
  const u = {
    id: g.nextId++, owner: p.i, age: q.age, k: q.k, x: sx,
    hp: s.hp * m, hpMax: s.hp * m, cd: 0.3, moving: false, lastAtk: -9, dead: false,
    ...pick(s), dmg: s.dmg * m, lvl: p.up,
  };
  g.units.push(u);
  g.events.push({ e: 'spawn', o: p.i, id: u.id });
}

function pick(s) {
  return { r: s.r, hitY: s.hitY, range: s.range, speed: s.speed, dmg: s.dmg, atkCd: s.atkCd, proj: s.proj, cost: s.cost, role: s.role };
}

function stepUnits(g, lists, dt) {
  for (let o = 0; o < 2; o++) {
    const d = dirOf(o);
    const list = lists[o];
    const ef = lists[1 - o].find((u) => !u.dead);
    const ebx = baseXOf(1 - o);
    const hold = g.players[o].stance === 'hold';
    const holdX = baseXOf(o) + d * C.HOLD_LINE;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u.dead) continue;
      const ahead = i > 0 ? list[i - 1] : null;
      const gapEnemy = ef ? (ef.x - u.x) * d - ef.r - u.r : Infinity;
      const gapBase = (ebx - u.x) * d - C.BASE_HALF - u.r;
      let target = null;
      if (gapEnemy <= u.range) target = ef;
      else if (gapBase <= u.range && gapBase < gapEnemy) target = BASE;

      let move = 0;
      if (!target) {
        // Charge : la mêlée accélère quand l'ennemi est proche
        const charge = u.role !== 'ranged' && gapEnemy < C.CHARGE_RANGE ? C.CHARGE_MULT : 1;
        move = u.speed * charge * dt;
        if (hold) move = Math.min(move, (holdX - u.x) * d);
        if (ahead) move = Math.min(move, (ahead.x - u.x) * d - ahead.r - u.r - 0.25);
        move = Math.min(move, gapEnemy - 0.02, gapBase);
      }
      u.moving = move > 0.0005;
      if (u.moving) u.x += d * move;

      u.cd -= dt;
      if (target && u.cd <= 0) {
        u.cd = u.atkCd;
        u.lastAtk = g.t;
        const crit = rand(g) < C.CRIT_CHANCE;
        const dmg = u.dmg * (crit ? C.CRIT_MULT : 1);
        if (u.proj) {
          fire(g, o, u.proj, u.x + d * u.r * 0.8, u.hitY + 0.3, target, target === BASE ? dmg * C.SIEGE_MULT : dmg, u.role === 'heavy' ? 1.2 : 0, u.age, -1, crit);
        } else if (target === BASE) {
          damageBase(g, 1 - o, dmg * C.SIEGE_MULT, u.x + d * (u.r + 0.3));
        } else {
          damageUnit(g, target, dmg, o, crit, u.role === 'heavy' ? C.KNOCKBACK_HEAVY : crit ? 0.25 : 0);
          g.events.push({ e: 'melee', o, x: target.x - d * target.r * 0.6, y: target.hitY, age: u.age, heavy: u.role === 'heavy' });
        }
      }
    }
  }
}

function stepTurrets(g, lists, dt) {
  for (const p of g.players) {
    const o = p.i;
    const ef = lists[1 - o].find((u) => !u.dead);
    for (let s = 0; s < 4; s++) {
      const t = p.turrets[s];
      if (!t) continue;
      t.cd -= dt;
      if (!ef || t.cd > 0) continue;
      const ts = C.turretStats(t.age, t.k);
      const pos = turretPos(o, s);
      if (Math.abs(ef.x - pos.x) > ts.range + ef.r) continue;
      t.cd = ts.atkCd;
      fire(g, o, ts.proj, pos.x + dirOf(o) * 0.6, pos.y + 0.6, ef, ts.dmg, ts.aoe, t.age, s);
    }
  }
}

function stepStrikes(g, lists, dt) {
  for (const st of g.strikes) {
    st.t -= dt;
    if (st.t > 0) continue;
    st.done = true;
    const s = C.specialStats(st.age);
    const enemies = lists[1 - st.o].filter((u) => !u.dead);
    let x;
    if (enemies.length && rand(g) < 0.8) {
      x = enemies[Math.floor(rand(g) * enemies.length)].x + (rand(g) - 0.5) * 2.5;
    } else {
      x = (rand(g) - 0.5) * C.BASE_X * 1.4 + dirOf(st.o) * 8;
    }
    const d = dirOf(st.o);
    const p = {
      id: g.nextId++, owner: st.o, kind: s.proj, age: st.age,
      x0: x - d * 7, y0: 26, x1: x, y1: 0, tid: -2, p: 0,
      dur: s.proj === 'orbital' ? 0.25 : 0.95, arc: 0, dmg: s.dmg, aoe: s.aoe, x: x - d * 7, y: 26,
    };
    g.projectiles.push(p);
  }
  g.strikes = g.strikes.filter((s) => !s.done);
}

function fire(g, o, kind, x0, y0, target, dmg, aoe, age, slot = -1, crit = false) {
  const isBase = target === BASE;
  const x1 = isBase ? baseXOf(1 - o) - dirOf(o) * C.BASE_HALF * 0.6 : target.x;
  const y1 = isBase ? 2.2 : target.hitY;
  const spec = C.PROJ[kind];
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const p = {
    id: g.nextId++, owner: o, kind, age, x0, y0, x1, y1,
    tid: isBase ? -1 : target.id, p: 0,
    dur: Math.max(0.06, dist / spec.speed), arc: spec.arc * Math.min(1, dist / 8),
    dmg, aoe, x: x0, y: y0, crit,
  };
  g.projectiles.push(p);
  g.events.push({ e: 'shoot', o, kind, x: x0, y: y0, slot, x1, y1 });
}

function stepProjectiles(g, dt) {
  const keep = [];
  for (const p of g.projectiles) {
    if (p.tid >= 0) {
      const t = g.byId.get(p.tid);
      if (t && !t.dead) { p.x1 = t.x; p.y1 = t.hitY; }
    }
    p.p += dt / p.dur;
    const k = Math.min(1, p.p);
    p.x = p.x0 + (p.x1 - p.x0) * k;
    p.y = p.y0 + (p.y1 - p.y0) * k + p.arc * Math.sin(Math.PI * k);
    if (p.p < 1) { keep.push(p); continue; }
    impact(g, p);
  }
  g.projectiles = keep;
}

function impact(g, p) {
  const enemy = 1 - p.owner;
  g.events.push({ e: 'impact', o: p.owner, kind: p.kind, x: p.x1, y: p.y1, age: p.age, aoe: p.aoe });
  if (p.aoe > 0) {
    for (const u of g.units) {
      if (u.owner !== enemy || u.dead) continue;
      const d = Math.abs(u.x - p.x1) - u.r;
      const near = d <= p.aoe * 0.4;
      if (d <= p.aoe) damageUnit(g, u, p.dmg * (near ? 1 : 0.6), p.owner, p.crit, C.KNOCKBACK_AOE * (near ? 1 : 0.5));
    }
    if (p.tid === -1) damageBase(g, enemy, p.dmg, p.x1);
    return;
  }
  if (p.tid === -1) return damageBase(g, enemy, p.dmg, p.x1);
  const t = g.byId.get(p.tid);
  if (t && !t.dead) damageUnit(g, t, p.dmg, p.owner, p.crit, 0);
}

function damageUnit(g, u, dmg, src, crit = false, kb = 0) {
  if (u.dead) return;
  u.hp -= dmg;
  if (kb > 0) {
    // Recul vers sa propre base (les lourds encaissent mieux), sans repasser derrière la zone d'apparition
    const d = dirOf(u.owner);
    const minX = baseXOf(u.owner) + d * C.SPAWN_OFFSET;
    u.x -= d * kb / (u.role === 'heavy' ? 2.5 : 1);
    if ((u.x - minX) * d < 0) u.x = minX;
  }
  g.events.push({ e: 'hit', id: u.id, o: u.owner, x: u.x, y: u.hitY, dmg: Math.round(dmg), crit: crit || undefined });
  if (u.hp > 0) return;
  u.dead = true;
  const killer = g.players[src];
  const victim = g.players[u.owner];
  killer.gold += u.cost * C.KILL_GOLD;
  // XP plafonnée à l'âge du tueur : pas d'élastique qui annulerait l'avance de celui qui évolue en premier
  const xpBase = u.age > killer.age ? u.cost * C.COST_MULT[killer.age] / C.COST_MULT[u.age] : u.cost;
  killer.xp += xpBase * C.KILL_XP;
  killer.kills++;
  victim.xp += u.cost * C.LOSS_XP;
  victim.lost++;
  g.events.push({
    e: 'die', id: u.id, o: u.owner, x: u.x, age: u.age, k: u.k, role: u.role,
    gold: Math.round(u.cost * C.KILL_GOLD), to: src,
  });
}

function damageBase(g, o, dmg, x) {
  const p = g.players[o];
  dmg *= erosion(g);
  p.hp -= dmg;
  g.events.push({ e: 'baseHit', o, x, dmg: Math.round(dmg) });
  if (p.hp <= 0 && !g.over) {
    p.hp = 0;
    g.over = true;
    g.winner = 1 - o;
    g.events.push({ e: 'over', winner: g.winner });
  }
}

export function erosion(g) {
  return g.t < C.EROSION_START ? 1 : 1 + ((g.t - C.EROSION_START) / 60) * C.EROSION_PER_MIN;
}

// ---------- Réseau ----------

export function snapshot(g) {
  return {
    t: g.t, over: g.over, winner: g.winner,
    players: g.players.map((p) => ({
      gold: p.gold, xp: p.xp, age: p.age, hp: p.hp, hpMax: p.hpMax, slots: p.slots,
      turrets: p.turrets.map((t) => (t ? { age: t.age, k: t.k } : null)),
      queue: p.queue.map((q) => ({ age: q.age, k: q.k, t: q.t, total: q.total })),
      specialCd: p.specialCd, kills: p.kills, lost: p.lost, up: p.up, stance: p.stance,
    })),
    units: g.units.map((u) => [u.id, u.owner, u.age, u.k, +u.x.toFixed(3), +(u.hp / u.hpMax).toFixed(3), u.moving ? 1 : 0, +u.lastAtk.toFixed(2), u.lvl]),
    proj: g.projectiles.map((p) => [p.id, p.kind, +p.x.toFixed(2), +p.y.toFixed(2), +(p.x1 - p.x0).toFixed(2), +(p.y1 - p.y0).toFixed(2)]),
  };
}

// Reconstruit un état "affichable" à partir d'un snapshot (côté invité).
export function applySnapshot(g, s) {
  g.t = s.t;
  g.over = s.over;
  g.winner = s.winner;
  s.players.forEach((sp, i) => Object.assign(g.players[i], sp));
  g.units = s.units.map(([id, owner, age, k, x, hpf, moving, lastAtk, lvl]) => {
    const st = C.unitStats(age, k);
    return { id, owner, age, k, x, hp: hpf * st.hp, hpMax: st.hp, moving: !!moving, lastAtk, lvl, r: st.r, hitY: st.hitY, role: st.role };
  });
  g.projectiles = s.proj.map(([id, kind, x, y, dx, dy]) => ({ id, kind, x, y, x0: x - dx, y0: y - dy, x1: x, y1: y }));
}
