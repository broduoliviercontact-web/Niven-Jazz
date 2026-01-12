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
- **Organisation automatique par source/créateur**
  - Détection automatique depuis les métadonnées Archive.org
  - Structure `out/<source>/<identifier>/` (ex: `out/Larry_Niven/Louis_Armstrong_Tape_1/`)
- **Naming intelligent des tracks**
  - Extraction automatique de titres enrichis depuis métadonnées (créateur, titre, date)
  - Détection de lieux depuis transcriptions (ex: "Recorded at the Savoy Ballroom")
  - Format: `<Créateur> — <Titre> (<Date>) — <Lieu> — Side A — Track 01`
  - Fallback intelligent sur l'identifier si métadonnées manquantes
- **Cleanup intelligent pour économiser l'espace disque**
  - Suppression sécurisée avec déplacement vers trash
  - Niveaux de cleanup configurables (raw|tracks|all)
  - Cleanup progressif au fil du traitement
  - Mode re-run intelligent (ne re-télécharge que si nécessaire)

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
| `--cleanup` | `false` | Active le cleanup automatique |
| `--cleanupLevel` | `all` | Niveau: `raw\|tracks\|all` |
| `--dryRun` | `false` | Simule le cleanup sans supprimer |
| `--purgeTrash` | `false` | Supprime définitivement après trash |
| `--trashDir` | `out/.trash` | Répertoire trash |
| `--generateNames` | `false` | Génère names.json avec titres enrichis |
| `--renameFiles` | `false` | Renomme les MP3 avec titres enrichis |

### Preset "niven"

Optimisé pour cassettes avec commentaires:

- `noiseDb = -35dB` - Tolère le bruit de fond des cassettes
- `minSilence = 0.6s` - Silences courts pour séparer les tracks
- `minSegment = 20s` - Ignore les petits segments parasites
- `introTrimSec = 12s` - Coupe intro standard Niven
- `concurrency = 2` - Traitement modéré

## Naming intelligent des tracks

### Vue d'ensemble

Le système de naming enrichit automatiquement les noms de tracks en utilisant les métadonnées Archive.org et les transcriptions (si disponibles).

### Sources d'information

**1. Métadonnées Archive.org**
- `metadata.creator` : Nom du créateur/artiste
- `metadata.title` : Titre de la collection
- `metadata.date` ou `metadata.year` : Date d'enregistrement
- Priorité : métadonnées > parsing de l'identifier

**2. Transcriptions (optionnel)**
- Détection automatique de lieux depuis les transcriptions
- Patterns reconnus : "Recorded at", "Live at", "From... in..."
- Confiance : 0.6 à 0.9 selon le pattern détecté

### Format des titres

```
<Créateur> — <Titre> (<Date>) — <Lieu> — Side A — Track 01
```

**Exemples :**
- Avec tout : `Larry Niven — Louis Armstrong Collection (1923-1924) — Savoy Ballroom — Side A — Track 03`
- Sans lieu : `Larry Niven — Duke Ellington Early Years — Side B — Track 01`
- Fallback identifier : `Duke Ellington 1930 1935 — Side A — Track 05`

### Logique en cascade

1. Si métadonnées complètes (créateur + titre + date) → utiliser tout
2. Si créateur + titre → format simplifié
3. Si titre seul → utiliser le titre
4. Sinon → parser l'identifier

Le lieu est ajouté seulement si confiance ≥ 0.6

### Intégration dans le pipeline

Une fois les tracks générés, vous pouvez activer le naming automatique :

```bash
# Générer names.json avec tous les titres suggérés
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 --generateNames

# Renommer automatiquement les fichiers MP3
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 --renameFiles
```

Le fichier `names.json` généré contient :

```json
{
  "identifier": "Louis_Armstrong_Tape_1_1923-1924",
  "generatedAt": "2026-01-12T10:30:00.000Z",
  "renamedCount": 24,
  "tracks": [
    {
      "originalFilename": "track_001.mp3",
      "originalPath": "out/Larry_Niven/.../tracks/track_001.mp3",
      "trackIndex": 1,
      "side": "Side A",
      "suggestedTitle": "Larry Niven — Louis Armstrong Collection (1923-1924) — Side A — Track 01",
      "suggestedFilename": "Larry_Niven_—_Louis_Armstrong_Collection_(1923-1924)_—_Side_A_—_Track_01.mp3",
      "newPath": "...",
      "renamed": true,
      "method": "fallback",
      "sourceBaseMethod": "metadata",
      "metaTitle": "Louis Armstrong Collection",
      "metaCreator": "Larry Niven",
      "metaDate": "1923-1924"
    }
  ]
}
```

### Test du module

```bash
node src/dev/naming-metadata.js
```

## Cleanup - Gestion de l'espace disque

### Vue d'ensemble

Le système de cleanup permet de supprimer automatiquement les fichiers intermédiaires une fois le traitement terminé, tout en conservant une sécurité via un système de trash.

### Niveaux de cleanup

- **`raw`** : Supprime uniquement les fichiers sources (MP3 téléchargés) une fois les tracks générés
- **`tracks`** : *(Pour workflow futur avec étape music)* Supprime les tracks après génération music
- **`all`** : Supprime tous les fichiers intermédiaires (actuellement équivalent à `raw`)

### Fonctionnement

1. **Validation** : Vérifie que les tracks sont valides (> 10s chacun) avant toute suppression
2. **Trash** : Déplace les fichiers vers `out/.trash/<identifier>/<timestamp>/` au lieu de les supprimer
3. **Progressive** : Peut supprimer les fichiers raw au fur et à mesure du traitement
4. **Re-run intelligent** : Si cleanup activé, le système détecte automatiquement ce qui manque
   - Tracks valides → skip complet
   - Pas de raw → re-télécharge automatiquement
   - Raw présent mais pas de tracks → re-split

### Exemples d'utilisation

```bash
# Activer le cleanup avec niveau 'all' (défaut)
node src/cli.js item MyItem --cleanup

# Cleanup niveau 'raw' uniquement
node src/cli.js item MyItem --cleanup --cleanupLevel raw

# Dry run pour voir ce qui serait supprimé sans vraiment supprimer
node src/cli.js item MyItem --cleanup --dryRun

# Cleanup + suppression définitive (pas de trash)
node src/cli.js item MyItem --cleanup --purgeTrash

# Cleanup avec trash personnalisé
node src/cli.js item MyItem --cleanup --trashDir /tmp/niven-trash
```

### Sécurité

- ❌ Aucune suppression si le traitement a échoué
- ❌ Aucune suppression si les tracks générés sont invalides
- ✅ Les fichiers sont d'abord déplacés vers trash (récupérables)
- ✅ Le mode `--dryRun` permet de prévisualiser sans risque
- ✅ Logs explicites de tout ce qui est supprimé

### Rapport de cleanup

Le fichier `report.json` contient les détails du cleanup :

```json
{
  "identifier": "MyItem",
  "tracks": [...],
  "cleanup": {
    "enabled": true,
    "level": "all",
    "movedToTrash": ["raw"],
    "purged": false,
    "savedBytes": 45678912
  }
}
```

## Structure de sortie

### Sans cleanup (avec organisation par source)

```
out/
└── Larry_Niven/                           # Nom du créateur (auto-détecté)
    └── Louis_Armstrong_Tape_1_1923-1924/
        ├── metadata.json                  # Métadonnées Archive.org
        ├── report.json                    # Rapport de traitement
        ├── names.json                     # Titres enrichis (si --generateNames)
        ├── raw/                           # Fichiers originaux téléchargés
        │   ├── ..._Side_A.mp3
        │   └── ..._Side_B.mp3
        └── tracks/                        # Tracks extraits
            ├── track_001.mp3              # Ou noms enrichis si --renameFiles
            ├── track_002.mp3
            ├── ...
            └── track_024.mp3
```

### Avec cleanup activé

```
out/
├── .trash/                                # Fichiers supprimés (récupérables)
│   └── Larry_Niven/
│       └── Louis_Armstrong_Tape_1_1923-1924/
│           └── 2026-01-12T10-30-45-123Z/
│               └── raw/
└── Larry_Niven/
    └── Louis_Armstrong_Tape_1_1923-1924/
        ├── metadata.json
        ├── report.json
        ├── names.json                     # Si --generateNames
        └── tracks/                        # Seulement les tracks finaux
            ├── track_001.mp3
            └── ...
```

### Exemple avec plusieurs items

```
out/
├── Larry_Niven/
│   ├── Louis_Armstrong_Tape_1_1923-1924/
│   ├── Duke_Ellington_Tape_2_1930-1935/
│   └── Count_Basie_Tape_3_1940-1945/
└── Other_Creator/
    └── Item_XYZ/
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
2. **Extract source name** depuis metadata.creator ou metadata.collection
3. **Organization** - Crée la structure `out/<source>/<identifier>/`
4. **Skip check** (si cleanup activé) - Détecte si le traitement peut être évité
5. **Sélection** des MP3 Side A/B (avec erreur claire si manquants)
6. **Téléchargement** avec encodage URL correct (gère les espaces)
7. **Trim intro** (par défaut 12s pour Niven)
8. **Détection silence** via ffmpeg
9. **Split en tracks** avec numérotation continue
10. **Progressive cleanup** (si activé) - Supprime raw au fur et à mesure
11. **Final cleanup** (si activé) - Vérifie et nettoie selon le niveau
12. **Génération report.json** avec source name + statistiques de cleanup

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

# Avec cleanup pour économiser l'espace
node src/cli.js item MyItem --cleanup

# Cleanup avec dry run (voir ce qui serait supprimé)
node src/cli.js item MyItem --cleanup --dryRun

# Re-run d'un item déjà traité (skip automatique si cleanup activé)
node src/cli.js item MyItem --cleanup  # Skip si tracks déjà valides

# Générer names.json avec titres enrichis
node src/cli.js item MyItem --generateNames

# Renommer automatiquement les MP3 avec titres enrichis
node src/cli.js item MyItem --renameFiles

# Combiné: traitement complet avec naming et cleanup
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 --renameFiles --cleanup
```

## Dépendances

- `axios` - Requêtes HTTP
- `ffmpeg` - Traitement audio (externe)

## Architecture

```
src/
├── cli.js              # Point d'entrée CLI
├── lib/
│   ├── metadata.js     # API Archive.org + sélection fichiers + extraction source
│   ├── download.js     # Téléchargement avec URL encoding
│   ├── split.js        # Silence detect + split tracks
│   ├── presets.js      # Presets (niven, default)
│   ├── cleanup.js      # Cleanup intelligent + trash management
│   └── naming.js       # Naming intelligent (métadonnées + transcriptions)
└── dev/
    ├── louis.js        # Smoke test
    └── naming-metadata.js  # Test du module naming
```

### Tests disponibles

```bash
# Test du naming
node src/dev/naming-metadata.js

# Test général (Louis Armstrong)
npm test
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
