import './style.css';
import * as C from './config.js';
import { createGame, step, applyCommand, snapshot, applySnapshot } from './sim.js';
import { createAI, aiThink, DIFFICULTY } from './ai.js';
import { GameView } from './view.js';
import { UI, KEYS, keyLabel, failReason, readKeyboardLayout } from './ui.js';
import { Audio } from './audio.js';
// PeerJS (navigateur classique) : chargé à la demande, absent du build artifact (salons claude.ai à la place)
const IS_ARTIFACT = import.meta.env.MODE === 'artifact';
const loadPeer = () => (IS_ARTIFACT ? Promise.resolve(null) : import('./net.js'));
const joinCodeFromUrl = () => location.hash.match(/join=([a-z0-9]+)/)?.[1] ?? null;
const inviteLink = (c) => `${location.origin}${location.pathname}#join=${c}`;
import { RoomNet, getRoom } from './netroom.js';

const $ = (s) => document.querySelector(s);
const show = (el, v) => el.classList.toggle('hidden', !v);

await readKeyboardLayout();

const audio = new Audio();
const view = new GameView($('#view'), audio);
const S = {
  mode: 'menu',          // menu | solo | host | guest
  g: createGame(),
  me: 0,
  ai: null,
  diff: 'normal',
  paused: false,
  speed: 1,
  acc: 0,
  net: null,
  sendEvents: [],
  ended: false,
};
const ui = new UI(view, issue);
if (import.meta.env.DEV) window.__S = S; // débogage

// Démo d'arrière-plan sur le menu : deux IA qui s'affrontent
let demoAIs = [createAI('normal', 11), createAI('normal', 23)];
view.reset(0);
view.cam.tdist = 36;

// Dans un artifact claude.ai : salons de la plateforme au lieu de PeerJS (détection non bloquante)
let room = null;
getRoom().then((r) => {
  room = r;
  if (r) show($('#btn-lobby'), true);
});

// ---------- Commandes du joueur ----------

function issue(cmd) {
  audio.unlock();
  if (S.mode === 'menu' || S.ended) return;
  const reason = failReason(S.g, S.me, cmd);
  if (reason) { ui.toast(reason); audio.play('error', view.cam.x, 0.6); return; }
  if (S.mode === 'guest') {
    S.net.send({ t: 'cmd', cmd });
    audio.play('click', view.cam.x, 0.5);
    return;
  }
  if (applyCommand(S.g, S.me, cmd)) audio.play(cmd.c === 'upgrade' ? 'upgrade' : 'click', view.cam.x, 0.5);
}

// ---------- Démarrage / fin ----------

function startGame(mode) {
  S.mode = mode;
  S.g = createGame();
  S.g.rng = (Math.random() * 1e9) | 0;
  S.me = mode === 'guest' ? 1 : 0;
  S.paused = false;
  S.speed = 1;
  S.acc = 0;
  S.ended = false;
  S.sendEvents = [];
  if (mode === 'solo') {
    S.ai = createAI(S.diff, (Math.random() * 1e6) | 1);
    const d = DIFFICULTY[S.diff];
    S.g.players[1].incomeMult = d.income;
    S.g.players[1].powerMult = d.power;
  } else S.ai = null;
  view.reset(S.me);
  view.cam.tdist = 26;
  for (const id of ['#menu', '#pause', '#end']) show($(id), false);
  show($('#hud'), true);
  audio.playMusic('battle');
  ui.toast(`Tu es ${S.me === 0 ? 'à gauche (bleu)' : 'à droite (rouge)'}. Bonne chance !`, 'info');
}

function endGame() {
  if (S.ended) return;
  S.ended = true;
  const g = S.g, p = g.players[S.me];
  const win = g.winner === S.me;
  audio.playMusic(win ? 'victory' : 'defeat');
  setTimeout(() => {
    $('#end').className = 'overlay ' + (win ? 'win' : 'lose');
    $('#end-title').textContent = win ? 'Victoire !' : 'Défaite';
    const t = g.t;
    $('#end-stats').innerHTML = `
      <div><b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b>Durée</div>
      <div><b>${C.AGES[p.age].name}</b>Âge atteint</div>
      <div><b>${p.kills}</b>Ennemis vaincus</div>
      <div><b>${p.lost}</b>Unités perdues</div>`;
    $('[data-act="again"]').textContent = S.mode === 'guest' ? "Attendre la revanche de l'hôte" : S.mode === 'host' ? 'Revanche' : 'Rejouer';
    $('[data-act="again"]').disabled = S.mode === 'guest';
    show($('#end'), true);
  }, 1800);
}

function toMenu(msg) {
  S.net?.close();
  S.net = null;
  S.mode = 'menu';
  S.ended = false;
  S.g = createGame();
  demoAIs = [createAI('normal', 11), createAI('normal', 23)];
  view.reset(0);
  view.cam.tdist = 36;
  history.replaceState(null, '', location.pathname);
  for (const id of ['#hud', '#pause', '#end']) show($(id), false);
  show($('#menu'), true);
  menuPage('main');
  audio.playMusic('menu');
  if (msg) { menuPage('join'); $('#join-status').textContent = msg; $('#join-status').classList.add('err'); }
}

// ---------- Réseau ----------

async function makeNet(statusEl) {
  if (room) return new RoomNet(room);
  const m = await loadPeer();
  if (m) return new m.Net();
  statusEl.textContent = "Le multijoueur n'est pas disponible ici : les salons claude.ai ne sont pas connectés.";
  statusEl.classList.add('err');
  return null;
}

async function hostOnline() {
  menuPage('online');
  const st = $('#net-status');
  st.textContent = 'Création du salon…';
  st.classList.remove('err');
  S.net = await makeNet(st);
  if (!S.net) return;
  S.net.onMessage = (m) => {
    if (m.t === 'cmd' && S.mode === 'host' && !S.ended) applyCommand(S.g, 1, m.cmd);
  };
  S.net.onClose = () => { if (S.mode === 'host' || S.mode === 'menu') toMenu("L'adversaire s'est déconnecté."); };
  S.net.host(
    (code) => {
      if (room) {
        st.textContent = "En attente d'un adversaire… Il doit ouvrir ce jeu et cliquer sur « Rejoindre une partie ».";
        show($('#link-row'), false);
        return;
      }
      st.textContent = "En attente d'un adversaire…";
      $('#invite').value = inviteLink(code);
      show($('#link-row'), true);
    },
    () => { S.net.send({ t: 'start' }); startGame('host'); },
    (err) => { st.textContent = err; st.classList.add('err'); }
  );
}

async function joinOnline(code) {
  show($('#menu'), true);
  menuPage('join');
  const st = $('#join-status');
  st.textContent = 'Connexion à la partie…';
  st.classList.remove('err');
  S.net = await makeNet(st);
  if (!S.net) return;
  S.net.onMessage = (m) => {
    if (m.t === 'start') { if (S.mode !== 'guest' || S.ended) startGame('guest'); }
    else if (m.t === 'events' && S.mode === 'guest') view.handle(m.ev, S.g);
    else if (m.t === 'snap' && S.mode === 'guest') {
      applySnapshot(S.g, m.s);
      view.handle(m.ev, S.g);
      if (S.g.over) endGame();
    }
  };
  S.net.onClose = () => toMenu("La connexion avec l'hôte a été perdue.");
  S.net.join(code, () => (st.textContent = "Connecté ! En attente du lancement par l'hôte…"), (err) => { st.textContent = err; st.classList.add('err'); });
}

// ---------- Boucle ----------

let last = performance.now();
let manual = false;
function frame(now) {
  if (!manual) requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = S.g;

  if (S.mode === 'menu') {
    // Démo : la simulation tourne en fond
    S.acc += dt;
    while (S.acc >= C.TICK) {
      S.acc -= C.TICK;
      for (let o = 0; o < 2; o++) aiThink(demoAIs[o], g, o, C.TICK, (cmd) => applyCommand(g, o, cmd));
      step(g, C.TICK);
      if (g.over) { S.g = createGame(); view.reset(0); view.cam.tdist = 36; }
    }
    view.handle(g.events.filter((e) => e.e !== 'hit' && e.e !== 'die'), g);
    g.events.length = 0;
    view.cam.tx = Math.sin(now / 9000) * 18;
  } else if (S.mode === 'solo' || S.mode === 'host') {
    if (!(S.paused && S.mode === 'solo') && !S.ended) {
      S.acc += dt * S.speed;
      let ticks = 0;
      while (S.acc >= C.TICK && ticks < 8) {
        S.acc -= C.TICK;
        ticks++;
        if (S.ai) aiThink(S.ai, g, 1, C.TICK, (cmd) => applyCommand(g, 1, cmd));
        step(g, C.TICK);
        if (S.mode === 'host' && g.tick % 2 === 0) {
          S.net.send({ t: 'snap', s: snapshot(g), ev: S.sendEvents.concat(g.events) });
          S.sendEvents = [];
        } else if (S.mode === 'host') S.sendEvents.push(...g.events);
        view.handle(g.events, g);
        g.events.length = 0;
        if (g.over) { if (S.mode === 'host') S.net.send({ t: 'snap', s: snapshot(g), ev: [] }); endGame(); break; }
      }
    }
  }

  // Caméra clavier
  const panSpeed = 30 * dt;
  if (held.has('ArrowLeft')) view.pan(-panSpeed);
  if (held.has('ArrowRight')) view.pan(panSpeed);
  if (held.has('ArrowUp')) view.cam.tdist = Math.max(14, view.cam.tdist - 30 * dt);
  if (held.has('ArrowDown')) view.cam.tdist = Math.min(56, view.cam.tdist + 30 * dt);
  // Bord de l'écran
  if (S.mode !== 'menu' && mouse.inside && !S.paused) {
    if (mouse.x < 12) view.pan(-panSpeed);
    else if (mouse.x > window.innerWidth - 12) view.pan(panSpeed);
  }

  if (S.mode !== 'menu' && !S.ended && g.players[S.me].age === 4) audio.playMusic('future');
  audio.listenerX = view.cam.x;
  view.update(g, dt);
  if (S.mode !== 'menu') ui.update(g, S.me, { enemyName: S.mode === 'solo' ? `IA ${DIFFICULTY[S.diff].label}` : 'Adversaire', speed: S.speed });
}

// ---------- Entrées ----------

const held = new Set();
const mouse = { x: 0, y: 0, inside: false };
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; });
document.addEventListener('mouseleave', () => (mouse.inside = false));
window.addEventListener('blur', () => held.clear());

const ACTIONS = {
  [KEYS.unit0]: { c: 'unit', k: 0 }, [KEYS.unit1]: { c: 'unit', k: 1 }, [KEYS.unit2]: { c: 'unit', k: 2 },
  [KEYS.turret0]: { c: 'turret', k: 0 }, [KEYS.turret1]: { c: 'turret', k: 1 }, [KEYS.turret2]: { c: 'turret', k: 2 },
  [KEYS.slot]: { c: 'slot' }, [KEYS.sell]: { c: 'sell' }, [KEYS.upgrade]: { c: 'upgrade' },
  [KEYS.evolve]: { c: 'evolve' }, [KEYS.special]: { c: 'special' }, [KEYS.cancel]: { c: 'cancel' },
};
const NUMPAD = { Numpad1: KEYS.unit0, Numpad2: KEYS.unit1, Numpad3: KEYS.unit2 };

window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.target.tagName === 'INPUT') return;
  held.add(e.code);
  if (S.mode === 'menu') return;
  if (e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
  if (e.repeat || S.paused) return;
  const a = ACTIONS[NUMPAD[e.code] ?? e.code];
  if (a) { issue(a); e.preventDefault(); return; }
  if (e.code === 'KeyF' && S.mode === 'solo') { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; ui.toast(`Vitesse ×${S.speed}`, 'info'); }
  if (e.code === 'KeyC') view.focusBase(S.me);
  if (e.code === 'KeyV') {
    const mine = S.g.units.filter((u) => u.owner === S.me);
    if (mine.length) view.cam.tx = S.me === 0 ? Math.max(...mine.map((u) => u.x)) : Math.min(...mine.map((u) => u.x));
  }
  if (e.code === 'Tab') { e.preventDefault(); view.cam.tdist = view.cam.tdist > 42 ? 26 : 54; }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('pointerdown', () => audio.unlock());

function togglePause() {
  if (S.ended) return;
  S.paused = !S.paused;
  $('#pause-note').textContent = S.mode === 'solo' ? '' : 'Partie en ligne : le jeu continue pendant la pause !';
  show($('#pause'), S.paused);
}

// ---------- Menus ----------

function menuPage(name) {
  for (const p of ['main', 'solo', 'online', 'join', 'help', 'lobby']) show($('#menu-' + p), p === name);
  if (name !== 'lobby' && lobbyOff) { lobbyOff(); lobbyOff = null; }
}

// Lobby (artifact) : les parties en attente sont lues dans la présence des autres pages
let lobbyOff = null;
function openLobby() {
  menuPage('lobby');
  const list = $('#lobby-list');
  lobbyOff = new RoomNet(room).watchLobby((games) => {
    list.replaceChildren();
    if (!games.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = "Aucune partie pour l'instant…";
      list.appendChild(d);
      return;
    }
    for (const gm of games) {
      const b = document.createElement('button');
      b.textContent = `Rejoindre la partie ${gm.code.toUpperCase()}${gm.guest ? ' (invité)' : ''}`;
      b.addEventListener('click', () => joinOnline(gm.code));
      list.appendChild(b);
    }
  });
}

const HELP = [
  [`${keyLabel[KEYS.unit0]} ${keyLabel[KEYS.unit1]} ${keyLabel[KEYS.unit2]}`, 'Produire une unité (mêlée, distance, lourde)'],
  [`${keyLabel[KEYS.turret0]} ${keyLabel[KEYS.turret1]} ${keyLabel[KEYS.turret2]}`, 'Construire une tourelle'],
  [keyLabel[KEYS.slot], 'Acheter un emplacement de tourelle'],
  [keyLabel[KEYS.sell], 'Vendre la dernière tourelle'],
  [keyLabel[KEYS.upgrade], "Améliorer l'armée (+20 %)"],
  [keyLabel[KEYS.evolve], "Évoluer vers l'âge suivant"],
  ['Espace', 'Attaque spéciale'],
  [keyLabel[KEYS.cancel], 'Annuler la dernière unité en file'],
  ['← →  / glisser', 'Déplacer la caméra'],
  ['Molette ↑ ↓', 'Zoom'],
  ['Tab', 'Vue d’ensemble'],
  ['C / V', 'Centrer sur ma base / sur le front'],
  ['F', 'Vitesse ×1 ×2 ×3 (solo)'],
  ['Échap', 'Pause'],
];
const helpHtml = HELP.map(([k, d]) => `<span class="key">${k}</span><span>${d}</span>`).join('');
$('#help-keys').innerHTML = helpHtml;
$('#pause-keys').innerHTML = helpHtml;

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act], [data-diff]');
  if (!b) return;
  audio.unlock();
  audio.play('click', view.cam.x, 0.5);
  if (b.dataset.diff) {
    S.diff = b.dataset.diff;
    for (const x of document.querySelectorAll('[data-diff]')) x.classList.toggle('sel', x === b);
    return;
  }
  switch (b.dataset.act) {
    case 'solo': menuPage('solo'); break;
    case 'host': hostOnline(); break;
    case 'lobby': openLobby(); break;
    case 'help': menuPage('help'); break;
    case 'back': menuPage('main'); break;
    case 'start-solo': startGame('solo'); break;
    case 'cancel-online': toMenu(); break;
    case 'resume': togglePause(); break;
    case 'quit': toMenu(); break;
    case 'again':
      if (S.mode === 'solo') startGame('solo');
      else if (S.mode === 'host') { S.net.send({ t: 'start' }); startGame('host'); }
      break;
  }
});

$('#copy').addEventListener('click', async () => {
  const inp = $('#invite');
  try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
  $('#copy').textContent = 'Copié !';
  setTimeout(() => ($('#copy').textContent = 'Copier le lien'), 1500);
});

for (const [a, b] of [['#vol-music', '#vol-music2'], ['#vol-sfx', '#vol-sfx2']]) {
  const isMusic = a.includes('music');
  for (const sel of [a, b]) {
    const el = $(sel);
    el.value = isMusic ? audio.musicVol : audio.sfxVol;
    el.addEventListener('input', () => {
      const v = +el.value;
      if (isMusic) audio.setMusicVolume(v); else audio.setSfxVolume(v);
      $(sel === a ? b : a).value = v;
    });
  }
}

// ---------- Lancement ----------
audio.playMusic('menu');
const joinCode = joinCodeFromUrl();
if (joinCode) joinOnline(joinCode);
requestAnimationFrame(frame);
if (import.meta.env.DEV) {
  // Débogage : avance le jeu de N secondes même quand l'onglet est masqué (rAF suspendu)
  window.__advance = (sec, fps = 30) => { manual = true; for (let i = 0; i < sec * fps; i++) frame(last + 1000 / fps); manual = false; };
  window.__view = view;
  // Bataille de test à l'âge donné : les deux camps ont des tourelles et une armée au contact
  window.__setup = (age = 0, sec = 14, camX = -6) => {
    startGame('solo');
    S.ai = null;
    const g = S.g;
    for (const p of g.players) { p.age = age; p.hp = p.hpMax = C.AGES[age].baseHp; p.gold = 1e7; p.slots = 3; }
    for (let o = 0; o < 2; o++) for (let k = 0; k < 3; k++) applyCommand(g, o, { c: 'turret', k });
    manual = true;
    for (let i = 0; i < sec * 30; i++) {
      if (i % 25 === 0) for (let o = 0; o < 2; o++) applyCommand(g, o, { c: 'unit', k: [0, 1, 0, 2, 1][(i / 25) % 5] });
      frame(last + 33.3);
    }
    manual = false;
    view.cam.tx = view.cam.x = camX;
  };
  // Capture : avance d'une image puis lit le canvas dans la même tâche (avant que le buffer soit effacé)
  window.__shot = async (name = 'shot') => {
    if (!view.renderer.domElement.width) view.resize();
    manual = true; frame(last + 33); manual = false;
    const data = view.renderer.domElement.toDataURL('image/jpeg', 0.85);
    await fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data }) });
    return name;
  };
}
