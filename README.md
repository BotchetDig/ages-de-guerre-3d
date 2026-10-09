# Âges de Guerre 3D

Hommage fan-made en 3D (Three.js) à *Age of War* (Max Games, 2007) : fais évoluer ta civilisation
de la préhistoire au futur et rase la base adverse. Solo contre l'IA ou à deux par lien (WebRTC/PeerJS).

## Lancer en local

```bash
npm install
npm run dev
```

## Commandes

| Touche | Action |
| --- | --- |
| 1 2 3 | Produire une unité (mêlée, distance, lourde) |
| A Z E (AZERTY) / Q W E | Construire une tourelle |
| R / S | Acheter un emplacement / vendre une tourelle |
| T | Améliorer l'armée (prix fixe par niveau) |
| 4 | Héros (unique, aura +25 % dégâts aux alliés) |
| B / N | Choisir une doctrine (début de partie et chaque évolution) |
| G | Posture : attaquer / tenir la ligne |
| U | Évoluer |
| Espace | Attaque spéciale |
| ← → / glisser, molette, mini-carte | Caméra |
| Échap | Pause |

## Outils

- `npm run balance` : fait jouer l'IA contre elle-même pour vérifier l'équilibrage.
- `tools/lowpoly_glb.py` : décime un modèle Meshy dans Blender (`blender -b -P tools/lowpoly_glb.py -- in.glb out.glb apercu.png`).
- `tools/glb2json.mjs` : convertit un `.glb` en glTF JSON autonome (utilisé pour `public/models/`).

Déploiement automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`).
