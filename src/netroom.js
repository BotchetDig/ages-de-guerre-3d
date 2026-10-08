// Transport multijoueur pour un artifact claude.ai : capability `room` de la plateforme.
// Même interface que Net (PeerJS) côté main.js : host / join / send / onMessage / onClose / close.
// Contraintes : 4 Kio par message ou par objet de présence, ~40 envois/s au total.
//  - snapshot de l'hôte → sa présence dans le salon de partie (prévu pour l'état à haute fréquence)
//  - commandes de l'invité, événements de l'hôte, start/bye → topics
import { PROJ } from './config.js';

const LIMIT = 3900;
const KINDS = Object.keys(PROJ);

export async function getRoom() {
  if (typeof window.claude?.use !== 'function') return null;
  try { return await window.claude.use('room'); } catch { return null; }
}

const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;
const r1 = (v) => Math.round(v * 10) / 10;

// ---------- Compactage du snapshot ----------

export function packSnap(s) {
  const out = {
    t: r1(s.t), o: s.over ? 1 : 0, w: s.winner,
    p: s.players.map((p) => [
      Math.floor(p.gold), Math.floor(p.xp), p.age, Math.ceil(p.hp), p.hpMax, p.slots,
      p.turrets.map((t) => (t ? t.age * 3 + t.k : -1)),
      p.queue.map((q) => [q.age * 3 + q.k, r1(q.t), r1(q.total)]),
      Math.ceil(p.specialCd), p.kills, p.lost, p.up,
    ]),
    u: s.units.map(([id, owner, age, k, x, hpf, moving, lastAtk, lvl]) => [id, owner * 15 + age * 3 + k, Math.round(x * 20), Math.round(hpf * 100), moving, Math.round(lastAtk * 10), lvl]),
    j: s.proj.map(([id, kind, x, y, dx, dy]) => [id, KINDS.indexOf(kind), Math.round(x * 10), Math.round(y * 10), Math.round(dx), Math.round(dy)]),
  };
  // Trop gros : on sacrifie d'abord les projectiles (purement visuels côté invité)
  while (out.j.length && bytes(out) > LIMIT) out.j.length = Math.floor(out.j.length * 0.7);
  return out;
}

export function unpackSnap(c) {
  return {
    t: c.t, over: !!c.o, winner: c.w,
    players: c.p.map(([gold, xp, age, hp, hpMax, slots, turrets, queue, specialCd, kills, lost, up]) => ({
      gold, xp, age, hp, hpMax, slots, specialCd, kills, lost, up,
      turrets: turrets.map((v) => (v < 0 ? null : { age: Math.floor(v / 3), k: v % 3 })),
      queue: queue.map(([v, t, total]) => ({ age: Math.floor(v / 3), k: v % 3, t, total })),
    })),
    units: c.u.map(([id, pk, x, hp, moving, lastAtk, lvl]) => [id, Math.floor(pk / 15), Math.floor((pk % 15) / 3), pk % 3, x / 20, hp / 100, moving, lastAtk / 10, lvl]),
    proj: c.j.map(([id, ki, x, y, dx, dy]) => [id, KINDS[ki], x / 10, y / 10, dx, dy]),
  };
}

// Événements : on garde les importants, on coupe les dégâts flottants si ça déborde.
function packEvents(ev) {
  const keep = ev.filter((e) => e.e !== 'hit');
  const hits = ev.filter((e) => e.e === 'hit');
  const round = (e) => {
    const o = {};
    for (const k in e) o[k] = typeof e[k] === 'number' ? r1(e[k]) : e[k];
    return o;
  };
  let out = keep.map(round);
  while (out.length && bytes(out) > LIMIT) out = out.filter((e, i) => i % 2 === 0 || ['die', 'evolve', 'special', 'over', 'turret', 'sell', 'slot', 'upgrade'].includes(e.e));
  for (const h of hits) {
    const r = round(h);
    if (bytes(out) + 60 > LIMIT) break;
    out.push(r);
  }
  return out;
}

export class RoomNet {
  constructor(room) {
    this.room = room;
    this.game = null;
    this.onMessage = () => {};
    this.onClose = () => {};
    this.unsubs = [];
    this.evBuf = [];
  }

  // Liste des parties en attente dans le lobby (présence des autres pages)
  watchLobby(fn) {
    const emit = () => fn(this.room.peers()
      .filter((p) => !p.isMe && typeof p.presence?.hosting === 'string')
      .map((p) => ({ code: p.presence.hosting.replace(/[^a-z0-9]/g, '').slice(0, 8), guest: p.guest }))
      .filter((gm) => gm.code));
    const off = this.room.onPeers(emit);
    emit();
    return off;
  }

  async host(onReady, onGuest, onError) {
    this.role = 'host';
    const code = Math.random().toString(36).slice(2, 8);
    try {
      this.game = await this.room.join('aow-' + code);
    } catch (e) { return onError('Impossible de créer le salon : ' + (e?.code ?? e)); }
    await this.room.presence({ hosting: code, since: Date.now() }).catch(() => {});
    onReady(code);
    this.unsubs.push(this.game.on('cmd', (m) => { if (!m.sameTab) this.onMessage({ t: 'cmd', cmd: m.data }); }));
    this.unsubs.push(this.game.on('bye', (m) => { if (!m.sameTab) this.onClose(); }));
    this.unsubs.push(this.game.onPeers((c) => {
      if (!this.guestPeer) {
        const g = c.peers.find((p) => !p.sameTab && p.kind === 'viewer');
        if (g) {
          this.guestPeer = g.peer;
          this.room.presence({ hosting: null }).catch(() => {});
          onGuest();
        }
      } else if (c.left.some((p) => p.peer === this.guestPeer)) this.onClose();
    }));
    this.startFlush();
  }

  async join(code, onOpen, onError) {
    this.role = 'guest';
    try {
      this.game = await this.room.join('aow-' + code);
    } catch (e) { return onError('Impossible de rejoindre : ' + (e?.code ?? e)); }
    onOpen();
    this.unsubs.push(this.game.on('start', (m) => { if (!m.sameTab) { this.hostPeer = m.peer; this.onMessage({ t: 'start' }); } }));
    this.unsubs.push(this.game.on('ev', (m) => { if (!m.sameTab && m.peer === this.hostPeer) this.onMessage({ t: 'events', ev: m.data }); }));
    this.unsubs.push(this.game.on('bye', (m) => { if (!m.sameTab) this.onClose(); }));
    this.unsubs.push(this.game.onPeers((c) => {
      // L'hôte est la page qui publie un snapshot dans sa présence : pas de course avec l'événement 'start'
      if (!this.hostPeer) {
        const first = c.peers.find((p) => !p.sameTab && p.presence?.s);
        if (first) { this.hostPeer = first.peer; this.onMessage({ t: 'start' }); }
      }
      const h = this.hostPeer && c.peers.find((p) => p.peer === this.hostPeer);
      if (h?.presence?.s) this.onMessage({ t: 'snap', s: unpackSnap(h.presence.s), ev: [] });
      if (this.hostPeer && c.left.some((p) => p.peer === this.hostPeer)) this.onClose();
    }));
  }

  send(msg) {
    if (!this.game) return;
    if (msg.t === 'snap') {
      this.game.presence({ s: packSnap(msg.s) }).catch(() => {});
      if (msg.ev?.length) this.evBuf.push(...msg.ev);
    } else if (msg.t === 'cmd') this.game.emit('cmd', msg.cmd).catch(() => {});
    else if (msg.t === 'start') this.game.emit('start', {}).catch(() => {});
  }

  // Événements groupés ~8 fois par seconde pour rester dans le budget d'envoi
  startFlush() {
    this.flushT = setInterval(() => {
      if (!this.evBuf.length || !this.game) return;
      const ev = packEvents(this.evBuf);
      this.evBuf = [];
      if (ev.length) this.game.emit('ev', ev).catch(() => {});
    }, 125);
  }

  close() {
    clearInterval(this.flushT);
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.game) {
      this.game.emit('bye', {}).catch(() => {});
      this.game.leave().catch(() => {});
    }
    this.room.presence({ hosting: null, s: null }).catch(() => {});
    this.game = null;
  }
}

export const ROOM_TOPICS = { cmd: 'interact', ev: 'interact', start: 'interact', bye: 'interact' };
