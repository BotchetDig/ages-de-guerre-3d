// Vue 3D : synchronise l'état de la simulation avec la scène Three.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { N8AOPass } from 'n8ao';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BASE_X, AGES, SPAWN_OFFSET } from './config.js';
import { baseXOf, dirOf, turretPos } from './sim.js';
import { createWorld } from './world.js';
import { FX } from './fx.js';
import { makeUnit, animateUnit, makeBase, makeTurret, makeProjectile, makeSlotPlatform, registerGltfBase, TEAM, TEAM_GLOW } from './models.js';

// Passe finale : tilt-shift (effet maquette), aberration chromatique légère, étalonnage, vignette, grain, flash.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 },
    vig: { value: 0.32 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) },
    tilt: { value: 1 }, focusY: { value: 0.42 }, sat: { value: 1.12 }, con: { value: 1.06 }, grain: { value: 0.022 }, ca: { value: 0.45 },
    shadowTint: { value: new THREE.Color(0.1, 0.25, 0.55) }, highTint: { value: new THREE.Color(1.0, 0.75, 0.45) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, vig, flash, tilt, focusY, sat, con, grain, ca;
    uniform vec3 flashColor, shadowTint, highTint; varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      vec2 px = 1.0 / res;
      float b = smoothstep(0.22, 0.65, abs(uv.y - focusY)) * tilt;
      vec2 dc = uv - 0.5; float e = dot(dc, dc);
      vec2 caOff = dc * ca * e * 0.012;
      vec3 col = vec3(0.0);
      if (b < 0.01) {
        // zone nette : 3 lectures seulement (aberration chromatique)
        col = vec3(texture2D(tDiffuse, uv + caOff).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - caOff).b) * 12.0;
      } else for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 3.5;
        vec2 o = vec2(cos(a), sin(a)) * r * b * 3.5 * px;
        col.r += texture2D(tDiffuse, uv + o + caOff).r;
        col.g += texture2D(tDiffuse, uv + o).g;
        col.b += texture2D(tDiffuse, uv + o - caOff).b;
      }
      col /= 12.0;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * con + 0.5;
      col += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * 0.05 + highTint * smoothstep(0.55, 1.0, l) * 0.04;
      col *= 1.0 - e * vig * 2.2;
      col = mix(col, flashColor, flash);
      float n = fract(sin(dot(uv * res + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const HEAVY_IMPACT = { meteor: 1.1, bomb: 1.0, shell: 0.7, ball: 0.55, rocket: 0.6, ion: 0.8, orbital: 1.2, rock: 0.4, plasma: 0.45 };
const SPARK_COLOR = { bullet: 0xffd27a, laser: null, plasma: null, tesla: 0xb8e1ff, dart: 0xd8c8a0, stone: 0xc8c0b0, arrow: 0xd8c8a0, bolt: 0xd8c8a0, volley: 0xd8c8a0 };

export class GameView {
  constructor(container, audio) {
    this.container = container;
    this.audio = audio;
    this.me = 0;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 900);
    this.cam = { x: -BASE_X + 14, tx: -BASE_X + 14, dist: 26, tdist: 26 };
    this.world = createWorld(this.scene, r);
    this.fx = new FX(this.scene, container, this.camera);

    // Post-traitement : occlusion ambiante (N8AO) → bloom → tone mapping → étalonnage/tilt-shift → SMAA
    // (l'AO n'est pas compatible avec le MSAA matériel, d'où le SMAA en fin de chaîne)
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, rt);
    // Passe de rendu simple, utilisée à la place de l'AO en qualité basse
    this.plainPass = new RenderPass(this.scene, this.camera);
    this.plainPass.enabled = false;
    this.composer.addPass(this.plainPass);
    this.ao = new N8AOPass(this.scene, this.camera, 1, 1);
    Object.assign(this.ao.configuration, { aoRadius: 1.1, distanceFalloff: 1.0, intensity: 2.6, gammaCorrection: false, halfRes: true });
    this.ao.configuration.color = new THREE.Color(0x141c2c);
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.vignette = this.grade;
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass(1, 1);
    this.composer.addPass(this.smaa);

    this.units = new Map();
    this.dying = [];
    this.projs = new Map();
    this.bases = [null, null];
    this.turrets = [[null, null, null, null], [null, null, null, null]];
    this.platforms = [[], []];
    this.time = 0;
    this.flashT = 0;
    this.killers = new Map();

    this.hpGeo = new THREE.PlaneGeometry(1, 0.13);
    this.hpFgGeo = new THREE.PlaneGeometry(1, 0.13).translate(0.5, 0, 0);
    this.hpBg = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthWrite: false });
    this.hpFg = [new THREE.MeshBasicMaterial({ color: TEAM_GLOW[0] }), new THREE.MeshBasicMaterial({ color: TEAM_GLOW[1] })];

    this.loadCustomBases();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Bases Meshy : public/models/base_<id>.json (glTF JSON, voir tools/glb2json.mjs). Les autres âges restent procéduraux.
  loadCustomBases() {
    const loader = new GLTFLoader();
    const custom = ['prehistoric', 'modern', 'future'];
    AGES.forEach((a, age) => {
      if (!custom.includes(a.id)) return;
      loader.load(`models/base_${a.id}.json`, (gltf) => {
        registerGltfBase(age, gltf.scene);
        for (let o = 0; o < 2; o++) if (this.bases[o]?.age === age) this.bases[o].age = -1; // force reconstruction
      }, undefined, () => {});
    });
  }

  bindInput() {
    const el = this.renderer.domElement;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, cx: this.cam.tx }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = (this.cam.dist / this.container.clientWidth) * 1.6;
      this.cam.tx = drag.cx - (e.clientX - drag.x) * k;
    });
    el.addEventListener('pointerup', () => (drag = null));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.tdist = THREE.MathUtils.clamp(this.cam.tdist * (1 + Math.sign(e.deltaY) * 0.1), 14, 56);
    }, { passive: false });
  }

  pan(v) { this.cam.tx += v; }

  // Qualité : 'high' (AO, herbe complète, ombres 2048, tilt-shift) ou 'low' (pour les machines modestes)
  setQuality(q) {
    if (this.quality === q) return;
    this.quality = q;
    const high = q === 'high';
    this.ao.enabled = high;
    this.plainPass.enabled = !high;
    this.grade.uniforms.tilt.value = high ? 1 : 0;
    this.grade.uniforms.ca.value = high ? 0.45 : 0;
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 1.5) : 1);
    const sun = this.world.sun;
    sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    this.world.grass.count = high ? this.world.grassFull : Math.floor(this.world.grassFull * 0.4);
    this.resize();
  }

  // Demi-largeur visible au niveau de la voie (pour la mini-carte)
  camHalfWidth() {
    return this.cam.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
  }
  focusBase(o) { this.cam.tx = baseXOf(o) + dirOf(o) * 14; }

  resize() {
    // Fenêtre masquée (0×0) : on garde une taille de rendu valide
    const w = this.container.clientWidth || 1280, h = this.container.clientHeight || 720;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.res.value.set(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(h * this.renderer.getPixelRatio());
    this.w = w; this.h = h;
  }

  reset(me) {
    this.me = me;
    for (const v of this.units.values()) this.scene.remove(v.root, v.bar);
    for (const d of this.dying) this.scene.remove(d.root);
    for (const p of this.projs.values()) this.scene.remove(p.obj);
    this.units.clear(); this.projs.clear(); this.dying = [];
    for (let o = 0; o < 2; o++) {
      if (this.bases[o]) this.scene.remove(this.bases[o].group);
      this.bases[o] = null;
      for (let s = 0; s < 4; s++) { if (this.turrets[o][s]) this.scene.remove(this.turrets[o][s].obj); this.turrets[o][s] = null; }
      for (const p of this.platforms[o]) this.scene.remove(p);
      this.platforms[o] = [];
    }
    this.cam.x = this.cam.tx = baseXOf(me) + dirOf(me) * 14;
    this.world.setAge(0);
  }

  // ---------- Synchro état → scène ----------

  syncBases(g) {
    for (let o = 0; o < 2; o++) {
      const p = g.players[o];
      let b = this.bases[o];
      if (!b || b.age !== p.age) {
        if (b) this.scene.remove(b.group);
        const group = makeBase(p.age, o);
        group.position.set(baseXOf(o), 0, 0);
        // Modèle Meshy : face avant vers la caméra, légèrement tournée vers l'ennemi. Procédural : face à +X.
        if (group.userData.custom) group.rotation.y = o === 0 ? 0.45 : -0.45;
        else if (o === 1) group.rotation.y = Math.PI;
        this.scene.add(group);
        const anim = { flags: [], ring: null, radar: null, blink: null, core: null, torches: [] };
        group.traverse((n) => {
          if (n.name === 'flag') anim.flags.push(n);
          if (n.name === 'ring') anim.ring = n;
          if (n.name === 'radar') anim.radar = n;
          if (n.name === 'blink') anim.blink = n;
          if (n.name === 'core') anim.core = n;
          if (n.name === 'torch') anim.torches.push(n);
        });
        b = this.bases[o] = { group, age: p.age, anim, shake: 0 };
        for (const pl of this.platforms[o]) this.scene.remove(pl);
        this.platforms[o] = [];
      }
      for (let s = 0; s < 4; s++) {
        if (s < p.slots && !this.platforms[o][s]) {
          const pos = turretPos(o, s);
          const pl = makeSlotPlatform(p.age);
          pl.position.set(pos.x, pos.y, 0);
          this.scene.add(pl);
          this.platforms[o][s] = pl;
        }
        const t = p.turrets[s];
        const cur = this.turrets[o][s];
        const key = t ? `${t.age}-${t.k}` : null;
        if ((cur?.key ?? null) !== key) {
          if (cur) this.scene.remove(cur.obj);
          this.turrets[o][s] = null;
          if (t) {
            const obj = makeTurret(t.age, t.k, o);
            const pos = turretPos(o, s);
            obj.position.set(pos.x, pos.y, 0);
            if (o === 1) obj.rotation.y = Math.PI;
            this.scene.add(obj);
            this.turrets[o][s] = { obj, key, head: obj.getObjectByName('head'), aim: 0, taim: -0.15, recoil: 0 };
          }
        }
      }
    }
  }

  syncUnits(g, dt) {
    const seen = new Set();
    for (const u of g.units) {
      seen.add(u.id);
      let v = this.units.get(u.id);
      if (!v) {
        const root = makeUnit(u.age, u.k, u.owner);
        const z = (((u.id * 37) % 7) - 3) * 0.13;
        root.position.set(u.x, 0, z);
        if (u.owner === 1) root.rotation.y = Math.PI;
        root.scale.setScalar(0.01);
        this.scene.add(root);
        const bar = new THREE.Group();
        bar.add(new THREE.Mesh(this.hpGeo, this.hpBg));
        const fg = new THREE.Mesh(this.hpFgGeo, this.hpFg[u.owner]);
        fg.position.set(-0.5, 0, 0.001);
        bar.add(fg);
        bar.renderOrder = 10;
        this.scene.add(bar);
        const w = u.role === 'heavy' ? 1.6 : 0.9;
        v = { root, bar, fg, w, x: u.x, z, phase: Math.random() * 6, born: 0, lastAtk: u.lastAtk, atk: 0, owner: u.owner, age: u.age, k: u.k, role: u.role, h: root.userData.height };
        this.units.set(u.id, v);
        this.fx.glow.burst(u.x, 1, z, 10, { color: TEAM_GLOW[u.owner], speed: 2.5, size: 0.6, life: 0.5, drag: 3 });
        this.fx.rings.spawn(u.x, 0, z, 1.6, TEAM_GLOW[u.owner], 0.45);
      }
      v.x += (u.x - v.x) * Math.min(1, dt * 14);
      v.root.position.x = v.x;
      v.moving = u.moving;
      v.born = Math.min(1, v.born + dt * 5);
      const s = v.born < 1 ? 1 - Math.pow(1 - v.born, 3) * 1 + Math.sin(v.born * Math.PI) * 0.15 : 1;
      // Touché : petite pulsation + éclat blanc
      if (v.flash > 0) {
        if (v.flash === 1) this.fx.glow.emit(v.x, v.h * 0.55, v.z + 0.3, { color: 0xffffff, size: v.role === 'heavy' ? 1.6 : 0.9, life: 0.1 });
        v.flash = Math.max(0, v.flash - dt * 7);
      }
      const hs = 1 + (v.flash ?? 0) * 0.09;
      v.root.scale.set(s * hs, s * (2 - hs), s * hs);
      if (u.lastAtk !== v.lastAtk) { v.lastAtk = u.lastAtk; v.atk = 0.001; }
      if (v.atk > 0) { v.atk += dt * 3.2; if (v.atk >= 1) v.atk = 0; }
      if (u.moving) {
        v.phase += dt * (u.role === 'heavy' ? 5 : 9);
        if (Math.random() < dt * 3) this.fx.dust(v.x, v.z, 1);
      }
      animateUnit(v.root, v.phase, u.moving, v.atk, this.time);
      const hp = Math.max(0, u.hp / u.hpMax);
      v.hp = hp;
      v.bar.visible = hp < 0.999;
      v.bar.position.set(v.x, v.h + 0.35, v.z);
      v.bar.quaternion.copy(this.camera.quaternion);
      v.bar.scale.set(v.w, 1, 1);
      v.fg.scale.x = hp;
    }
    for (const [id, v] of this.units) {
      if (seen.has(id)) continue;
      this.units.delete(id);
      this.scene.remove(v.bar);
      this.dying.push({ ...v, t: 0 });
    }
  }

  updateDying(dt) {
    this.dying = this.dying.filter((d) => {
      d.t += dt;
      const k = Math.min(1, d.t / 0.45);
      const dir = d.owner === 0 ? 1 : -1;
      if (d.role === 'heavy' && d.root.userData.rig === 'vehicle') {
        d.root.position.y = -k * 0.3;
      } else {
        d.root.rotation.z = dir * k * k * 1.45 * (d.owner === 0 ? 1 : -1);
        d.root.position.y = -k * 0.1;
      }
      if (d.t < 0.45) return true;
      // Éclatement en shards aux couleurs du modèle
      const colors = [];
      d.root.traverse((o) => { if (o.isMesh && colors.length < 6) colors.push(o.material.color.getHex()); });
      const big = d.role === 'heavy' ? 1.8 : 1;
      this.fx.shards.burst(d.x, d.h * 0.45, d.z, Math.round(16 * big), colors, 4.5 * big, 1.1 * big, 1.8, 5);
      this.fx.glow.burst(d.x, d.h * 0.4, d.z, 8, { color: TEAM_GLOW[d.owner], speed: 3, size: 0.5, life: 0.4 });
      if (d.role === 'heavy' && d.age >= 2) this.fx.explosion(d.x, 0.8, d.z, 0.7);
      this.scene.remove(d.root);
      return false;
    });
  }

  syncProjectiles(g, dt) {
    const seen = new Set();
    for (const p of g.projectiles) {
      seen.add(p.id);
      let v = this.projs.get(p.id);
      if (!v) {
        const obj = makeProjectile(p.kind, p.owner ?? (p.x1 > p.x0 ? 0 : 1));
        obj.position.set(p.x, p.y, 0);
        this.scene.add(obj);
        v = { obj, kind: p.kind, lx: p.x0 ?? p.x, ly: p.y0 ?? p.y, team: p.owner ?? (p.x1 > p.x0 ? 0 : 1) };
        this.projs.set(p.id, v);
      }
      const o = v.obj.position;
      const nx = o.x + (p.x - o.x) * Math.min(1, dt * 30), ny = o.y + (p.y - o.y) * Math.min(1, dt * 30);
      const dx = nx - o.x, dy = ny - o.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-4) v.obj.rotation.z = Math.atan2(dy, dx);
      if (v.kind === 'rock' || v.kind === 'stone' || v.kind === 'meteor') { v.obj.rotation.x += dt * 8; }
      o.set(nx, ny, 0);
      this.trail(v, nx, ny);
    }
    for (const [id, v] of this.projs) {
      if (seen.has(id)) continue;
      this.scene.remove(v.obj);
      this.projs.delete(id);
    }
  }

  trail(v, x, y) {
    const G = this.fx.glow, S = this.fx.smoke;
    switch (v.kind) {
      case 'meteor':
        G.emit(x, y, 0, { color: 0xff7a20, size: 1.6, life: 0.35, vy: 1 });
        S.emit(x, y, 0, { color: 0x3a302a, size: 1.2, size1: 2.6, life: 1.0, vy: 0.8 });
        break;
      case 'rocket':
        G.emit(x, y, 0, { color: 0xffa040, size: 0.6, life: 0.15 });
        S.emit(x, y, 0, { color: 0xb8b2aa, size: 0.5, size1: 1.4, life: 0.9, vy: 0.4 });
        break;
      case 'plasma': case 'ion': case 'laser':
        G.emit(x, y, 0, { color: v.kind === 'ion' ? 0xb46bff : TEAM_GLOW[v.team], size: v.kind === 'laser' ? 0.4 : 0.9, life: 0.2 });
        break;
      case 'ball': case 'shell': case 'bomb':
        if (Math.random() < 0.5) S.emit(x, y, 0, { color: 0x8a847c, size: 0.25, size1: 0.7, life: 0.5 });
        break;
      case 'orbital':
        G.emit(x + (Math.random() - 0.5), y, 0, { color: TEAM_GLOW[v.team], size: 2.2, life: 0.25 });
        break;
    }
  }

  // ---------- Événements ----------

  handle(events, g) {
    for (const e of events) this.event(e, g);
  }

  event(e, g) {
    const A = this.audio, F = this.fx;
    switch (e.e) {
      case 'spawn': A.play('spawn', baseXOf(e.o), 0.4); break;
      case 'shoot': {
        if (e.slot >= 0) {
          const t = this.turrets[e.o][e.slot];
          if (t) {
            const pos = turretPos(e.o, e.slot);
            t.taim = Math.atan2(e.y1 - pos.y, (e.x1 - pos.x) * dirOf(e.o));
            t.recoil = 1;
          }
        }
        const loud = ['ball', 'shell', 'rocket', 'ion', 'rock'].includes(e.kind);
        if (['bullet', 'ball', 'shell'].includes(e.kind)) {
          F.glow.burst(e.x, e.y, 0, loud ? 8 : 4, { color: [0xfff0b0, 0xffa040], speed: 3, size: loud ? 0.9 : 0.45, life: 0.12, drag: 6 });
          F.smoke.burst(e.x, e.y, 0, loud ? 6 : 2, { color: 0xb8b2aa, speed: 1.2, size: 0.5, size1: 1.4, life: 0.8, drag: 2, grav: -0.6 });
          if (loud) F.flashes.flash(e.x, e.y, 0.5, 0xffb060, 18, 0.12, 8);
        }
        if (e.kind === 'tesla') {
          F.beams.beam(e.x, e.y, e.x1, e.y1, 0, 0xb8e1ff, 0.06, 0.12, 0.5);
          F.beams.beam(e.x, e.y, e.x1, e.y1, 0, 0x6ab8ff, 0.12, 0.08, 0.35);
          F.sparks(e.x1, e.y1, 0, 0xb8e1ff, 6);
        }
        if (e.kind === 'laser') F.glow.burst(e.x, e.y, 0, 3, { color: TEAM_GLOW[e.o], speed: 1, size: 0.6, life: 0.12 });
        A.play('shoot_' + e.kind, e.x, 0.5);
        break;
      }
      case 'impact': {
        const big = HEAVY_IMPACT[e.kind];
        if (e.kind === 'orbital') {
          F.beams.seg(e.x, 0, e.x, 30, 0, TEAM_GLOW[e.o], 0.6, 0.35);
          F.explosion(e.x, 0.3, 0, 1.2, TEAM_GLOW[e.o]);
        } else if (e.kind === 'ion' || e.kind === 'plasma') {
          F.glow.burst(e.x, e.y, 0, 24, { color: [e.kind === 'ion' ? 0xb46bff : TEAM_GLOW[e.o], 0xffffff], speed: 6, size: 0.9, life: 0.4, drag: 3 });
          F.rings.spawn(e.x, 0, 0, 3 * big, e.kind === 'ion' ? 0xb46bff : TEAM_GLOW[e.o], 0.4);
          F.flashes.flash(e.x, e.y, 0.5, e.kind === 'ion' ? 0xb46bff : TEAM_GLOW[e.o], 25, 0.25);
          F.shake = Math.max(F.shake, 0.12);
        } else if (e.kind === 'rock') {
          F.shards.burst(e.x, 0.3, 0, 12, [0x7d7366, 0x6a6155, 0x8d8576], 5, 1.2, 1.4, 5);
          F.dust(e.x, 0, 8);
          F.shake = Math.max(F.shake, 0.1);
        } else if (big) {
          F.explosion(e.x, Math.max(0.3, e.y), 0, big, e.kind === 'meteor' ? 0xff6a20 : 0xffa040);
        } else {
          const c = SPARK_COLOR[e.kind] ?? TEAM_GLOW[e.o];
          F.sparks(e.x, e.y, 0, c, 6, 3.5);
          if (e.y < 0.5) F.dust(e.x, 0, 3);
        }
        A.play(big ? (big > 0.8 ? 'boom_big' : 'boom') : 'impact', e.x, 0.6);
        break;
      }
      case 'melee':
        F.sparks(e.x, e.y, 0, e.age === 4 ? TEAM_GLOW[e.o] : 0xffe2a0, e.heavy ? 14 : 7, e.heavy ? 5 : 3.5);
        if (e.heavy) F.shake = Math.max(F.shake, 0.08);
        A.play(e.age <= 1 ? 'melee_wood' : 'melee_metal', e.x, 0.5);
        break;
      case 'hit': {
        const v = this.units.get(e.id);
        if (v) v.flash = 1;
        // Seuls les coups critiques affichent un chiffre : lisible et moins coûteux
        if (e.crit) F.floaters.spawn(e.x, e.y + 1.1, 0, String(e.dmg), 'crit', 0.9);
        break;
      }
      case 'die':
        if (e.to === this.me) F.floaters.spawn(e.x, 2.6, 0, '+' + e.gold, 'gold', 1.1);
        A.play('die', e.x, 0.5);
        break;
      case 'baseHit': {
        const b = this.bases[e.o];
        if (b) b.shake = Math.min(1, b.shake + 0.35);
        F.shards.burst(e.x, 1.2 + Math.random() * 2, 0, 3, [0x8d8576, 0x6a6155], 3, 0.9, 1.2, 3);
        F.dust(e.x, 0, 2);
        if (Math.random() < 0.4) A.play('base_hit', e.x, 0.6);
        break;
      }
      case 'special':
        this.flashT = 0.5;
        this.vignette.uniforms.flashColor.value.set(e.o === this.me ? 0xfff2d0 : 0xff8060);
        A.play('special', baseXOf(1 - e.o), 1);
        break;
      case 'evolve': {
        const bx = baseXOf(e.o);
        F.glow.burst(bx, 4, 0, 80, { color: [TEAM_GLOW[e.o], 0xffffff, 0xffe2a0], speed: 9, size: 1.2, life: 1.0, drag: 2, spread: 2 });
        F.shards.burst(bx, 3, 0, 40, [0xffffff, TEAM[e.o], 0xffe2a0], 7, 1.4, 2, 8);
        F.rings.spawn(bx, 0, 0, 10, TEAM_GLOW[e.o], 0.9);
        F.flashes.flash(bx, 6, 2, 0xffffff, 80, 0.6, 30);
        F.beams.seg(bx, 0, bx, 45, 0, TEAM_GLOW[e.o], 0.9, 1.2);
        F.beams.seg(bx, 0, bx, 45, 0, 0xffffff, 0.25, 0.9);
        F.shake = Math.max(F.shake, 0.35);
        if (e.o === this.me) { this.world.setAge(e.age); this.flashT = 0.6; this.vignette.uniforms.flashColor.value.set(0xffffff); }
        A.play('evolve', bx, 1);
        break;
      }
      case 'turret': case 'slot': case 'sell': case 'upgrade': {
        const pos = e.slot != null ? turretPos(e.o, e.slot) : { x: baseXOf(e.o), y: 1 };
        F.glow.burst(pos.x, pos.y + 0.5, 0, 16, { color: [TEAM_GLOW[e.o], 0xffffff], speed: 3, size: 0.6, life: 0.5 });
        if (e.e === 'upgrade') F.rings.spawn(pos.x + dirOf(e.o) * SPAWN_OFFSET, 0, 0, 5, TEAM_GLOW[e.o], 0.7);
        A.play(e.e === 'sell' ? 'sell' : 'build', pos.x, 0.7);
        break;
      }
      case 'over':
        for (let i = 0; i < 6; i++) setTimeout(() => this.fx.explosion(baseXOf(1 - e.winner) + (Math.random() - 0.5) * 4, 1 + Math.random() * 5, (Math.random() - 0.5) * 2, 1.4), i * 220);
        break;
    }
  }

  // ---------- Frame ----------

  update(g, dt) {
    this.time += dt;
    this.syncBases(g);
    this.syncUnits(g, dt);
    this.updateDying(dt);
    this.syncProjectiles(g, dt);

    for (let o = 0; o < 2; o++) {
      const b = this.bases[o];
      if (!b) continue;
      b.shake = Math.max(0, b.shake - dt * 3);
      // Base endommagée : fumée sous 55 % de PV, flammes sous 30 %
      const pl = g.players[o], hf = pl.hp / pl.hpMax;
      if (hf < 0.55 && Math.random() < dt * (hf < 0.3 ? 14 : 6)) {
        this.fx.smoke.emit(baseXOf(o) + (Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, { color: 0x3a3632, size: 1.4, size1: 4.5, life: 2.6, vy: 1.6, vx: 0.4, drag: 0.5 });
      }
      if (hf < 0.3 && Math.random() < dt * 20) {
        this.fx.glow.emit(baseXOf(o) + (Math.random() - 0.5) * 3.5, 1 + Math.random() * 4, (Math.random() - 0.5) * 2, { color: 0xffc050, color1: 0x801000, size: 1.1, size1: 0.2, life: 0.7, vy: 2.2, drag: 1 });
      }
      b.group.position.x = baseXOf(o) + (Math.random() - 0.5) * b.shake * 0.12;
      for (const f of b.anim.flags) f.rotation.y = Math.sin(this.time * 3 + o) * 0.25;
      if (b.anim.ring) { b.anim.ring.rotation.z += dt * 0.8; b.anim.ring.position.y = 7.1 + Math.sin(this.time * 1.5) * 0.2; }
      if (b.anim.radar) b.anim.radar.rotation.y += dt * 1.2;
      if (b.anim.blink) b.anim.blink.visible = Math.sin(this.time * 5) > 0;
      if (b.anim.core) b.anim.core.rotation.y += dt;
      for (const t of b.anim.torches) {
        if (Math.random() < dt * 14) {
          const wp = t.getWorldPosition(new THREE.Vector3());
          this.fx.glow.emit(wp.x + (Math.random() - 0.5) * 0.1, wp.y + 0.1, wp.z, { color: Math.random() < 0.5 ? 0xff8a2a : 0xffd060, size: 0.5, size1: 0.1, life: 0.5, vy: 1.4, drag: 1 });
        }
      }
      for (let s = 0; s < 4; s++) {
        const t = this.turrets[o][s];
        if (!t) continue;
        t.aim += (t.taim - t.aim) * Math.min(1, dt * 10);
        t.recoil = Math.max(0, t.recoil - dt * 6);
        if (t.head) { t.head.rotation.z = THREE.MathUtils.clamp(t.aim, -0.9, 0.6); t.head.position.x = -t.recoil * 0.12; }
      }
    }

    // Caméra
    const c = this.cam;
    c.tx = THREE.MathUtils.clamp(c.tx, -BASE_X - 6, BASE_X + 6);
    c.x += (c.tx - c.x) * Math.min(1, dt * 6);
    c.dist += (c.tdist - c.dist) * Math.min(1, dt * 6);
    const sh = this.fx.shake;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    this.camera.position.set(c.x + sx, 1.6 + c.dist * 0.17 + sy, c.dist);
    this.camera.lookAt(c.x + sx * 0.5, 2.4, 0);

    this.flashT = Math.max(0, this.flashT - dt);
    this.vignette.uniforms.flash.value = this.flashT * 0.5;
    this.world.update(dt, this.time, c.x);
    this.grade.uniforms.time.value = this.time;
    // La nuit, le bloom se renforce pour faire ressortir les néons
    const night = this.world.night ?? 0;
    this.bloom.strength = 0.8 + night * 0.5;
    this.bloom.threshold = 1.05 - night * 0.4;
    this.fx.update(dt);
    this.fx.floaters.update(dt, this.w, this.h);
    this.composer.render();
  }

  // Miniatures des unités/tourelles pour l'interface (rendu offscreen, mises en cache)
  thumbnail(kind, age, k, team) {
    this.thumbs ??= new Map();
    const key = `${kind}-${age}-${k}-${team}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    if (!this.thumbR) {
      this.thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.thumbR.setSize(128, 128);
      this.thumbR.toneMapping = THREE.ACESFilmicToneMapping;
      this.thumbScene = new THREE.Scene();
      this.thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 2.2));
      const d = new THREE.DirectionalLight(0xffffff, 2.2);
      d.position.set(3, 5, 6);
      this.thumbScene.add(d);
      this.thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    }
    const obj = kind === 'unit' ? makeUnit(age, k, team) : makeTurret(age, k, team);
    if (kind === 'unit') animateUnit(obj, 0.6, false, 0, 0);
    obj.rotation.y = -0.55;
    this.thumbScene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 2.1;
    this.thumbCam.position.set(center.x + dist * 0.35, center.y + dist * 0.2, center.z + dist);
    this.thumbCam.lookAt(center);
    this.thumbR.render(this.thumbScene, this.thumbCam);
    const url = this.thumbR.domElement.toDataURL();
    this.thumbScene.remove(obj);
    this.thumbs.set(key, url);
    return url;
  }
}
