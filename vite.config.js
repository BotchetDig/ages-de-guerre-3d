import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

// Dev uniquement : POST /__shot (dataURL JPEG) → tools/shots/<nom>.jpg, pour inspecter le rendu sans afficher le navigateur.
const shots = {
  name: 'shots',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { name, data } = JSON.parse(body);
        mkdirSync('tools/shots', { recursive: true });
        const safe = String(name).replace(/[^a-z0-9_-]/gi, '') || 'shot';
        writeFileSync(`tools/shots/${safe}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
        res.end('ok');
      });
    });
  },
};

// base './' : le build fonctionne aussi bien sur itch.io, GitHub Pages ou un simple dossier.
// Mode "artifact" (npm run artifact) : bibliothèques chargées depuis jsDelivr via une import map
// (voir tools/artifact.mjs), code du jeu non minifié et sans PeerJS.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [shots],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      minify: !artifact,
      rollupOptions: artifact ? { external: [/^three(\/.*)?$/, 'n8ao', 'postprocessing'] } : {},
    },
    esbuild: { target: 'es2022' },
    optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  };
});
