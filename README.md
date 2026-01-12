# Niven Tapes Processor

Processeur audio automatisé pour les cassettes Archive.org de la collection Niven.

## Fonctionnalités

- Téléchargement automatique depuis Archive.org
- Détection intelligente des fichiers Side A / Side B
- Découpage automatique en tracks via détection de silence (ffmpeg)
- Numérotation continue des tracks (Side B continue après Side A)
- Trim configurable des intros
- Presets optimisés pour cassettes avec commentaires
- Rapport JSON détaillé par item

## Prérequis

- Node.js 18+
- ffmpeg (avec `silencedetect`)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Installation

```bash
npm install
```

## Utilisation

### Commande `item` - Traiter un item spécifique

```bash
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 \
  --out ./out \
  --introTrimSec 12 \
  --noiseDb -35 \
  --minSilence 0.6 \
  --minSegment 20
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--out` | `./out` | Répertoire de sortie |
| `--preset` | `niven` | Preset: `niven` ou `default` |
| `--introTrimSec` | `12` | Secondes à couper au début |
| `--noiseDb` | `-35` | Seuil de bruit (en dB) |
| `--minSilence` | `0.6` | Durée min de silence (en sec) |
| `--minSegment` | `20` | Durée min d'un segment (en sec) |
| `--concurrency` | `2` | Opérations concurrentes |

### Preset "niven"

Optimisé pour cassettes avec commentaires:

- `noiseDb = -35dB` - Tolère le bruit de fond des cassettes
- `minSilence = 0.6s` - Silences courts pour séparer les tracks
- `minSegment = 20s` - Ignore les petits segments parasites
- `introTrimSec = 12s` - Coupe intro standard Niven
- `concurrency = 2` - Traitement modéré

## Structure de sortie

```
out/
└── Louis_Armstrong_Tape_1_1923-1924/
    ├── metadata.json        # Métadonnées Archive.org
    ├── report.json          # Rapport de traitement
    ├── raw/                 # Fichiers originaux téléchargés
    │   ├── ..._Side_A.mp3
    │   └── ..._Side_B.mp3
    └── tracks/              # Tracks extraits
        ├── track_001.mp3
        ├── track_002.mp3
        ├── ...
        └── track_024.mp3
```

### Numérotation continue

Les tracks de Side B continuent la numérotation après Side A:

- Side A: `track_001` à `track_012`
- Side B: `track_013` à `track_024`

## Sélection des fichiers audio

Le système applique cette logique de priorité:

1. **Priorité absolue**: Fichiers MP3 nommés `*_Side_A.mp3` et `*_Side_B.mp3`
2. **Fallback 1**: Tous les MP3 (si pas de Side A/B)
3. **Fallback 2**: FLAC
4. **Fallback 3**: WAV

Si Side A ou Side B manque, une erreur claire liste les fichiers disponibles.

## Test rapide

Smoke test pour vérifier la sélection Side A/B:

```bash
npm test
# ou
node src/dev/louis.js
```

Ce test vérifie que l'item Louis Armstrong est correctement détecté sans lancer tout le traitement.

## Workflow de traitement

1. **Fetch metadata** via API Archive.org
2. **Sélection** des MP3 Side A/B (avec erreur claire si manquants)
3. **Téléchargement** avec encodage URL correct (gère les espaces)
4. **Trim intro** (par défaut 12s pour Niven)
5. **Détection silence** via ffmpeg
6. **Split en tracks** avec numérotation continue
7. **Génération report.json**

## Exemples

```bash
# Traitement standard Niven (utilise preset par défaut)
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924

# Sans trim intro
node src/cli.js item MyItem --introTrimSec 0

# Silence plus agressif
node src/cli.js item MyItem --noiseDb -40 --minSilence 1.0

# Preset default (moins agressif)
node src/cli.js item MyItem --preset default
```

## Dépendances

- `axios` - Requêtes HTTP
- `ffmpeg` - Traitement audio (externe)

## Architecture

```
src/
├── cli.js              # Point d'entrée CLI
├── lib/
│   ├── metadata.js     # API Archive.org + sélection fichiers
│   ├── download.js     # Téléchargement avec URL encoding
│   ├── split.js        # Silence detect + split tracks
│   └── presets.js      # Presets (niven, default)
└── dev/
    └── louis.js        # Smoke test
```

## Troubleshooting

### "Missing Side A or Side B MP3"

L'item n'a pas exactement un Side A et un Side B. Vérifier les noms de fichiers sur Archive.org.

### ffmpeg not found

Installer ffmpeg (voir Prérequis).

### Trop/pas assez de tracks

Ajuster les paramètres:
- `--noiseDb` plus bas = plus sensible au silence
- `--minSilence` plus long = ignore petits silences
- `--minSegment` plus court = garde plus de segments
