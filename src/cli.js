#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { getMetadata, pickAudioFiles } from './lib/metadata.js';
import { downloadItemFiles } from './lib/download.js';
import { processSides } from './lib/split.js';
import { getPreset } from './lib/presets.js';

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const config = {
    command,
    identifier: null,
    out: './out',
    introTrimSec: null,
    noiseDb: null,
    minSilence: null,
    minSegment: null,
    concurrency: null,
    preset: null
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--out' && args[i + 1]) {
      config.out = args[++i];
    } else if (arg === '--introTrimSec' && args[i + 1]) {
      config.introTrimSec = parseFloat(args[++i]);
    } else if (arg === '--noiseDb' && args[i + 1]) {
      config.noiseDb = parseFloat(args[++i]);
    } else if (arg === '--minSilence' && args[i + 1]) {
      config.minSilence = parseFloat(args[++i]);
    } else if (arg === '--minSegment' && args[i + 1]) {
      config.minSegment = parseFloat(args[++i]);
    } else if (arg === '--concurrency' && args[i + 1]) {
      config.concurrency = parseInt(args[++i]);
    } else if (arg === '--preset' && args[i + 1]) {
      config.preset = args[++i];
    } else if (!arg.startsWith('--') && !config.identifier) {
      config.identifier = arg;
    }
  }

  return config;
}

/**
 * Print CLI help
 */
function printHelp() {
  console.log(`
Niven Tapes Processor - Archive.org audio splitter

USAGE:
  node src/cli.js <command> <identifier> [options]

COMMANDS:
  item <identifier>   Process a single item
  run <identifier>    Process item(s) (alias for 'item')

OPTIONS:
  --out <dir>            Output directory (default: ./out)
  --preset <name>        Use preset: niven (default), default
  --introTrimSec <sec>   Trim N seconds from intro (default: 12)
  --noiseDb <db>         Noise threshold for silence detection (default: -35)
  --minSilence <sec>     Minimum silence duration (default: 0.6)
  --minSegment <sec>     Minimum segment duration to keep (default: 20)
  --concurrency <n>      Concurrent operations (default: 2)

EXAMPLES:
  # Process Louis Armstrong tape with default Niven preset
  node src/cli.js item Louis_Armstrong_Tape_1_1923-1924

  # Custom settings
  node src/cli.js item Louis_Armstrong_Tape_1_1923-1924 \\
    --out ./out \\
    --introTrimSec 12 \\
    --noiseDb -35 \\
    --minSilence 0.6 \\
    --minSegment 20

  # Use explicit preset
  node src/cli.js item MyItem --preset niven
`);
}

/**
 * Process a single Archive.org item
 */
async function processItem(identifier, config) {
  console.log(`\n========================================`);
  console.log(`Processing item: ${identifier}`);
  console.log(`========================================\n`);

  const startTime = Date.now();

  try {
    // Get preset settings with CLI overrides
    const settings = getPreset(config.preset, {
      noiseDb: config.noiseDb,
      minSilence: config.minSilence,
      minSegment: config.minSegment,
      introTrimSec: config.introTrimSec,
      concurrency: config.concurrency
    });

    // 1. Fetch metadata
    const metadata = await getMetadata(identifier);
    console.log(`[item] ${metadata.metadata?.title || identifier}\n`);

    // 2. Pick Side A/B MP3s
    const audioFiles = pickAudioFiles(metadata, { preferMp3: true });
    console.log('');

    // 3. Download files
    const downloadedPaths = await downloadItemFiles(
      identifier,
      audioFiles,
      config.out,
      metadata
    );
    console.log('');

    // 4. Split into tracks
    const itemDir = path.join(config.out, identifier);
    const tracksDir = path.join(itemDir, 'tracks');

    const tracks = await processSides(downloadedPaths, tracksDir, settings);

    console.log(`\n[done] ✓ Processed ${tracks.length} tracks`);

    // 5. Write report
    const report = {
      identifier,
      timestamp: new Date().toISOString(),
      settings,
      inputFiles: audioFiles.map(f => f.name),
      tracks: tracks.map(t => path.basename(t)),
      trackCount: tracks.length,
      durationMs: Date.now() - startTime
    };

    const reportPath = path.join(itemDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[report] Saved to ${reportPath}`);

    console.log(`\n✓ Complete in ${(report.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Output: ${itemDir}\n`);

    return report;
  } catch (error) {
    console.error(`\n✗ Error processing ${identifier}:`);
    console.error(`  ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  const config = parseArgs();

  if (!config.identifier) {
    console.error('Error: No identifier specified\n');
    printHelp();
    process.exit(1);
  }

  if (config.command === 'item' || config.command === 'run') {
    await processItem(config.identifier, config);
  } else {
    console.error(`Error: Unknown command "${config.command}"\n`);
    printHelp();
    process.exit(1);
  }
}

main();
