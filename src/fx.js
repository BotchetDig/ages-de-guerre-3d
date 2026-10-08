// Effets : éclats (shards) instanciés, particules lumineuses additives, fumée, ondes de choc,
// flashs lumineux, rayons, chiffres de dégâts.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- Éclats physiques ----------
class Shards {
  constructor(scene, max = 1600) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(0.11, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.r = new Float32Array(max * 3);
    this.rv = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.s = new Float32Array(max);
    this.n = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const col = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, col); }
    this.cursor = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.pv = new THREE.Vector3(); this.sv = new THREE.Vector3();
    this.c = new THREE.Color();
    scene.add(this.mesh);
  }
  burst(x, y, z, count, colors, speed = 5, size = 1, life = 1.6, up = 4) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.p[i * 3] = x + rand(-0.3, 0.3); this.p[i * 3 + 1] = y + rand(-0.3, 0.3); this.p[i * 3 + 2] = z + rand(-0.3, 0.3);
      const a = Math.random() * Math.PI * 2, sp = speed * rand(0.3, 1);
      this.v[i * 3] = Math.cos(a) * sp; this.v[i * 3 + 1] = rand(0.3, 1) * up + 1; this.v[i * 3 + 2] = Math.sin(a) * sp * 0.6;
      for (let j = 0; j < 3; j++) { this.r[i * 3 + j] = Math.random() * 6; this.rv[i * 3 + j] = rand(-12, 12); }
      this.life[i] = life * rand(0.7, 1.2);
      this.s[i] = size * rand(0.5, 1.4);
      this.mesh.setColorAt(i, this.c.set(colors[k % colors.length]));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const { p, v, r, rv, life, s, m, q, e, pv, sv } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const i3 = i * 3;
      v[i3 + 1] -= 18 * dt;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < 0.08) {
        p[i3 + 1] = 0.08; v[i3 + 1] *= -0.35; v[i3] *= 0.6; v[i3 + 2] *= 0.6;
        rv[i3] *= 0.6; rv[i3 + 1] *= 0.6; rv[i3 + 2] *= 0.6;
      }
      r[i3] += rv[i3] * dt; r[i3 + 1] += rv[i3 + 1] * dt; r[i3 + 2] += rv[i3 + 2] * dt;
      const sc = life[i] <= 0 ? 0 : s[i] * Math.min(1, life[i] * 2.5);
      e.set(r[i3], r[i3 + 1], r[i3 + 2]);
      m.compose(pv.set(p[i3], p[i3 + 1], p[i3 + 2]), q.setFromEuler(e), sv.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Particules (points) ----------
class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: additive
        ? `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if(r>0.5) discard; float f = pow(1.0 - r*2.0, 1.6); gl_FragColor = vec4(vC * f * vA * 2.0, 1.0); }`
        : `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if(r>0.5) discard; float f = smoothstep(0.5, 0.15, r); gl_FragColor = vec4(vC, f * vA); }`,
    }));
    this.points.frustumCulled = false;
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.cursor = 0;
    this.tmp = new THREE.Color();
    scene.add(this.points);
  }
  emit(x, y, z, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.v[i3] = o.vx ?? 0; this.v[i3 + 1] = o.vy ?? 0; this.v[i3 + 2] = o.vz ?? 0;
    this.life[i] = this.maxLife[i] = o.life ?? 0.6;
    this.s0[i] = o.size ?? 0.5; this.s1[i] = o.size1 ?? 0;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 2;
    this.tmp.set(o.color ?? 0xffffff);
    this.c0[i3] = this.tmp.r; this.c0[i3 + 1] = this.tmp.g; this.c0[i3 + 2] = this.tmp.b;
    if (o.color1 != null) this.tmp.set(o.color1);
    this.c1[i3] = this.tmp.r; this.c1[i3 + 1] = this.tmp.g; this.c1[i3 + 2] = this.tmp.b;
  }
  burst(x, y, z, n, o) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = rand(-1, 1), sp = (o.speed ?? 4) * rand(0.2, 1);
      const cxy = Math.sqrt(1 - b * b);
      this.emit(x + rand(-1, 1) * (o.spread ?? 0), y, z + rand(-1, 1) * (o.spread ?? 0), {
        ...o, vx: Math.cos(a) * cxy * sp, vy: Math.abs(b) * sp * (o.upBias ?? 1) + (o.vy ?? 0), vz: Math.sin(a) * cxy * sp * 0.6,
        life: (o.life ?? 0.6) * rand(0.6, 1.2), size: (o.size ?? 0.5) * rand(0.7, 1.3),
        color: Array.isArray(o.color) ? o.color[k % o.color.length] : o.color,
      });
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= d; this.v[i3 + 1] = this.v[i3 + 1] * d - this.grav[i] * dt; this.v[i3 + 2] *= d;
      this.pos[i3] += this.v[i3] * dt; this.pos[i3 + 1] += this.v[i3 + 1] * dt; this.pos[i3 + 2] += this.v[i3 + 2] * dt;
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      this.alpha[i] = Math.min(1, k * 1.5);
      // couleur : début (c0) → fin de vie (c1)
      this.col[i3] = this.c1[i3] + (this.c0[i3] - this.c1[i3]) * k;
      this.col[i3 + 1] = this.c1[i3 + 1] + (this.c0[i3 + 1] - this.c1[i3 + 1]) * k;
      this.col[i3 + 2] = this.c1[i3 + 2] + (this.c0[i3 + 2] - this.c1[i3 + 2]) * k;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}

// ---------- Ondes de choc ----------
class Rings {
  constructor(scene, n = 16) {
    this.pool = [];
    const g = new THREE.RingGeometry(0.8, 1, 40);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, t: 0, d: 1, r: 1 });
    }
    this.i = 0;
  }
  spawn(x, y, z, radius, color, dur = 0.5) {
    const r = this.pool[this.i++ % this.pool.length];
    r.m.position.set(x, y + 0.06, z);
    r.m.material.color.set(color);
    r.m.visible = true;
    r.t = 0; r.d = dur; r.r = radius;
  }
  update(dt) {
    for (const r of this.pool) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.d;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = 0.2 + (1 - Math.pow(1 - k, 3)) * r.r;
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = (1 - k) * 0.9;
    }
  }
}

// ---------- Traces de brûlure au sol ----------
class Scorches {
  constructor(scene, n = 32) {
    this.pool = [];
    const g = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        uniforms: { a: { value: 0 }, seed: { value: Math.random() * 10 } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float a; uniform float seed; varying vec2 vP; void main(){ float r = length(vP); float ang = atan(vP.y, vP.x); float edge = 0.75 + 0.18*sin(ang*5.0+seed) + 0.08*sin(ang*11.0+seed*2.0); float m = smoothstep(edge, edge*0.45, r); gl_FragColor = vec4(0.06,0.04,0.03, m * a * 0.75); }',
      }));
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.pool.push({ m, t: 0, d: 10 });
    }
    this.i = 0;
  }
  spawn(x, z, r) {
    const s = this.pool[this.i++ % this.pool.length];
    s.m.position.set(x, 0.04, z);
    s.m.scale.setScalar(r);
    s.m.rotation.y = Math.random() * 6;
    s.m.visible = true;
    s.t = 0;
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.m.visible) continue;
      s.t += dt;
      const k = s.t / s.d;
      if (k >= 1) { s.m.visible = false; continue; }
      s.m.material.uniforms.a.value = Math.min(1, s.t * 8) * (1 - k * k);
    }
  }
}

// ---------- Flashs lumineux (pool fixe : pas de recompilation de shaders) ----------
class Flashes {
  constructor(scene, n = 6) {
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 14, 1.6);
      scene.add(l);
      this.pool.push({ l, t: 0, d: 1, i0: 0 });
    }
    this.k = 0;
  }
  flash(x, y, z, color, intensity = 30, dur = 0.25, dist = 14) {
    const f = this.pool[this.k++ % this.pool.length];
    f.l.position.set(x, y, z);
    f.l.color.set(color);
    f.l.distance = dist;
    f.t = 0; f.d = dur; f.i0 = intensity;
    f.l.intensity = intensity;
  }
  update(dt) {
    for (const f of this.pool) {
      if (f.l.intensity <= 0) continue;
      f.t += dt;
      f.l.intensity = Math.max(0, f.i0 * (1 - f.t / f.d));
    }
  }
}

// ---------- Rayons (laser, tesla, frappe orbitale) ----------
class Beams {
  constructor(scene, n = 24) {
    this.pool = [];
    const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    g.rotateZ(Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, t: 0, d: 0.2, w: 0.1 });
    }
    this.i = 0;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
  }
  // Un rayon droit de (x0,y0) à (x1,y1). zigzag → plusieurs segments.
  beam(x0, y0, x1, y1, z, color, width = 0.08, dur = 0.15, zigzag = 0) {
    const segs = zigzag ? 5 : 1;
    let px = x0, py = y0;
    for (let s = 1; s <= segs; s++) {
      const k = s / segs;
      let nx = x0 + (x1 - x0) * k, ny = y0 + (y1 - y0) * k;
      if (zigzag && s < segs) { ny += rand(-zigzag, zigzag); nx += rand(-zigzag, zigzag) * 0.3; }
      this.seg(px, py, nx, ny, z, color, width, dur);
      px = nx; py = ny;
    }
  }
  seg(x0, y0, x1, y1, z, color, w, dur) {
    const b = this.pool[this.i++ % this.pool.length];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    b.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    b.m.rotation.set(0, 0, Math.atan2(dy, dx));
    b.m.scale.set(len, w, w);
    b.m.material.color.set(color);
    b.m.visible = true;
    b.t = 0; b.d = dur; b.w = w;
  }
  update(dt) {
    for (const b of this.pool) {
      if (!b.m.visible) continue;
      b.t += dt;
      const k = b.t / b.d;
      if (k >= 1) { b.m.visible = false; continue; }
      b.m.material.opacity = 1 - k;
      const w = b.w * (1 - k * 0.6);
      b.m.scale.y = b.m.scale.z = w;
    }
  }
}

// ---------- Chiffres flottants (DOM) ----------
class Floaters {
  constructor(container, camera) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.className = 'floaters';
    container.appendChild(this.layer);
    this.pool = [];
    for (let i = 0; i < 60; i++) {
      const d = document.createElement('div');
      d.className = 'floater';
      this.layer.appendChild(d);
      this.pool.push({ d, t: 1, life: 1, p: new THREE.Vector3(), vy: 0 });
    }
    this.i = 0;
    this.v = new THREE.Vector3();
  }
  spawn(x, y, z, text, cls, life = 0.9) {
    const f = this.pool[this.i++ % this.pool.length];
    f.p.set(x + rand(-0.3, 0.3), y, z);
    f.t = 0; f.life = life; f.vy = 2.2;
    f.d.textContent = text;
    f.d.className = 'floater ' + cls;
    f.d.style.display = 'block';
  }
  update(dt, w, h) {
    for (const f of this.pool) {
      if (f.t >= f.life) { if (f.d.style.display !== 'none') f.d.style.display = 'none'; continue; }
      f.t += dt;
      f.p.y += f.vy * dt;
      f.vy *= Math.exp(-2.5 * dt);
      this.v.copy(f.p).project(this.camera);
      const k = f.t / f.life;
      const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      f.d.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%) scale(${sc})`;
      f.d.style.opacity = String(Math.min(1, (1 - k) * 2.5));
    }
  }
}

export class FX {
  constructor(scene, container, camera) {
    this.shards = new Shards(scene);
    this.glow = new Particles(scene, 3000, true);
    this.smoke = new Particles(scene, 1200, false);
    this.rings = new Rings(scene);
    this.flashes = new Flashes(scene);
    this.beams = new Beams(scene);
    this.scorch = new Scorches(scene);
    this.floaters = new Floaters(container, camera);
    this.shake = 0;
  }
  setScale(h) {
    const s = h * 0.9;
    this.glow.points.material.uniforms.scale.value = s;
    this.smoke.points.material.uniforms.scale.value = s;
  }
  explosion(x, y, z, size = 1, color = 0xffa040) {
    // cœur blanc très bref, boule de feu qui vire au rouge, braises, fumée, débris, onde, flash, brûlure
    this.glow.emit(x, y + 0.3, z, { color: 0xffffff, color1: color, size: 5 * size, size1: 2 * size, life: 0.16 });
    this.glow.burst(x, y, z, Math.round(26 * size), { color: [0xfff2c0, color, 0xffd080], color1: 0x801808, speed: 7 * size, size: 1.4 * size, life: 0.5, drag: 3.5, upBias: 1.2 });
    this.glow.burst(x, y, z, Math.round(14 * size), { color: [0xffc060, 0xff8030], color1: 0x601000, speed: 9 * size, size: 0.18, life: 1.6, drag: 1.2, grav: 6, upBias: 1.6 });
    if (y < 1.5) this.scorch.spawn(x, z, 1.4 * size + 0.4);
    this.smoke.burst(x, y + 0.3, z, Math.round(14 * size), { color: [0x5a5550, 0x77706a, 0x3e3a36], speed: 2.5 * size, size: 2.2 * size, size1: 3.5 * size, life: 1.4, drag: 2, grav: -1.2, spread: 0.4 * size });
    this.shards.burst(x, y, z, Math.round(10 * size), [0x5a4a3a, 0x7a6a55, 0x3a3530], 5 * size, 1, 1.4, 6 * size);
    this.rings.spawn(x, 0, z, 3.2 * size, color, 0.45);
    this.flashes.flash(x, y + 1, z, color, 40 * size, 0.3, 10 + 6 * size);
    this.shake = Math.max(this.shake, 0.25 * size);
  }
  sparks(x, y, z, color = 0xffd27a, n = 8, speed = 5) {
    this.glow.burst(x, y, z, n, { color: [color, 0xffffff], color1: 0xff5010, speed, size: 0.35, life: 0.35, drag: 4, grav: 6 });
  }
  dust(x, z, n = 4) {
    this.smoke.burst(x, 0.2, z, n, { color: [0xc7a27a, 0xb08e66], speed: 1.2, size: 0.8, size1: 1.6, life: 0.8, drag: 3, grav: -0.5 });
  }
  update(dt) {
    this.shards.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.rings.update(dt);
    this.flashes.update(dt);
    this.beams.update(dt);
    this.scorch.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }
}
