// Transforme dist/index.html (build "vite build --mode artifact") en dist/artifact.html :
// - contenu seul : la plateforme d'artifacts ajoute elle-même doctype, <head> et <body> ;
// - import map vers jsDelivr (hôte de modules autorisé) pour three, n8ao et postprocessing.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const pkg = (n) => JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8')).version;
const importMap = {
  imports: {
    three: `https://cdn.jsdelivr.net/npm/three@${pkg('three')}/build/three.module.js`,
    'three/examples/jsm/': `https://cdn.jsdelivr.net/npm/three@${pkg('three')}/examples/jsm/`,
    postprocessing: `https://cdn.jsdelivr.net/npm/postprocessing@${pkg('postprocessing')}/build/index.js`,
    n8ao: `https://cdn.jsdelivr.net/npm/n8ao@${pkg('n8ao')}/dist/N8AO.js`,
  },
};

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/i)[1];
const keep = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"/i.test(l))
  .join('\n')
  .replace(/(<script type="module")/, `<script type="importmap">${JSON.stringify(importMap)}</script>\n  $1`);
writeFileSync('dist/artifact.html', `${keep.trim()}\n${body.trim()}\n`);

const files = {};
for (const f of readdirSync('dist/assets')) files['assets/' + f] = 'dist/assets/' + f;
for (const f of readdirSync('dist/models')) files['models/' + f] = 'dist/models/' + f;
console.log(JSON.stringify(files));
