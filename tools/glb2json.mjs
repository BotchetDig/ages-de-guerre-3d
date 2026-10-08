// Convertit un .glb en glTF JSON autonome (buffer intégré en base64), servi en .json.
// Les artifacts claude.ai ne servent pas l'extension .glb ; GLTFLoader lit indifféremment les deux.
// Usage : node tools/glb2json.mjs entree.glb sortie.json
import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
const buf = readFileSync(src);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Pas un fichier GLB : ' + src);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
if (bin) json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
writeFileSync(dst, JSON.stringify(json));
console.log(dst, (readFileSync(dst).length / 1e6).toFixed(2) + ' Mo');
