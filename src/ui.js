// Interface HTML : HUD, cartes de production, menus. Mise à jour par diff pour éviter de toucher le DOM inutilement.
import * as C from './config.js';
import { canEvolve, popOf, erosion } from './sim.js';

const $ = (s, r = document) => r.querySelector(s);

// Raccourcis : codes physiques (fonctionne en AZERTY comme en QWERTY), libellés lus depuis la disposition réelle.
export const KEYS = {
  unit0: 'Digit1', unit1: 'Digit2', unit2: 'Digit3',
  turret0: 'KeyQ', turret1: 'KeyW', turret2: 'KeyE',
  slot: 'KeyR', sell: 'KeyS', upgrade: 'KeyT', evolve: 'KeyU', special: 'Space', cancel: 'KeyX', stance: 'KeyG',
};
const DEFAULT_LABELS = { Digit1: '1', Digit2: '2', Digit3: '3', KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyS: 'S', KeyT: 'T', KeyU: 'U', Space: 'Espace', KeyX: 'X', KeyF: 'F', KeyC: 'C', KeyH: 'H', KeyG: 'G' };
export const keyLabel = { ...DEFAULT_LABELS };
if (/^fr/i.test(navigator.language)) Object.assign(keyLabel, { KeyQ: 'A', KeyW: 'Z' });

export async function readKeyboardLayout() {
  try {
    const map = await navigator.keyboard?.getLayoutMap?.();
    if (!map) return;
    for (const code of Object.keys(DEFAULT_LABELS)) {
      const k = map.get(code);
      if (k && code !== 'Space') keyLabel[code] = k.toUpperCase();
    }
  } catch {}
}

const fmt = (n) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
const time = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function failReason(g, o, cmd) {
  const p = g.players[o];
  switch (cmd.c) {
    case 'unit': {
      const s = C.unitStats(p.age, cmd.k);
      if (popOf(g, o) >= C.POP_CAP) return 'Population maximale atteinte';
      if (p.queue.length >= C.QUEUE_MAX) return 'File de production pleine';
      if (p.gold < s.cost) return "Pas assez d'or";
      return null;
    }
    case 'turret': {
      if (!p.turrets.some((t, i) => i < p.slots && !t)) return p.slots < 4 ? "Aucun emplacement libre : achète-en un (" + keyLabel[KEYS.slot] + ')' : 'Aucun emplacement libre : vends une tourelle (' + keyLabel[KEYS.sell] + ')';
      if (p.gold < C.turretStats(p.age, cmd.k).cost) return "Pas assez d'or";
      return null;
    }
    case 'slot': return p.slots >= 4 ? 'Tous les emplacements sont débloqués' : p.gold < C.SLOT_COSTS[p.slots] ? "Pas assez d'or" : null;
    case 'sell': return p.turrets.some(Boolean) ? null : 'Aucune tourelle à vendre';
    case 'upgrade': return p.up >= C.UPGRADE_MAX ? 'Amélioration maximale' : p.gold < C.upgradeCost(p.up) ? "Pas assez d'or" : null;
    case 'special': return p.specialCd > 0 ? `Attaque spéciale prête dans ${Math.ceil(p.specialCd)} s` : null;
    case 'evolve': return p.age >= 4 ? 'Âge final atteint' : canEvolve(p) ? null : "Pas assez d'expérience";
    case 'cancel': return p.queue.length ? null : 'File vide';
    case 'stance': return null;
  }
  return null;
}

export class UI {
  constructor(view, issue) {
    this.view = view;
    this.issue = issue;
    this.cache = new Map();
    this.hud = $('#hud');
    this.buildBar();
    this.toastEl = $('#toast');
    this.tip = $('#tip');
  }

  set(el, prop, v) {
    const key = el;
    let c = this.cache.get(key);
    if (!c) this.cache.set(key, (c = {}));
    if (c[prop] === v) return;
    c[prop] = v;
    if (prop === 'text') el.textContent = v;
    else if (prop === 'html') el.innerHTML = v;
    else if (prop.startsWith('--')) el.style.setProperty(prop, v);
    else if (prop.startsWith('.')) el.classList.toggle(prop.slice(1), !!v);
    else if (prop === 'src') el.src = v;
    else el.style[prop] = v;
  }

  buildBar() {
    const card = (cmd, k, key) => `
      <button class="card" data-c="${cmd}" data-k="${k}">
        <img alt="" />
        <span class="key">${keyLabel[key]}</span>
        <span class="name"></span>
        <span class="cost"><i class="coin"></i><b></b></span>
        <span class="cd"></span>
      </button>`;
    $('#units').innerHTML = [0, 1, 2].map((k) => card('unit', k, KEYS['unit' + k])).join('');
    $('#turrets').innerHTML = [0, 1, 2].map((k) => card('turret', k, KEYS['turret' + k])).join('');
    $('#utils').innerHTML = `
      <button class="util" data-c="slot"><span class="key">${keyLabel[KEYS.slot]}</span><span class="ico">⊕</span><span class="lbl">Emplacement</span><span class="cost"><i class="coin"></i><b></b></span></button>
      <button class="util" data-c="sell"><span class="key">${keyLabel[KEYS.sell]}</span><span class="ico">⇩</span><span class="lbl">Vendre</span><span class="cost sub">50 %</span></button>
      <button class="util" data-c="stance"><span class="key">${keyLabel[KEYS.stance]}</span><span class="ico stance-ico">⚔</span><span class="lbl stance-lbl">Attaque</span><span class="cost sub stance-sub">Avancer</span></button>
      <button class="util" data-c="upgrade"><span class="key">${keyLabel[KEYS.upgrade]}</span><span class="ico">▲</span><span class="lbl">Armée <em class="pips"></em></span><span class="cost"><i class="coin"></i><b></b></span></button>`;
    $('#special').innerHTML = `<span class="key">${keyLabel[KEYS.special]}</span><span class="ring"></span><span class="ico">☄</span><span class="lbl"></span>`;
    $('#evolve').innerHTML = `<span class="fill"></span><span class="lbl">ÉVOLUER</span><span class="key">${keyLabel[KEYS.evolve]}</span>`;
    for (const b of this.hud.querySelectorAll('[data-c]')) {
      b.addEventListener('click', () => this.issue({ c: b.dataset.c, k: b.dataset.k != null ? +b.dataset.k : undefined }));
      b.addEventListener('pointerenter', () => { this.hover = b; });
      b.addEventListener('pointerleave', () => { if (this.hover === b) this.hover = null; });
    }
    $('#queue').addEventListener('click', () => this.issue({ c: 'cancel' }));
  }

  toast(msg, kind = 'warn') {
    this.toastEl.textContent = msg;
    this.toastEl.className = 'show ' + kind;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => (this.toastEl.className = ''), 1600);
  }

  update(g, me, extra) {
    const p = g.players[me];
    const age = C.AGES[p.age];

    // Panneaux joueurs
    for (let o = 0; o < 2; o++) {
      const pl = g.players[o];
      const el = $(`#p${o}`);
      this.set($('.who', el), 'text', o === me ? 'Toi' : extra.enemyName);
      this.set($('.age', el), 'text', C.AGES[pl.age].name);
      this.set($('.hpfill', el), 'width', (pl.hp / pl.hpMax) * 100 + '%');
      this.set($('.hptxt', el), 'text', `${fmt(pl.hp)} / ${fmt(pl.hpMax)}`);
      this.set(el, '.low', pl.hp / pl.hpMax < 0.25);
    }
    this.set($('#clock'), 'text', time(g.t));
    const ero = erosion(g);
    this.set($('#erosion'), 'text', ero > 1 ? `Les remparts s'effritent ×${ero.toFixed(1)}` : '');
    this.set($('#speed'), 'text', extra.speed > 1 ? `Vitesse ×${extra.speed}` : '');

    // Ressources
    this.set($('#gold b'), 'text', fmt(p.gold));
    this.set($('#income'), 'text', `+${fmt(C.TRICKLE[p.age] * (p.incomeMult ?? 1))}/s`);
    this.set($('#pop b'), 'text', `${popOf(g, me)}/${C.POP_CAP}`);
    const xpNeed = age.xpNext;
    const xpK = p.age >= 4 ? 1 : Math.min(1, p.xp / xpNeed);
    this.set($('#xp .fill'), 'width', xpK * 100 + '%');
    this.set($('#xp b'), 'text', p.age >= 4 ? 'Âge final' : `${fmt(p.xp)} / ${fmt(xpNeed)} XP`);
    const ev = $('#evolve');
    this.set(ev, '.ready', canEvolve(p));
    this.set(ev, '.hidden', p.age >= 4);
    this.set($('.fill', ev), 'width', xpK * 100 + '%');
    this.set($('.lbl', ev), 'text', p.age < 4 ? `ÉVOLUER → ${C.AGES[p.age + 1].name}` : '');

    // Cartes d'unités
    for (const b of $('#units').children) {
      const k = +b.dataset.k;
      const s = C.unitStats(p.age, k);
      this.set($('img', b), 'src', this.view.thumbnail('unit', p.age, k, me));
      this.set($('.name', b), 'text', s.name);
      this.set($('.cost b', b), 'text', fmt(s.cost));
      this.set(b, '.off', !!failReason(g, me, { c: 'unit', k }));
    }
    for (const b of $('#turrets').children) {
      const k = +b.dataset.k;
      const s = C.turretStats(p.age, k);
      this.set($('img', b), 'src', this.view.thumbnail('turret', p.age, k, me));
      this.set($('.name', b), 'text', s.name);
      this.set($('.cost b', b), 'text', fmt(s.cost));
      this.set(b, '.off', !!failReason(g, me, { c: 'turret', k }));
    }
    const [slotB, sellB, stanceB, upB] = $('#utils').children;
    const hold = p.stance === 'hold';
    this.set(stanceB, '.hold', hold);
    this.set($('.stance-ico', stanceB), 'text', hold ? '🛡' : '⚔');
    this.set($('.stance-lbl', stanceB), 'text', hold ? 'Défense' : 'Attaque');
    this.set($('.stance-sub', stanceB), 'text', hold ? 'Tenir la ligne' : 'Avancer');
    this.set($('.cost b', slotB), 'text', p.slots >= 4 ? 'MAX' : fmt(C.SLOT_COSTS[p.slots]));
    this.set(slotB, '.off', !!failReason(g, me, { c: 'slot' }));
    this.set(sellB, '.off', !!failReason(g, me, { c: 'sell' }));
    this.set($('.cost b', upB), 'text', p.up >= C.UPGRADE_MAX ? 'MAX' : fmt(C.upgradeCost(p.up)));
    this.set($('.pips', upB), 'text', '●'.repeat(p.up) + '○'.repeat(C.UPGRADE_MAX - p.up));
    this.set(upB, '.off', !!failReason(g, me, { c: 'upgrade' }));

    const sp = $('#special');
    const spK = 1 - p.specialCd / C.SPECIAL_CD;
    this.set(sp, '--k', String(spK));
    this.set(sp, '.ready', p.specialCd <= 0);
    this.set($('.lbl', sp), 'text', p.specialCd > 0 ? `${age.special.name} · ${Math.ceil(p.specialCd)} s` : age.special.name);

    // File de production
    const q = $('#queue');
    const items = [];
    for (let i = 0; i < C.QUEUE_MAX; i++) {
      const it = p.queue[i];
      if (!it) { items.push('<span class="qi empty"></span>'); continue; }
      const prog = i === 0 ? Math.round((1 - it.t / it.total) * 20) / 20 : 0;
      items.push(`<span class="qi" style="--p:${prog}"><img src="${this.view.thumbnail('unit', it.age, it.k, me)}"/></span>`);
    }
    this.set(q, 'html', items.join(''));

    this.drawMinimap(g, me, extra.camX, extra.camHalf);
    this.updateTip(g, me);
  }

  // Mini-carte : voie, bases (PV), unités, zone visible ; clic/glisser = déplacer la caméra
  drawMinimap(g, me, camX, camHalf) {
    const cv = this.mini ??= $('#minimap');
    const ctx = this.miniCtx ??= cv.getContext('2d');
    const W = cv.width, H = cv.height, span = C.BASE_X + 4;
    const X = (x) => ((x + span) / (2 * span)) * W;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, H / 2 - 2, W, 4);
    for (let o = 0; o < 2; o++) {
      const pl = g.players[o], bx = X(o === 0 ? -C.BASE_X : C.BASE_X);
      ctx.fillStyle = o === 0 ? '#60a5fa' : '#ff5a4a';
      const h = (H - 6) * Math.max(0, pl.hp / pl.hpMax);
      ctx.globalAlpha = 0.35; ctx.fillRect(bx - 5, 3, 10, H - 6);
      ctx.globalAlpha = 1; ctx.fillRect(bx - 5, H - 3 - h, 10, h);
    }
    for (const u of g.units) {
      ctx.fillStyle = u.owner === 0 ? '#93c5fd' : '#ff9a8a';
      const r = u.role === 'heavy' ? 3 : 2;
      ctx.fillRect(X(u.x) - r, H / 2 - r - (u.owner === me ? 0 : 0), r * 2, r * 2);
    }
    ctx.strokeStyle = 'rgba(255,223,138,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(camX - camHalf), 1, X(camX + camHalf) - X(camX - camHalf), H - 2);
  }

  banner(title, sub, kind = 'me') {
    const b = $('#banner');
    b.innerHTML = '';
    const h = document.createElement('div'); h.className = 'bt'; h.textContent = title;
    const p = document.createElement('div'); p.className = 'bs'; p.textContent = sub;
    b.append(h, p);
    b.className = 'show ' + kind;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => (b.className = ''), 2600);
  }

  updateTip(g, me) {
    const b = this.hover;
    if (!b) { this.set(this.tip, '.show', false); return; }
    const p = g.players[me];
    let html = '';
    const c = b.dataset.c, k = +b.dataset.k;
    if (c === 'unit') {
      const s = C.unitStats(p.age, k);
      const m = 1 + p.up * C.UPGRADE_BONUS;
      html = `<h4>${s.name}</h4><p>${{ melee: 'Corps à corps', ranged: 'Distance', heavy: 'Lourd' }[s.role]}</p>
        <ul><li>PV <b>${fmt(s.hp * m)}</b></li><li>Dégâts <b>${fmt(s.dmg * m)}</b> / ${s.atkCd}s</li><li>Portée <b>${s.range.toFixed(1)}</b></li><li>Production <b>${s.build}s</b></li></ul>`;
    } else if (c === 'turret') {
      const s = C.turretStats(p.age, k);
      html = `<h4>${s.name}</h4><p>${{ single: 'Tir précis', splash: 'Dégâts de zone', rapid: 'Tir rapide' }[s.role]}</p>
        <ul><li>Dégâts <b>${fmt(s.dmg)}</b> / ${s.atkCd}s</li><li>Portée <b>${s.range}</b></li>${s.aoe ? `<li>Zone <b>${s.aoe}</b></li>` : ''}</ul>`;
    } else if (c === 'slot') html = `<h4>Emplacement de tourelle</h4><p>${p.slots}/4 débloqués</p>`;
    else if (c === 'stance') html = `<h4>Posture de l'armée</h4><p>${p.stance === 'hold' ? 'Défense : tes unités tiennent la ligne près de ta base, sous la protection des tourelles.' : 'Attaque : tes unités avancent vers la base ennemie.'} Clique pour basculer.</p>`;
    else if (c === 'sell') html = `<h4>Vendre une tourelle</h4><p>Rend 50 % du prix. Vend la plus haute.</p>`;
    else if (c === 'upgrade') html = `<h4>Entraînement de l'armée</h4><p>+${C.UPGRADE_BONUS * 100} % PV et dégâts par niveau pour les unités produites ensuite. Niveau ${p.up}/${C.UPGRADE_MAX}.</p>`;
    else if (c === 'special') html = `<h4>${C.AGES[p.age].special.name}</h4><p>Frappe les unités ennemies. Recharge ${C.SPECIAL_CD} s.</p>`;
    else if (c === 'evolve') html = `<h4>Évolution</h4><p>${p.age < 4 ? `Passe à : ${C.AGES[p.age + 1].name}. Nouvelles unités, tourelles et base renforcée.` : 'Âge final.'}</p>`;
    const reason = failReason(g, me, { c, k });
    if (reason) html += `<p class="why">${reason}</p>`;
    this.set(this.tip, 'html', html);
    const r = b.getBoundingClientRect();
    this.set(this.tip, 'left', Math.min(window.innerWidth - 230, Math.max(8, r.left + r.width / 2 - 110)) + 'px');
    this.set(this.tip, 'bottom', window.innerHeight - r.top + 10 + 'px');
    this.set(this.tip, '.show', true);
  }
}
