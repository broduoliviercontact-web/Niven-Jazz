# Exemples d'utilisation

## Exemple 1: Test rapide (smoke test uniquement)

Vérifier que l'item est accessible et que Side A/B sont détectés:

```bash
npm test
```

Sortie:
```
✓ ALL TESTS PASSED
✓ Exactly 2 files selected
✓ Side A found: Louis_Armstrong_Tape_1_1923-1924_Side_A.mp3
✓ Side B found: Louis_Armstrong_Tape_1_1923-1924_Side_B.mp3
```

## Exemple 2: Traitement complet avec preset Niven

```bash
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924
```

Utilise automatiquement le preset "niven":
- Intro trim: 12s
- Noise: -35dB
- Min silence: 0.6s
- Min segment: 20s

Structure créée:
```
out/Louis_Armstrong_Tape_1_1923-1924/
├── metadata.json
├── report.json
├── raw/
│   ├── Louis_Armstrong_Tape_1_1923-1924_Side_A.mp3
│   └── Louis_Armstrong_Tape_1_1923-1924_Side_B.mp3
└── tracks/
    ├── track_001.mp3
    ├── track_002.mp3
    ├── ...
    └── track_024.mp3
```

## Exemple 3: Override des paramètres

```bash
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 \
  --introTrimSec 15 \
  --noiseDb -40 \
  --minSilence 0.8 \
  --minSegment 30
```

Override les valeurs du preset pour un contrôle total.

## Exemple 4: Voir l'aide

```bash
node src/cli.js --help
```

## Exemple 5: Items sans Side A/B

Si un item n'a pas de fichiers `_Side_A.mp3` / `_Side_B.mp3`, le système affiche une erreur claire:

```
[audio] ⚠ Side A/B pattern not complete:
  Side A: ✗
  Side B: ✗
  Available audio files:
    - recording_01.mp3 (VBR MP3)
    - recording_02.mp3 (VBR MP3)

✗ Error: Missing Side A or Side B MP3. Check file listing above.
```

## Exemple 6: Report JSON

Après traitement, `report.json` contient:

```json
{
  "identifier": "Louis_Armstrong_Tape_1_1923-1924",
  "timestamp": "2026-01-12T20:30:00.000Z",
  "settings": {
    "noiseDb": -35,
    "minSilence": 0.6,
    "minSegment": 20,
    "introTrimSec": 12,
    "concurrency": 2
  },
  "inputFiles": [
    "Louis_Armstrong_Tape_1_1923-1924_Side_A.mp3",
    "Louis_Armstrong_Tape_1_1923-1924_Side_B.mp3"
  ],
  "tracks": [
    "track_001.mp3",
    "track_002.mp3",
    ...
  ],
  "trackCount": 24,
  "durationMs": 45320
}
```

## Exemple 7: Preset "default" (moins agressif)

```bash
node src/cli.js item MyItem --preset default
```

Paramètres:
- Intro trim: 0s (pas de trim)
- Noise: -40dB (plus sensible)
- Min silence: 0.5s
- Min segment: 15s

## Flux de travail typique

```bash
# 1. Test rapide
npm test

# 2. Si OK, traiter l'item
node src/cli.js item Louis_Armstrong_Tape_1_1923-1924

# 3. Vérifier les tracks
ls -lh out/Louis_Armstrong_Tape_1_1923-1924/tracks/

# 4. Vérifier le report
cat out/Louis_Armstrong_Tape_1_1923-1924/report.json
```

## Débug: Trop de tracks détectés

Si trop de petits segments sont créés:

```bash
node src/cli.js item MyItem \
  --minSegment 30        # Augmenter (ignore segments < 30s)
  --minSilence 1.0       # Augmenter (silences > 1s seulement)
```

## Débug: Pas assez de tracks

Si des tracks sont fusionnés par erreur:

```bash
node src/cli.js item MyItem \
  --noiseDb -30          # Moins sensible (tolère plus de bruit)
  --minSilence 0.3       # Silences plus courts comptent
  --minSegment 10        # Garde plus de segments
```

## Batch processing (futur)

Pour traiter plusieurs items:

```bash
# Créer un script bash
for id in Item1 Item2 Item3; do
  node src/cli.js item "$id"
done
```

Ou créer une commande `batch` dans une future version.
