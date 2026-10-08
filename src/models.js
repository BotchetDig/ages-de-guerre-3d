// Modèles low-poly procéduraux : unités (5 âges × 3), bases, tourelles, projectiles.
// Chaque unité est construite une fois par (âge, type, équipe) puis clonée (géométries et matériaux partagés).
import * as THREE from 'three';
import { rimUniforms } from './world.js';

export const TEAM = [0x3b82f6, 0xef4444];
export const TEAM_GLOW = [0x60a5fa, 0xff5a4a];

// ---------- Helpers ----------

const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    transparent: !!o.opacity, opacity: o.opacity ?? 1,
  });
  addRim(m);
  matCache.set(key, m);
  return m;
}
// Contour lumineux façon fresnel : détache les unités du décor (couleur selon l'ambiance)
export function addRim(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = rimUniforms.rimColor;
    sh.uniforms.rimStrength = rimUniforms.rimStrength;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace('#include <opaque_fragment>', 'float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);\noutgoingLight += rimColor * rimF * rimStrength;\n#include <opaque_fragment>');
  };
}
const glow = (color, ei = 2.5) => mat(color, { emissive: color, ei, rough: 0.4 });

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function mesh(g, m, x = 0, y = 0, z = 0, parent) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  if (parent) parent.add(me);
  return me;
}
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 7) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const ico = (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
const cone = (r, h, s = 6) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const dode = (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
const torus = (r, t, arc) => geo(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 4, 10, arc));
function pivot(name, x, y, z, parent) {
  const p = new THREE.Group();
  p.name = name;
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

// ---------- Palettes ----------

const SKIN = 0xd9a066;
const WOOD = 0x8b5a2b;
const DARKWOOD = 0x5a3a1e;
const STEEL = 0x9aa3ad;
const DARK = 0x2a2d33;
const BRONZE = 0xb0793a;
const OLIVE = 0x5b6b34;
const WHITE = 0xe8ebef;

// ---------- Humanoïde ----------
// Face à +X. Les membres pivotent autour de Z (plan de marche XY).
function humanoid(o) {
  const root = new THREE.Group();
  const s = o.scale ?? 1;
  const hips = pivot('hips', 0, 0.92 * s, 0, root);
  const torso = pivot('torso', 0, 0, 0, hips);
  mesh(box(0.34 * s, 0.62 * s, 0.56 * s), mat(o.body), 0, 0.33 * s, 0, torso);
  if (o.belt) mesh(box(0.36 * s, 0.1 * s, 0.58 * s), mat(o.belt), 0, 0.06 * s, 0, torso);
  if (o.tabard) mesh(box(0.06, 0.5 * s, 0.34 * s), mat(o.tabard), 0.18 * s, 0.33 * s, 0, torso);
  if (o.pack) mesh(box(0.22 * s, 0.38 * s, 0.4 * s), mat(o.pack), -0.26 * s, 0.38 * s, 0, torso);
  const head = pivot('head', 0, 0.78 * s, 0, torso);
  mesh(ico(0.2 * s, 0), mat(o.head ?? SKIN), 0, 0, 0, head);
  if (o.hat) o.hat(head, s);
  if (o.visor) mesh(box(0.06, 0.08 * s, 0.26 * s), glow(o.visor, 3), 0.18 * s, 0.02 * s, 0, head);

  const legs = [];
  for (const z of [-0.15, 0.15]) {
    const leg = pivot(z < 0 ? 'legL' : 'legR', 0, 0, z * s, hips);
    mesh(box(0.2 * s, 0.86 * s, 0.2 * s), mat(o.legs), 0, -0.43 * s, 0, leg);
    mesh(box(0.28 * s, 0.1 * s, 0.22 * s), mat(o.boots ?? DARKWOOD), 0.05 * s, -0.87 * s, 0, leg);
    legs.push(leg);
  }
  const arms = [];
  for (const z of [-0.36, 0.36]) {
    const arm = pivot(z < 0 ? 'armL' : 'armR', 0, 0.58 * s, z * s, torso);
    mesh(box(0.15 * s, 0.6 * s, 0.15 * s), mat(o.arms ?? o.body), 0, -0.28 * s, 0, arm);
    mesh(ico(0.09 * s), mat(o.hands ?? SKIN), 0, -0.6 * s, 0, arm);
    arms.push(arm);
  }
  const hand = pivot('hand', 0, -0.6 * s, 0, arms[1]);
  if (o.weapon) o.weapon(hand, s);
  const off = pivot('offhand', 0, -0.6 * s, 0, arms[0]);
  if (o.offhand) o.offhand(off, s);
  root.userData.rig = 'biped';
  root.userData.height = 2.0 * s;
  return root;
}

// ---------- Quadrupède (mammouth, cheval) ----------
function quadruped(o) {
  const root = new THREE.Group();
  const s = o.scale;
  const body = pivot('body', 0, o.legH * s, 0, root);
  mesh(ico(1, 1), mat(o.color), 0, 0.35 * s, 0, body).scale.set(o.len * s, o.h * s, o.w * s);
  const head = pivot('head', o.len * 0.85 * s, 0.6 * s, 0, body);
  mesh(ico(0.55, 0), mat(o.color), 0, 0, 0, head).scale.set(o.headS * s, o.headS * s, o.headS * 0.85 * s);
  if (o.decor) o.decor(body, head, s);
  for (const [i, x, z] of [[0, 1, 1], [1, 1, -1], [2, -1, 1], [3, -1, -1]]) {
    const leg = pivot('leg' + i, x * o.len * 0.55 * s, 0, z * o.w * 0.55 * s, body);
    mesh(cyl(0.2 * s * o.legW, 0.17 * s * o.legW, o.legH * s, 6), mat(o.legColor ?? o.color), 0, -o.legH * 0.5 * s, 0, leg);
  }
  root.userData.rig = 'quad';
  root.userData.height = (o.legH + o.h + 0.6) * s;
  return root;
}

// ---------- Véhicule ----------
function vehicle(o) {
  const root = new THREE.Group();
  const body = pivot('body', 0, 0, 0, root);
  o.build(body);
  root.userData.rig = 'vehicle';
  root.userData.height = o.height;
  return root;
}

// ---------- Armes ----------
const W = {
  club: (h) => { mesh(cyl(0.07, 0.04, 0.8, 5), mat(WOOD), 0.32, -0.05, 0, h).rotation.z = -Math.PI / 2.4; mesh(dode(0.15), mat(DARKWOOD), 0.66, 0.08, 0, h); },
  sling: (h) => { mesh(cyl(0.015, 0.015, 0.5, 3), mat(0xc8b48a), 0, -0.25, 0, h); mesh(dode(0.08), mat(0x8a8a8a), 0, -0.5, 0, h); },
  sword: (h) => { const b = mesh(box(0.06, 0.9, 0.04), mat(0xdfe5ea, { metal: 0.8, rough: 0.3 }), 0.4, 0.05, 0, h); b.rotation.z = -Math.PI / 2.2; mesh(box(0.08, 0.06, 0.3), mat(BRONZE, { metal: 0.6 }), 0.0, 0.0, 0, h); },
  bow: (h) => { const b = mesh(torus(0.45, 0.025, Math.PI), mat(DARKWOOD), 0.05, 0, 0, h); b.rotation.set(0, Math.PI / 2, -Math.PI / 2); },
  musket: (h, bay) => {
    const g = new THREE.Group(); h.add(g); g.rotation.z = -Math.PI / 2.1;
    mesh(box(0.08, 0.7, 0.08), mat(WOOD), 0, 0.15, 0, g);
    mesh(cyl(0.03, 0.03, 0.8, 5), mat(DARK, { metal: 0.6 }), 0, 0.85, 0, g);
    if (bay) mesh(cone(0.03, 0.35, 3), mat(0xdfe5ea, { metal: 0.8 }), 0, 1.4, 0, g);
  },
  knife: (h) => { const k = mesh(box(0.04, 0.32, 0.03), mat(0xcfd6dc, { metal: 0.8, rough: 0.3 }), 0.18, 0, 0, h); k.rotation.z = -Math.PI / 2.3; },
  rifle: (h) => {
    const g = new THREE.Group(); h.add(g); g.rotation.z = -Math.PI / 2.05;
    mesh(box(0.1, 0.55, 0.08), mat(0x3b3f45), 0, 0.2, 0, g);
    mesh(cyl(0.03, 0.03, 0.55, 5), mat(DARK, { metal: 0.6 }), 0, 0.7, 0, g);
    mesh(box(0.06, 0.18, 0.05), mat(0x3b3f45), -0.08, 0.1, 0, g);
  },
  plasmaBlade: (team) => (h) => { const b = mesh(box(0.05, 1.0, 0.05), glow(TEAM_GLOW[team], 4), 0.45, 0.05, 0, h); b.rotation.z = -Math.PI / 2.2; },
  blaster: (team) => (h) => {
    const g = new THREE.Group(); h.add(g); g.rotation.z = -Math.PI / 2.05;
    mesh(box(0.14, 0.55, 0.12), mat(0x30343b, { metal: 0.5 }), 0, 0.25, 0, g);
    mesh(box(0.06, 0.12, 0.13), glow(TEAM_GLOW[team], 3), 0, 0.56, 0, g);
  },
  shield: (team) => (h) => { const s = mesh(cyl(0.32, 0.32, 0.06, 8), mat(TEAM[team]), 0.12, 0.05, 0, h); s.rotation.z = Math.PI / 2; s.rotation.y = 0; },
  lance: (h) => { const l = mesh(cone(0.07, 2.4, 5), mat(0xdcdcdc, { metal: 0.4 }), 1.0, 0.1, 0, h); l.rotation.z = -Math.PI / 2; },
};

const HATS = {
  hair: (c) => (h, s) => mesh(ico(0.21 * s), mat(c), -0.04 * s, 0.07 * s, 0, h).scale.set(1, 0.7, 1),
  band: (c) => (h, s) => mesh(cyl(0.21 * s, 0.21 * s, 0.07 * s, 7), mat(c), 0, 0.06 * s, 0, h),
  helmet: (h, s) => { mesh(cyl(0.21 * s, 0.23 * s, 0.25 * s, 7), mat(STEEL, { metal: 0.7, rough: 0.35 }), 0, 0.08 * s, 0, h); mesh(cone(0.1 * s, 0.2 * s, 5), mat(STEEL, { metal: 0.7 }), 0, 0.3 * s, 0, h); },
  hood: (c) => (h, s) => mesh(cone(0.26 * s, 0.5 * s, 6), mat(c), -0.03 * s, 0.12 * s, 0, h),
  shako: (h, s) => mesh(cyl(0.2 * s, 0.17 * s, 0.38 * s, 7), mat(0x1f1f24), 0, 0.22 * s, 0, h),
  tricorn: (h, s) => mesh(cone(0.36 * s, 0.22 * s, 3), mat(0x1f1f24), 0, 0.17 * s, 0, h),
  combat: (h, s) => mesh(ico(0.24 * s, 1), mat(OLIVE), 0, 0.07 * s, 0, h).scale.set(1, 0.65, 1),
  futur: (h, s) => mesh(ico(0.24 * s, 1), mat(WHITE, { metal: 0.3, rough: 0.35 }), 0, 0.02 * s, 0, h).scale.set(1.05, 1, 1),
  plume: (c) => (h, s) => { HATS.helmet(h, s); mesh(box(0.3 * s, 0.12 * s, 0.05 * s), mat(c), -0.1 * s, 0.38 * s, 0, h); },
};

// ---------- Unités ----------

function buildUnit(age, k, team) {
  const T = TEAM[team];
  switch (age * 3 + k) {
    case 0: return humanoid({ body: 0xb07a4a, belt: T, legs: 0x7a4a24, arms: SKIN, head: SKIN, hat: HATS.hair(0x3a2516), weapon: W.club, boots: SKIN });
    case 1: return humanoid({ body: 0x9c6b3e, belt: 0x6b4423, legs: 0x7a4a24, arms: SKIN, hat: HATS.band(T), weapon: W.sling, boots: SKIN });
    case 2: return quadruped({
      scale: 1, color: 0x6b4423, len: 1.25, h: 0.95, w: 0.85, legH: 1.0, legW: 1.5, headS: 1.25,
      decor: (body, head) => {
        mesh(box(1.2, 0.18, 1.5), mat(T), -0.1, 1.15, 0, body);
        const trunk = pivot('trunk', 0.45, -0.25, 0, head);
        for (let i = 0; i < 3; i++) mesh(cyl(0.13 - i * 0.025, 0.11 - i * 0.025, 0.42, 5), mat(0x5e3b1f), 0.08 * i, -0.2 - i * 0.38, 0, trunk);
        for (const z of [-0.3, 0.3]) { const t = mesh(cone(0.08, 0.95, 5), mat(0xf3ead2), 0.45, -0.3, z, head); t.rotation.z = -Math.PI / 1.6; }
      },
    });
    case 3: return humanoid({ body: STEEL, tabard: T, legs: 0x5d6670, arms: STEEL, hat: HATS.helmet, weapon: W.sword, offhand: W.shield(team), boots: DARK });
    case 4: return humanoid({ body: 0x4d6b3a, tabard: T, legs: 0x5a4a32, hat: HATS.hood(0x3f5a2e), offhand: W.bow, pack: DARKWOOD });
    case 5: {
      const horse = quadruped({
        scale: 1, color: 0xe7e2d6, len: 1.05, h: 0.5, w: 0.45, legH: 1.05, legW: 0.75, headS: 0.75, legColor: 0xd6cfbf,
        decor: (body, head) => {
          mesh(box(1.5, 0.35, 1.0), mat(T), 0, 0.55, 0, body);
          head.position.set(1.0, 0.85, 0);
          mesh(box(0.35, 0.65, 0.3), mat(0xe7e2d6), -0.25, -0.35, 0, head).rotation.z = 0.6;
        },
      });
      const rider = humanoid({ body: STEEL, tabard: T, legs: STEEL, hat: HATS.plume(T), weapon: W.lance, offhand: W.shield(team), scale: 0.9 });
      rider.position.set(-0.05, 0.75, 0);
      rider.name = 'rider';
      horse.getObjectByName('body').add(rider);
      horse.userData.height = 3.2;
      return horse;
    }
    case 6: return humanoid({ body: T, belt: WHITE, legs: WHITE, hat: HATS.shako, weapon: (h) => W.musket(h, true), boots: DARK });
    case 7: return humanoid({ body: T, belt: 0xd8c28a, legs: WHITE, hat: HATS.tricorn, weapon: (h) => W.musket(h, false), boots: DARK });
    case 8: return vehicle({
      height: 2.0,
      build: (b) => {
        mesh(box(1.6, 0.4, 0.8), mat(DARKWOOD), -0.1, 0.75, 0, b);
        mesh(box(1.4, 0.12, 0.84), mat(T), -0.1, 0.98, 0, b);
        const barrel = pivot('barrel', 0.1, 1.15, 0, b);
        const br = mesh(cyl(0.2, 0.26, 1.9, 8), mat(BRONZE, { metal: 0.7, rough: 0.35 }), 0.6, 0, 0, barrel); br.rotation.z = -Math.PI / 2;
        mesh(ico(0.24), mat(BRONZE, { metal: 0.7 }), -0.4, 0, 0, barrel);
        for (const z of [-0.5, 0.5]) { const w = mesh(cyl(0.55, 0.55, 0.12, 10), mat(WOOD), -0.1, 0.55, z, b); w.rotation.x = Math.PI / 2; w.name = 'wheel'; }
      },
    });
    case 9: return humanoid({ body: OLIVE, belt: 0x3a3f2a, tabard: T, legs: 0x4a5530, hat: HATS.combat, weapon: W.knife, boots: DARK });
    case 10: return humanoid({ body: OLIVE, belt: 0x3a3f2a, tabard: T, legs: 0x4a5530, hat: HATS.combat, weapon: W.rifle, pack: 0x4a5530, boots: DARK });
    case 11: return vehicle({
      height: 2.2,
      build: (b) => {
        mesh(box(2.4, 0.6, 1.4), mat(0x56623a), 0, 0.6, 0, b);
        mesh(box(2.0, 0.12, 1.42), mat(T), 0, 0.92, 0, b);
        for (const z of [-0.78, 0.78]) {
          mesh(box(2.6, 0.5, 0.32), mat(0x26282b), 0, 0.3, z, b);
          for (let i = 0; i < 5; i++) { const w = mesh(cyl(0.2, 0.2, 0.34, 7), mat(0x3a3d42), -1.0 + i * 0.5, 0.25, z, b); w.rotation.x = Math.PI / 2; w.name = 'wheel'; }
        }
        const tur = pivot('turret', -0.1, 1.15, 0, b);
        mesh(cyl(0.55, 0.65, 0.42, 8), mat(0x5f6c40), 0, 0, 0, tur);
        const barrel = pivot('barrel', 0.4, 0.05, 0, tur);
        mesh(cyl(0.08, 0.1, 1.6, 6), mat(0x3a3f2a), 0.8, 0, 0, barrel).rotation.z = -Math.PI / 2;
      },
    });
    case 12: return humanoid({ body: WHITE, belt: DARK, legs: 0x3a3f48, arms: 0x3a3f48, hat: HATS.futur, visor: TEAM_GLOW[team], weapon: W.plasmaBlade(team), boots: DARK, tabard: T });
    case 13: return humanoid({ body: WHITE, belt: DARK, legs: 0x3a3f48, arms: 0x3a3f48, hat: HATS.futur, visor: TEAM_GLOW[team], weapon: W.blaster(team), pack: 0x3a3f48, boots: DARK });
    case 14: {
      const m = humanoid({
        scale: 1.7, body: WHITE, belt: DARK, legs: 0x3a3f48, arms: 0x3a3f48, head: WHITE, visor: TEAM_GLOW[team], boots: DARK,
        weapon: (h, s) => { mesh(box(0.5, 0.3, 0.3), mat(0x30343b, { metal: 0.5 }), 0.2, -0.05, 0, h); mesh(box(0.12, 0.2, 0.2), glow(TEAM_GLOW[team], 3), 0.5, -0.05, 0, h); },
        offhand: (h) => { mesh(box(0.5, 0.3, 0.3), mat(0x30343b, { metal: 0.5 }), 0.2, -0.05, 0, h); mesh(box(0.12, 0.2, 0.2), glow(TEAM_GLOW[team], 3), 0.5, -0.05, 0, h); },
        tabard: T,
      });
      m.userData.mech = true;
      return m;
    }
  }
}

const unitProto = new Map();
export function makeUnit(age, k, team) {
  const key = `${age}-${k}-${team}`;
  if (!unitProto.has(key)) unitProto.set(key, buildUnit(age, k, team));
  const proto = unitProto.get(key);
  const root = proto.clone(true);
  root.userData = { ...proto.userData };
  const names = ['hips', 'torso', 'head', 'legL', 'legR', 'armL', 'armR', 'body', 'leg0', 'leg1', 'leg2', 'leg3', 'trunk', 'barrel', 'turret', 'rider'];
  const parts = {};
  for (const n of names) parts[n] = root.getObjectByName(n);
  parts.wheels = [];
  root.traverse((o) => { if (o.name === 'wheel') parts.wheels.push(o); });
  if (parts.rider) {
    parts.riderArmR = parts.rider.getObjectByName('armR');
    parts.riderArmL = parts.rider.getObjectByName('armL');
  }
  root.userData.parts = parts;
  return root;
}

// Animation procédurale : phase de marche + impulsion d'attaque (0..1).
export function animateUnit(root, phase, moving, atk, t) {
  const P = root.userData.parts;
  const rig = root.userData.rig;
  const sw = moving ? Math.sin(phase) : 0;
  const swing = atk > 0 ? Math.sin(Math.min(1, atk) * Math.PI) : 0;
  if (rig === 'biped') {
    const mech = root.userData.mech;
    const amp = mech ? 0.45 : 0.75;
    P.legL.rotation.z = sw * amp;
    P.legR.rotation.z = -sw * amp;
    P.armL.rotation.z = -sw * 0.5 * amp;
    P.armR.rotation.z = sw * 0.5 * amp - swing * 1.9 + (atk > 0 ? 0.4 : 0);
    P.hips.position.y = P.hips.userData.y0 ?? (P.hips.userData.y0 = P.hips.position.y);
    P.hips.position.y = P.hips.userData.y0 + (moving ? Math.abs(Math.cos(phase)) * 0.06 * (mech ? 2 : 1) : Math.sin(t * 2) * 0.012);
    P.torso.rotation.z = -swing * 0.25 + (moving ? 0.06 : 0);
  } else if (rig === 'quad') {
    for (let i = 0; i < 4; i++) P['leg' + i].rotation.z = (i === 0 || i === 3 ? sw : -sw) * 0.45;
    P.body.position.y = (P.body.userData.y0 ?? (P.body.userData.y0 = P.body.position.y)) + (moving ? Math.abs(Math.cos(phase)) * 0.08 : 0);
    if (P.head) P.head.rotation.z = -swing * 0.5 + Math.sin(t * 1.5) * 0.04;
    if (P.trunk) P.trunk.rotation.z = Math.sin(t * 2 + phase) * 0.15 - swing * 0.8;
    if (P.riderArmR) P.riderArmR.rotation.z = -swing * 0.8 + 0.9;
    if (P.riderArmL) P.riderArmL.rotation.z = 0.3;
  } else if (rig === 'vehicle') {
    for (const w of P.wheels) w.rotation.y = phase * 0.6;
    P.body.position.y = moving ? Math.sin(phase * 2) * 0.03 : 0;
    P.body.position.x = -swing * 0.25;
  }
}

// ---------- Bases ----------

function buildBase(age, team) {
  const T = TEAM[team];
  const g = new THREE.Group();
  const add = (geo_, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const me = mesh(geo_, m, x, y, z, g); me.scale.set(sx, sy, sz); return me; };
  const flag = (x, y, z, h = 2.4) => {
    add(cyl(0.05, 0.05, h, 5), mat(DARKWOOD), x, y + h / 2, z);
    const f = add(box(0.9, 0.55, 0.04), mat(T), x + 0.45, y + h - 0.3, z);
    f.name = 'flag';
  };
  switch (age) {
    case 0: {
      for (const [x, y, z, s] of [[-0.5, 1.2, 0, 2.6], [0.9, 0.8, -1.2, 1.6], [-1.5, 0.7, 1.4, 1.5], [0.2, 2.6, 0.2, 1.7], [-1.0, 3.6, -0.3, 1.1]]) {
        add(dode(1), mat(0x7d7366), x, y, z, s, s * 0.85, s);
      }
      add(cyl(0.9, 1.2, 1.6, 7), mat(0x1b1610), 1.6, 0.8, 0.0, 0.4, 1, 1);
      for (let i = 0; i < 9; i++) {
        const z = -2.4 + i * 0.6;
        add(cyl(0.13, 0.15, 2.0 + (i % 3) * 0.3, 5), mat(WOOD), 2.4, 1.0, z);
        add(cone(0.15, 0.4, 5), mat(DARKWOOD), 2.4, 2.2 + (i % 3) * 0.3, z);
      }
      for (const z of [-1.6, 1.6]) { add(cyl(0.06, 0.08, 1.2, 5), mat(DARKWOOD), 2.9, 0.6, z); add(ico(0.18), glow(0xff8a2a, 4), 2.9, 1.3, z).name = 'torch'; }
      flag(-0.5, 4.2, 0);
      break;
    }
    case 1: {
      add(box(3.2, 5.5, 3.2), mat(0x9b958a), 0, 2.75, 0);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i === 0 || i === 3 || j === 0 || j === 3) add(box(0.5, 0.6, 0.5), mat(0x8c867b), -1.35 + i * 0.9, 5.8, -1.35 + j * 0.9);
      add(cone(1.9, 2.4, 4), mat(T), -0.8, 7.5, 0).rotation.y = Math.PI / 4;
      add(box(1.2, 3.4, 1.2), mat(0x9b958a), -0.8, 5.0, 0);
      add(box(4.2, 2.4, 4.8), mat(0x8f897e), 0.6, 1.2, 0);
      add(box(0.2, 1.7, 1.3), mat(DARKWOOD), 2.72, 0.85, 0);
      for (let z = -2.1; z <= 2.1; z += 0.84) add(box(0.4, 0.45, 0.4), mat(0x8c867b), 2.5, 2.6, z);
      flag(-0.8, 8.4, 0, 1.6);
      break;
    }
    case 2: {
      add(cyl(2.7, 3.3, 2.6, 6), mat(0xa0563c), 0, 1.3, 0);
      add(cyl(2.8, 2.8, 0.3, 6), mat(0xc9b28a), 0, 2.75, 0);
      add(cyl(1.4, 1.6, 3.4, 8), mat(0xb26446), -0.6, 4.3, 0);
      add(cyl(1.55, 1.55, 0.3, 8), mat(0xc9b28a), -0.6, 6.1, 0);
      add(box(0.25, 1.6, 1.4), mat(DARKWOOD), 2.95, 0.8, 0);
      for (const z of [-1.2, 1.2]) { const c = add(cyl(0.16, 0.2, 1.3, 7), mat(DARK, { metal: 0.6 }), 2.9, 2.2, z); c.rotation.z = -Math.PI / 2; }
      flag(-0.6, 6.2, 0, 2.2);
      break;
    }
    case 3: {
      add(box(4.8, 2.6, 5), mat(0x8d9096), 0.2, 1.3, 0);
      add(box(2.6, 3.0, 3.2), mat(0x7f8389), -0.7, 4.0, 0);
      add(box(4.9, 0.25, 5.1), mat(0x5d6066), 0.2, 2.68, 0);
      add(box(0.15, 0.5, 3.4), glow(TEAM_GLOW[team], 1.6), 1.85, 1.6, 0);
      for (let z = -2.2; z <= 2.2; z += 0.55) add(ico(0.32, 0), mat(0xb5a27a), 2.9, 0.3, z, 1.1, 0.6, 1);
      for (let z = -2.0; z <= 2.0; z += 0.6) add(ico(0.3, 0), mat(0xa8956d), 2.9, 0.65, z + 0.3, 1.1, 0.6, 1);
      const dish = add(new THREE.SphereGeometry(0.9, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xd7dadf, { metal: 0.4 }), -1.0, 6.2, 0);
      dish.rotation.z = 0.9; dish.name = 'radar';
      add(cyl(0.04, 0.04, 2.6, 4), mat(DARK), 0.2, 6.6, 1.2);
      add(ico(0.1), glow(0xff3030, 4), 0.2, 7.9, 1.2).name = 'blink';
      flag(0.4, 5.5, -1.2, 2.0);
      break;
    }
    case 4: {
      add(cyl(2.4, 3.0, 3.2, 6), mat(WHITE, { metal: 0.3, rough: 0.3 }), 0, 1.6, 0);
      add(cyl(2.45, 2.45, 0.18, 6), glow(TEAM_GLOW[team], 2.5), 0, 2.4, 0);
      add(cyl(1.0, 1.7, 4.0, 6), mat(0x3a3f48, { metal: 0.6, rough: 0.35 }), -0.4, 5.0, 0);
      add(cone(0.9, 2.4, 6), mat(WHITE, { metal: 0.3, rough: 0.3 }), -0.4, 8.2, 0);
      add(ico(0.55, 1), glow(TEAM_GLOW[team], 4), -0.4, 7.1, 0).name = 'core';
      const ring = add(new THREE.TorusGeometry(2.0, 0.08, 4, 32), glow(TEAM_GLOW[team], 3), -0.4, 7.1, 0);
      ring.rotation.x = Math.PI / 2; ring.name = 'ring';
      add(box(0.12, 1.6, 2.0), glow(TEAM_GLOW[team], 2), 2.75, 1.2, 0);
      break;
    }
  }
  return g;
}

// Plateformes de tourelles (montrées quand l'emplacement est débloqué)
export function makeSlotPlatform(age) {
  const colors = [WOOD, 0x8c867b, 0xc9b28a, 0x5d6066, 0x3a3f48];
  const g = new THREE.Group();
  mesh(box(1.4, 0.2, 1.4), mat(colors[age]), 0, -0.1, 0, g);
  mesh(cyl(0.12, 0.16, 2.2, 5), mat(colors[age]), 0, -1.2, 0, g);
  return g;
}

const gltfBases = new Map(); // age -> THREE.Object3D (normalisé) | null
const GLTF_TWEAK = { 0: { bright: 1.7, height: 6.5 }, 3: { bright: 1.15, height: 7.2 }, 4: { bright: 1.25, height: 8.2 } };
export function registerGltfBase(age, scene) {
  const tw = GLTF_TWEAK[age] ?? { bright: 1, height: 7.5 };
  const box3 = new THREE.Box3().setFromObject(scene);
  const size = box3.getSize(new THREE.Vector3());
  const s = Math.min(tw.height / Math.max(size.y, 0.001), 7 / Math.max(size.x, 0.001));
  scene.scale.setScalar(s);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material.color.multiplyScalar(tw.bright);
    o.material.metalness = 0;
    o.material.roughness = 0.85;
  });
  box3.setFromObject(scene);
  const c = box3.getCenter(new THREE.Vector3());
  scene.position.x -= c.x;
  scene.position.z -= c.z;
  scene.position.y -= box3.min.y;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const wrap = new THREE.Group();
  wrap.add(scene);
  wrap.userData.top = new THREE.Box3().setFromObject(scene).max.y;
  gltfBases.set(age, wrap);
}

export function makeBase(age, team) {
  const custom = gltfBases.get(age);
  if (custom) {
    const g = custom.clone(true);
    g.userData.custom = true;
    const top = custom.userData.top;
    const T = TEAM[team];
    if (age === 4) {
      // Accents lumineux aux couleurs de l'équipe (le modèle Meshy n'a pas d'émissif)
      const ring = mesh(new THREE.TorusGeometry(2.6, 0.07, 4, 40), glow(TEAM_GLOW[team], 3), 0, top * 0.62, 0, g);
      ring.rotation.x = Math.PI / 2; ring.name = 'ring';
      mesh(ico(0.35, 1), glow(TEAM_GLOW[team], 4), 0, top + 0.6, 0, g).name = 'core';
    } else {
      const flag = new THREE.Group();
      mesh(cyl(0.05, 0.05, 2.4, 5), mat(DARKWOOD), 0, 1.2, 0, flag);
      mesh(box(0.9, 0.55, 0.04), mat(T), 0.45, 2.1, 0, flag).name = 'flag';
      flag.position.set(-0.8, top - 0.6, -0.4);
      g.add(flag);
    }
    if (age === 0) {
      for (const x of [-2.6, 2.6]) {
        mesh(cyl(0.06, 0.08, 1.2, 5), mat(DARKWOOD), x, 0.6, 1.6, g);
        mesh(ico(0.18), glow(0xff8a2a, 4), x, 1.3, 1.6, g).name = 'torch';
      }
    }
    return g;
  }
  return buildBase(age, team);
}

// ---------- Tourelles ----------

export function makeTurret(age, k, team) {
  const pal = [
    { base: WOOD, head: DARKWOOD, barrel: 0x8a8a8a },
    { base: 0x8c867b, head: WOOD, barrel: DARKWOOD },
    { base: DARKWOOD, head: BRONZE, barrel: BRONZE },
    { base: 0x5d6066, head: 0x56623a, barrel: 0x2e3238 },
    { base: 0x3a3f48, head: WHITE, barrel: TEAM_GLOW[team] },
  ][age];
  const g = new THREE.Group();
  mesh(cyl(0.45, 0.55, 0.4, 7), mat(pal.base), 0, 0.2, 0, g);
  const head = pivot('head', 0, 0.55, 0, g);
  mesh(box(0.7, 0.45, 0.6), mat(pal.head, age === 4 ? { metal: 0.3, rough: 0.3 } : {}), 0, 0, 0, head);
  mesh(box(0.72, 0.08, 0.62), mat(TEAM[team]), 0, 0.24, 0, head);
  const bm = age === 4 ? glow(pal.barrel, 2.5) : mat(pal.barrel, { metal: age >= 2 ? 0.6 : 0 });
  if (k === 0) {
    mesh(cyl(0.08, 0.1, 1.2, 6), bm, 0.75, 0.05, 0, head).rotation.z = -Math.PI / 2;
  } else if (k === 1) {
    const b = mesh(cyl(0.2, 0.24, 0.8, 7), bm, 0.4, 0.2, 0, head);
    b.rotation.z = -Math.PI / 3.2;
  } else {
    for (const z of [-0.18, 0, 0.18]) mesh(cyl(0.05, 0.05, 1.0, 5), bm, 0.65, 0.02, z, head).rotation.z = -Math.PI / 2;
  }
  if (age === 0 && k === 1) mesh(dode(0.22), mat(0x8a8a8a), 0.1, 0.5, 0, head);
  return g;
}

// ---------- Projectiles ----------

const projProto = new Map();
export function makeProjectile(kind, team) {
  const key = kind + team;
  if (!projProto.has(key)) {
    const g = new THREE.Group();
    const TG = TEAM_GLOW[team];
    switch (kind) {
      case 'stone': mesh(dode(0.12), mat(0x8a8a8a), 0, 0, 0, g); break;
      case 'rock': mesh(dode(0.32), mat(0x7d7366), 0, 0, 0, g); break;
      case 'dart': mesh(cyl(0.02, 0.02, 0.4, 3), mat(0xc8b48a), 0, 0, 0, g).rotation.z = Math.PI / 2; break;
      case 'arrow': case 'bolt': case 'volley': {
        const L = kind === 'bolt' ? 1.1 : 0.75;
        mesh(cyl(0.025, 0.025, L, 3), mat(DARKWOOD), 0, 0, 0, g).rotation.z = Math.PI / 2;
        mesh(cone(0.06, 0.16, 4), mat(STEEL, { metal: 0.6 }), L / 2, 0, 0, g).rotation.z = -Math.PI / 2;
        break;
      }
      case 'bullet': mesh(box(0.35, 0.05, 0.05), glow(0xffd27a, 4), 0, 0, 0, g); break;
      case 'ball': mesh(ico(0.17, 1), mat(0x222326, { metal: 0.5 }), 0, 0, 0, g); break;
      case 'shell': mesh(cyl(0.09, 0.12, 0.4, 6), mat(0x3a3f2a, { metal: 0.4 }), 0, 0, 0, g).rotation.z = Math.PI / 2; break;
      case 'rocket':
        mesh(cyl(0.08, 0.08, 0.6, 6), mat(0xd7dadf), 0, 0, 0, g).rotation.z = Math.PI / 2;
        mesh(cone(0.08, 0.2, 6), mat(0xc0392b), 0.4, 0, 0, g).rotation.z = -Math.PI / 2;
        mesh(ico(0.1), glow(0xffa040, 5), -0.35, 0, 0, g);
        break;
      case 'laser': mesh(box(0.9, 0.06, 0.06), glow(TG, 6), 0, 0, 0, g); break;
      case 'plasma': mesh(ico(0.22, 1), glow(TG, 5), 0, 0, 0, g); break;
      case 'ion': mesh(ico(0.3, 1), glow(0xb46bff, 5), 0, 0, 0, g); break;
      case 'meteor': mesh(dode(0.55), mat(0x5a3020, { emissive: 0xff5a10, ei: 1.6 }), 0, 0, 0, g); break;
      case 'bomb':
        mesh(cyl(0.16, 0.16, 0.7, 7), mat(0x3a3f2a), 0, 0, 0, g).rotation.z = Math.PI / 2;
        mesh(box(0.1, 0.4, 0.4), mat(0x2e3238), -0.35, 0, 0, g);
        break;
      case 'orbital': mesh(cyl(0.35, 0.35, 8, 8), glow(TG, 6), 0, 0, 0, g).rotation.z = Math.PI / 2; break;
      default: mesh(ico(0.1), glow(0xffffff, 3), 0, 0, 0, g);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    projProto.set(key, g);
  }
  return projProto.get(key).clone(true);
}
