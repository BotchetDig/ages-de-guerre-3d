// Décor : ciel, terrain low-poly, chemin, rivière, herbe et arbres animés par le vent,
// nuages, étoiles, lumières. L'ambiance (heure du jour) suit l'âge du joueur local.
import * as THREE from 'three';
import { BASE_X } from './config.js';

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, z * 4.3) * 0.1;

const PATH_HALF = 2.4;
const RIVER_Z = -11.5, RIVER_HALF = 2.6;

export function terrainHeight(x, z) {
  const az = Math.abs(z);
  if (az < PATH_HALF + 0.6) return 0;
  // Rivière derrière la voie
  const dr = Math.abs(z - RIVER_Z);
  const river = dr < RIVER_HALF + 3 ? Math.max(0, 1 - dr / (RIVER_HALF + 3)) : 0;
  const ramp = Math.min(1, (az - PATH_HALF - 0.6) / 6);
  let h;
  if (z < 0) h = (fbm(x * 0.07, z * 0.07) * 2.6 + Math.max(0, -z - 30) * 0.16) * ramp;
  else h = -Math.min(1.2, (z - PATH_HALF) * 0.06) + fbm(x * 0.1, z * 0.1) * 0.6 * ramp; // premier plan : légère pente vers le bas
  return h - Math.sqrt(river) * river * 3.4;
}

// Vent : déplace les sommets selon leur hauteur (herbe, feuillage). Phase dérivée de la position d'instance.
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
// Lumière de contour (fresnel) partagée par tous les matériaux des modèles
export const rimUniforms = { rimColor: { value: new THREE.Color(1, 1, 1) }, rimStrength: { value: 0.35 } };
function addWind(material, strength, refHeight) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float wh = max(position.y, 0.0) / ${refHeight.toFixed(2)};
        wh *= wh;
        float ph = uTime * 1.6 + ip.x * 0.33 + ip.z * 0.21;
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.05);
        transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3) * 0.3) * wh * ${strength.toFixed(3)} * uWind * gust;
        transformed.z += cos(ph * 0.8) * wh * ${(strength * 0.4).toFixed(3)} * uWind;`);
  };
  return material;
}

// Ambiances par âge (couleurs du ciel, soleil, brouillard, herbe...)
const PRESETS = [
  { name: 'matin', top: 0x4a8fe0, hor: 0xffe2bd, fog: 0xcfdde6, sun: 0xfff0d8, sunI: 3.0, sunDir: [-0.55, 0.75, 0.45], hemiS: 0xc2dcff, hemiG: 0x6a7a42, hemiI: 1.0, grass: 0x7fbf4a, rim: 0xfff2dc, rimI: 0.35, stars: 0, exp: 1.0, env: 0.35, mtn: 0x3d6aa8, cloud: 0xffffff, water: 0x16608a, foliage: 0xffffff, snow: 0, rain: 0 },
  { name: 'midi', top: 0x3f86e0, hor: 0xf7e8cc, fog: 0xd8e2e0, sun: 0xfff6e6, sunI: 3.3, sunDir: [-0.35, 0.9, 0.35], hemiS: 0xcfe4ff, hemiG: 0x748246, hemiI: 1.05, grass: 0x88bc4c, rim: 0xffffff, rimI: 0.3, stars: 0, exp: 1.0, env: 0.35, mtn: 0x4470a8, cloud: 0xffffff, water: 0x146a92, foliage: 0xffffff, snow: 1, rain: 0 },
  { name: 'après-midi', top: 0x5a86cc, hor: 0xffcf92, fog: 0xecd2ad, sun: 0xffcf96, sunI: 3.1, sunDir: [-0.7, 0.5, 0.45], hemiS: 0xc8d4f0, hemiG: 0x7a7a40, hemiI: 0.95, grass: 0x9cb84a, rim: 0xffd9a0, rimI: 0.45, stars: 0, exp: 1.02, env: 0.35, mtn: 0x7c7c98, cloud: 0xfff0dc, water: 0x1d5a78, foliage: 0xfff0d4, snow: 0, rain: 0 },
  { name: 'crépuscule', top: 0x3e4f86, hor: 0xff9a66, fog: 0xc9927c, sun: 0xff9c5c, sunI: 2.6, sunDir: [-0.8, 0.28, 0.5], hemiS: 0x9aa2d0, hemiG: 0x5e5038, hemiI: 0.85, grass: 0x7f9a46, rim: 0xffa070, rimI: 0.6, stars: 0.25, exp: 1.08, env: 0.3, mtn: 0x7a6a8a, cloud: 0xffc8a8, water: 0x1c3456, foliage: 0xe8c0a8, snow: 0, rain: 1 },
  { name: 'nuit néon', top: 0x070b26, hor: 0x5a3596, fog: 0x2a2352, sun: 0xa8bcff, sunI: 1.5, sunDir: [-0.4, 0.6, 0.5], hemiS: 0x5a6ac0, hemiG: 0x1c1630, hemiI: 0.75, grass: 0x3c7266, rim: 0x9fb8ff, rimI: 0.8, stars: 1, exp: 1.18, env: 0.25, mtn: 0x3a3466, cloud: 0x8a7ab8, water: 0x141846, foliage: 0x6a88b0, snow: 0, rain: 0 },
];

export function createWorld(scene, renderer) {
  const world = {};
  const P = { ...PRESETS[0] };
  const cur = {
    top: new THREE.Color(P.top), hor: new THREE.Color(P.hor), fog: new THREE.Color(P.fog),
    sun: new THREE.Color(P.sun), hemiS: new THREE.Color(P.hemiS), hemiG: new THREE.Color(P.hemiG),
    grass: new THREE.Color(P.grass), rim: new THREE.Color(P.rim), mtn: new THREE.Color(P.mtn),
    cloud: new THREE.Color(P.cloud), water: new THREE.Color(P.water), foliage: new THREE.Color(P.foliage),
    sunDir: new THREE.Vector3(...P.sunDir).normalize(),
    sunI: P.sunI, hemiI: P.hemiI, rimI: P.rimI, stars: P.stars, exp: P.exp, env: P.env, snow: 0, rain: 0,
  };
  let target = PRESETS[0];

  // ----- Environnement (reflets PBR doux) -----
  const pmrem = new THREE.PMREMGenerator(renderer);
  import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  });

  // ----- Ciel -----
  const skyUni = {
    top: { value: cur.top }, horizon: { value: cur.hor }, sunDir: { value: cur.sunDir }, sunCol: { value: cur.sun },
    stars: { value: 0 }, time: windUniforms.uTime,
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: skyUni, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; uniform float time; varying vec3 vDir;
        float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y*1.5+0.04, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.6));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 900.0)*8.0 + pow(s, 40.0)*0.35 + pow(s, 6.0)*0.18);
          // étoiles
          vec2 g = vec2(atan(d.z, d.x)*90.0, d.y*90.0);
          vec2 id = floor(g);
          float r = h21(id);
          float star = step(0.985, r) * smoothstep(0.5, 0.0, length(fract(g)-0.5)) * (0.6+0.4*sin(time*2.0+r*60.0));
          col += vec3(0.9,0.95,1.0) * star * stars * smoothstep(0.02, 0.3, d.y) * 1.6;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(cur.fog, 70, 260);

  // ----- Lumières -----
  const hemi = new THREE.HemisphereLight(cur.hemiS, cur.hemiG, cur.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(cur.sun, cur.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  world.sun = sun;
  // Contre-jour froid : détache les silhouettes du décor
  const back = new THREE.DirectionalLight(0xa8c8ff, 0.9);
  scene.add(back, back.target);

  // ----- Terrain -----
  const W = 300, D = 160;
  const tg = new THREE.PlaneGeometry(W, D, 200, 200);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const colors = [];
  const grassA = new THREE.Color(0xffffff), grassB = new THREE.Color(0xd2dcc4), dirt = new THREE.Color(0xc79a62), dirtB = new THREE.Color(0xa97c4c), rock = new THREE.Color(0x9c9484), sand = new THREE.Color(0xa89068);
  const c = new THREE.Color();
  const isGrass = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) - 25;
    pos.setZ(i, z);
    const y = terrainHeight(x, z) + (Math.abs(z) > PATH_HALF ? (hash(x, z) - 0.5) * 0.22 : (hash(x, z) - 0.5) * 0.05);
    pos.setY(i, y);
    const n = fbm(x * 0.15, z * 0.15);
    let g = 0;
    if (Math.abs(z) < PATH_HALF + (n - 0.5) * 0.8) {
      c.copy(dirt).lerp(dirtB, n);
      const rut = Math.abs(Math.abs(z) - 0.9) < 0.25 ? 0.85 : 1; // ornières
      c.multiplyScalar(rut);
    } else if (Math.abs(z - RIVER_Z) < RIVER_HALF + 0.7) c.copy(sand).lerp(dirtB, n * 0.5);
    else if (y > 9) c.copy(rock).lerp(grassB, 0.2);
    else { c.copy(grassA).lerp(grassB, n); g = 1; }
    isGrass.push(g);
    colors.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, color: cur.grass });
  // La couleur de l'herbe (uniform color) ne teinte que les zones d'herbe : on mélange via un attribut
  tg.setAttribute('grassMask', new THREE.Float32BufferAttribute(isGrass, 1));
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.grassTint = { value: cur.grass };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float grassMask; varying float vGrass;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = grassMask;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 grassTint; varying float vGrass;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( 1.0, 1.0, 1.0, opacity );')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), grassTint, vGrass);');
  };
  const ground = new THREE.Mesh(tg.toNonIndexed(), groundMat);
  ground.geometry.computeVertexNormals();
  ground.receiveShadow = true;
  scene.add(ground);

  // ----- Rivière -----
  const waterUni = {
    time: windUniforms.uTime, deep: { value: cur.water }, sky: { value: cur.hor }, skyTop: { value: cur.top }, sunDir: { value: cur.sunDir }, sunCol: { value: cur.sun },
    fogColor: { value: cur.fog }, fogNear: { value: 70 }, fogFar: { value: 260 },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(W, RIVER_HALF * 2 + 1.5, 200, 6).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: waterUni, transparent: true,
      vertexShader: `uniform float time; varying vec3 vW; void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0); w.y += sin(w.x*0.6 + time*1.4)*0.04 + sin(w.x*1.7 - time*2.1 + w.z)*0.02; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 sky; uniform vec3 skyTop; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          vec3 n = normalize(vec3(
            sin(p.x*1.3 + time*1.1)*0.12 + sin(p.x*3.1 - p.y*2.0 + time*2.3)*0.06 + sin(p.x*7.0 + p.y*5.0 + time*3.0)*0.03,
            1.0,
            cos(p.y*1.7 + p.x*0.4 - time*0.9)*0.12 + cos(p.y*4.3 + time*1.9)*0.05));
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(deep, mix(skyTop, sky, 0.3), 0.06 + fres * 0.28);
          vec3 h = normalize(normalize(sunDir) + v);
          float spec = pow(max(dot(n, h), 0.0), 220.0);
          col += sunCol * min(spec * 1.1, 0.9); // reflets du soleil, plafonnés pour ne pas déclencher le bloom
          float edge = smoothstep(${(RIVER_HALF + 0.5).toFixed(1)}, ${(RIVER_HALF - 0.6).toFixed(1)}, abs(vW.z - (${RIVER_Z.toFixed(1)})));
          float foam = (1.0 - edge) * (0.5 + 0.5*sin(vW.x*3.0 + time*2.0));
          col = mix(col, vec3(0.9), foam * 0.35);
          float d = length(cameraPosition - vW);
          col = mix(col, fogColor, smoothstep(fogNear, fogFar, d));
          gl_FragColor = vec4(col, mix(0.0, 0.88, smoothstep(0.0, 0.25, edge + foam*0.3)));
          #include <colorspace_fragment>
        }`,
    })
  );
  water.position.set(0, -0.35, RIVER_Z);
  scene.add(water);

  // ----- Montagnes (deux plans) -----
  // Montagnes hors brouillard : la perspective atmosphérique est gérée par leur propre teinte
  const mtnNear = new THREE.MeshStandardMaterial({ color: cur.mtn, flatShading: true, roughness: 1, fog: false });
  const mtnFar = new THREE.MeshStandardMaterial({ color: cur.mtn, flatShading: true, roughness: 1, fog: false });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xc8d2de, flatShading: true, roughness: 1, fog: false });
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 24; i++) {
      const x = -160 + i * 14 + (hash(i, 3 + layer) - 0.5) * 10;
      const h = (layer ? 34 : 20) + hash(i, 7 + layer) * (layer ? 30 : 18);
      const r = (layer ? 18 : 12) + hash(i, 9) * 10;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5 + (i % 3)), layer ? mtnFar : mtnNear);
      const z = layer ? -150 - hash(i, 1) * 20 : -95 - hash(i, 1) * 15;
      m.position.set(x, h / 2 - 3, z);
      m.rotation.y = hash(i, 2) * 3;
      scene.add(m);
      if (layer === 1 || h > 32) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3, h * 0.3, 5 + (i % 3)), snowMat);
        s.position.set(x, h - 3 - h * 0.15 + 0.1, z);
        s.rotation.y = m.rotation.y;
        scene.add(s);
      }
    }
  }

  // ----- Herbe : ~40k brins instanciés, normale vers le haut (éclairage doux), vent dans le shader -----
  const blade = new THREE.BufferGeometry();
  {
    const bw = 0.07, bh = 0.55;
    const v = [-bw, 0, 0, bw, 0, 0, -bw * 0.6, bh * 0.5, 0, bw * 0.6, bh * 0.5, 0, 0, bh, 0];
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute([0.35, 0.45, 0.25, 0.35, 0.45, 0.25, 0.75, 0.85, 0.55, 0.75, 0.85, 0.55, 1.1, 1.15, 0.8], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  }
  const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, color: cur.grass }), 0.18, 0.55);
  const NG = 42000;
  const grass = new THREE.InstancedMesh(blade, grassMat, NG);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), e = new THREE.Euler();
  const gc = new THREE.Color();
  let ng = 0;
  for (let tries = 0; ng < NG && tries < NG * 3; tries++) {
    const x = (Math.random() - 0.5) * 150;
    const z = Math.random() < 0.55 ? PATH_HALF + 0.3 + Math.random() * 20 : -(PATH_HALF + 0.3 + Math.random() * 30);
    if (Math.abs(z - RIVER_Z) < RIVER_HALF + 1.4) continue;
    const dens = fbm(x * 0.12, z * 0.12);
    if (Math.random() > dens * 1.4) continue;
    const front = z > 0 ? Math.max(0.55, 1 - (z - 3) / 30) : 1; // plus court au premier plan (perspective)
    const s = (0.45 + Math.random() * 0.55 + dens * 0.35) * front;
    e.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    m4.compose(pv.set(x, terrainHeight(x, z) - 0.03, z), q.setFromEuler(e), sv.set(s, s * (0.7 + Math.random() * 0.6), s));
    grass.setMatrixAt(ng, m4);
    gc.setHSL(0.22 + Math.random() * 0.06, 0.5, 0.75 + Math.random() * 0.25);
    grass.setColorAt(ng, gc);
    ng++;
  }
  grass.count = ng;
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  scene.add(grass);
  world.grass = grass;
  world.grassFull = ng;

  // ----- Fleurs -----
  const flowerG = new THREE.IcosahedronGeometry(0.07, 0);
  flowerG.translate(0, 0.42, 0);
  const flowers = new THREE.InstancedMesh(flowerG, addWind(new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 }), 0.18, 0.55), 1600);
  const FC = [0xffffff, 0xffe066, 0xff8fb0, 0xc59bff, 0xff6a5a];
  let nf = 0;
  for (let i = 0; i < 4000 && nf < 1600; i++) {
    const cx = (hash(i, 501) - 0.5) * 140, cz = hash(i, 503) < 0.5 ? 3.3 + hash(i, 505) * 16 : -(3.3 + hash(i, 507) * 24);
    if (Math.abs(cz - RIVER_Z) < RIVER_HALF + 1.4 || fbm(cx * 0.2, cz * 0.2) < 0.5) continue;
    const s = 0.8 + hash(i, 509) * 0.8;
    m4.compose(pv.set(cx, terrainHeight(cx, cz), cz), q.identity(), sv.set(s, s, s));
    flowers.setMatrixAt(nf, m4);
    flowers.setColorAt(nf, gc.set(FC[Math.floor(hash(cx, cz) * FC.length)]));
    nf++;
  }
  flowers.count = nf;
  scene.add(flowers);

  // ----- Arbres & rochers instanciés (vent sur le feuillage, teintes variées) -----
  const trunkG = new THREE.CylinderGeometry(0.15, 0.25, 1.6, 5);
  trunkG.translate(0, 0.8, 0);
  const leafG = new THREE.ConeGeometry(1.1, 2.6, 6);
  leafG.translate(0, 2.7, 0);
  const leafG2 = new THREE.IcosahedronGeometry(1.2, 0);
  leafG2.translate(0, 2.6, 0);
  const bushG = new THREE.IcosahedronGeometry(0.55, 0);
  bushG.translate(0, 0.35, 0);
  const rockG = new THREE.DodecahedronGeometry(0.7, 0);
  const N = 320;
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x6b4423, flatShading: true }), N);
  const pines = new THREE.InstancedMesh(leafG, addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), 0.12, 4), N);
  const rounds = new THREE.InstancedMesh(leafG2, addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), 0.14, 4), N);
  const bushes = new THREE.InstancedMesh(bushG, addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), 0.06, 1), 220);
  const rocks = new THREE.InstancedMesh(rockG, new THREE.MeshStandardMaterial({ color: 0x8d8576, flatShading: true }), 160);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const PINE = [0x3f7a3a, 0x356b35, 0x4a8640, 0x2f5f3a];
  const ROUND = [0x5f9a3a, 0x6fa83e, 0x87a838, 0xc98a2e, 0xb5552a, 0x4f8a3a];
  for (let i = 0; i < N; i++) {
    const x = (hash(i, 11) - 0.5) * 260;
    const z = -(6 + hash(i, 19) * 60);
    const nearLane = Math.abs(x) < BASE_X + 8 && z > -8;
    const inRiver = Math.abs(z - RIVER_Z) < RIVER_HALF + 1.6;
    if (nearLane || inRiver) { trunks.setMatrixAt(i, zero); pines.setMatrixAt(i, zero); rounds.setMatrixAt(i, zero); continue; }
    const y = terrainHeight(x, z);
    const s = 0.7 + hash(i, 23) * 1.0;
    e.set(0, hash(i, 29) * 6, 0);
    m4.compose(pv.set(x, y - 0.1, z), q.setFromEuler(e), sv.set(s, s * (0.85 + hash(i, 37) * 0.4), s));
    trunks.setMatrixAt(i, m4);
    if (hash(i, 31) < 0.55) { pines.setMatrixAt(i, m4); rounds.setMatrixAt(i, zero); }
    else { rounds.setMatrixAt(i, m4); pines.setMatrixAt(i, zero); }
    pines.setColorAt(i, gc.set(PINE[i % PINE.length]));
    rounds.setColorAt(i, gc.set(ROUND[Math.floor(hash(i, 41) * ROUND.length)]));
  }
  for (let i = 0; i < 220; i++) {
    const x = (hash(i, 601) - 0.5) * 200;
    const z = hash(i, 603) < 0.45 ? 4.5 + hash(i, 605) * 14 : -(4 + hash(i, 607) * 30);
    if (Math.abs(z - RIVER_Z) < RIVER_HALF + 1) { bushes.setMatrixAt(i, zero); continue; }
    const s = 0.6 + hash(i, 609) * 1.0;
    m4.compose(pv.set(x, terrainHeight(x, z), z), q.setFromEuler(e.set(0, hash(i, 611) * 6, 0)), sv.set(s * 1.3, s, s));
    bushes.setMatrixAt(i, m4);
    bushes.setColorAt(i, gc.set(ROUND[i % 3]).multiplyScalar(0.85));
  }
  for (let i = 0; i < 160; i++) {
    const x = (hash(i, 41) - 0.5) * 220;
    const z = hash(i, 43) < 0.3 ? 3.4 + hash(i, 47) * 8 : -(3.4 + hash(i, 53) * 40);
    const s = 0.3 + hash(i, 59) * 1.1;
    e.set(hash(i, 61) * 3, hash(i, 67) * 3, 0);
    m4.compose(pv.set(x, terrainHeight(x, z) + s * 0.15, z), q.setFromEuler(e), sv.set(s, s * 0.7, s));
    rocks.setMatrixAt(i, m4);
  }
  for (const im of [trunks, pines, rounds, bushes, rocks]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }

  // ----- Nuages -----
  const cloudMat = new THREE.MeshStandardMaterial({ color: cur.cloud, flatShading: true, roughness: 1, emissive: cur.cloud, emissiveIntensity: 0.25 });
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const cl = new THREE.Group();
    const n = 3 + Math.floor(hash(i, 3) * 4);
    for (let j = 0; j < n; j++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + hash(i, j) * 2.5, 1), cloudMat);
      p.position.set(j * 2.6 - n * 1.3, hash(j, i) * 1.4, hash(i + j, 5) * 2);
      p.scale.y = 0.55;
      cl.add(p);
    }
    cl.position.set((hash(i, 71) - 0.5) * 280, 30 + hash(i, 73) * 18, -45 - hash(i, 79) * 70);
    cl.userData.v = 0.5 + hash(i, 83) * 0.9;
    scene.add(cl);
    clouds.push(cl);
  }

  // ----- Lucioles / poussière dorée -----
  const dustN = 360;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (hash(i, 1) - 0.5) * 120; dp[i * 3 + 1] = 0.3 + hash(i, 2) * 9; dp[i * 3 + 2] = (hash(i, 3) - 0.5) * 30; }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff1c0, size: 0.09, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dg, dustMat);
  scene.add(dust);

  // ----- Météo (autour de la caméra) -----
  const SN = 1400, RN = 1600;
  const snowG = new THREE.BufferGeometry();
  const snowP = new Float32Array(SN * 3);
  for (let k = 0; k < SN; k++) { snowP[k * 3] = (Math.random() - 0.5) * 70; snowP[k * 3 + 1] = Math.random() * 22; snowP[k * 3 + 2] = (Math.random() - 0.5) * 30 - 2; }
  snowG.setAttribute('position', new THREE.BufferAttribute(snowP, 3));
  const flakeMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.24, transparent: true, opacity: 0, depthWrite: false });
  const snow = new THREE.Points(snowG, flakeMat);
  snow.frustumCulled = false;
  scene.add(snow);
  const rainG = new THREE.BufferGeometry();
  const rainP = new Float32Array(RN * 6);
  for (let k = 0; k < RN; k++) {
    const x = (Math.random() - 0.5) * 70, y = Math.random() * 22, z = (Math.random() - 0.5) * 30 - 2;
    rainP.set([x, y, z, x - 0.08, y - 0.7, z], k * 6);
  }
  rainG.setAttribute('position', new THREE.BufferAttribute(rainP, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xaac4e0, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainG, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  let weatherX = 0;
  const updateWeather = (dt, t, camX) => {
    snow.visible = cur.snow > 0.02;
    rain.visible = cur.rain > 0.02;
    flakeMat.opacity = cur.snow * 0.85;
    rainMat.opacity = cur.rain * 0.45;
    const shift = camX - weatherX;
    weatherX = camX;
    if (snow.visible) {
      for (let k = 0; k < SN; k++) {
        let x = snowP[k * 3] + Math.sin(t * 0.8 + k) * 0.01 + 0.3 * dt, y = snowP[k * 3 + 1] - 1.4 * dt;
        if (y < 0) y += 22;
        x -= shift * 0; // les flocons restent dans le repère monde ; on les recycle autour de la caméra
        if (x - camX > 35) x -= 70; else if (x - camX < -35) x += 70;
        snowP[k * 3] = x; snowP[k * 3 + 1] = y;
      }
      snowG.attributes.position.needsUpdate = true;
    }
    if (rain.visible) {
      for (let k = 0; k < RN; k++) {
        const o = k * 6;
        let y = rainP[o + 1] - 24 * dt, x = rainP[o] - 1.5 * dt;
        if (y < 0) y += 22;
        if (x - camX > 35) x -= 70; else if (x - camX < -35) x += 70;
        rainP[o] = x; rainP[o + 1] = y; rainP[o + 3] = x - 0.08; rainP[o + 4] = y - 0.7;
      }
      rainG.attributes.position.needsUpdate = true;
    }
  };

  world.setAge = (age) => { target = PRESETS[age]; };

  const tc = new THREE.Color(), tv = new THREE.Vector3();
  world.update = (dt, t, camX) => {
    windUniforms.uTime.value = t;
    updateWeather(dt, t, camX);
    windUniforms.uWind.value = 1 + cur.rain * 0.8 + cur.snow * 0.3;
    for (const cl of clouds) {
      cl.position.x += cl.userData.v * dt;
      if (cl.position.x > 150) cl.position.x = -150;
    }
    const a = dust.geometry.attributes.position;
    for (let i = 0; i < dustN; i++) {
      a.array[i * 3] += Math.sin(t * 0.3 + i) * 0.01 + 0.012;
      a.array[i * 3 + 1] += Math.cos(t * 0.5 + i * 1.3) * 0.004;
      if (a.array[i * 3] > 60) a.array[i * 3] = -60;
    }
    a.needsUpdate = true;

    // Transition douce vers l'ambiance de l'âge courant
    const k = Math.min(1, dt * 0.7);
    for (const key of ['top', 'hor', 'fog', 'sun', 'hemiS', 'hemiG', 'grass', 'rim', 'mtn', 'cloud', 'water', 'foliage']) cur[key].lerp(tc.set(target[key]), k);
    cur.sunDir.lerp(tv.set(...target.sunDir).normalize(), k).normalize();
    for (const key of ['sunI', 'hemiI', 'rimI', 'stars', 'exp', 'env', 'snow', 'rain']) cur[key] += (target[key] - cur[key]) * k;
    scene.fog.color.copy(cur.fog);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI;
    skyUni.stars.value = cur.stars;
    world.night = cur.stars;
    mtnNear.color.copy(cur.mtn).lerp(cur.hor, 0.12);
    mtnFar.color.copy(cur.mtn).lerp(cur.hor, 0.38);
    cloudMat.color.copy(cur.cloud); cloudMat.emissive.copy(cur.cloud);
    rimUniforms.rimColor.value.copy(cur.rim);
    rimUniforms.rimStrength.value = cur.rimI;
    grassMat.color.copy(cur.grass);
    // Végétation teintée par l'ambiance (bleutée la nuit, dorée au crépuscule)
    for (const im of [pines, rounds, bushes, flowers]) im.material.color.copy(cur.foliage);
    renderer.toneMappingExposure = cur.exp;
    scene.environmentIntensity = cur.env;
    dustMat.color.copy(cur.stars > 0.5 ? tc.set(0x9fffd0) : tc.set(0xfff1c0));
    dustMat.size = 0.09 + cur.stars * 0.06;

    // Le soleil (et son ombre) suit la caméra
    sun.position.set(camX + cur.sunDir.x * 50, cur.sunDir.y * 50, cur.sunDir.z * 50);
    sun.target.position.set(camX, 0, 0);
    back.position.set(camX + 15, 14, -30);
    back.target.position.set(camX, 1, 0);
  };
  return world;
}
