#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { getMetadata, pickAudioFiles, extractSourceName } from './lib/metadata.js';
import { downloadItemFiles } from './lib/download.js';
import { processSides } from './lib/split.js';
import { getPreset } from './lib/presets.js';
import { maybeCleanupItem, checkSkipStatus } from './lib/cleanup.js';
import { inferTrackTitle } from './lib/naming.js';

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
    preset: null,
    cleanup: false,
    cleanupLevel: 'all',
    dryRun: false,
    purgeTrash: false,
    trashDir: null,
    generateNames: false,
    renameFiles: false
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
    } else if (arg === '--cleanup') {
      config.cleanup = true;
    } else if (arg === '--cleanupLevel' && args[i + 1]) {
      config.cleanupLevel = args[++i];
    } else if (arg === '--dryRun') {
      config.dryRun = true;
    } else if (arg === '--purgeTrash') {
      config.purgeTrash = true;
    } else if (arg === '--trashDir' && args[i + 1]) {
      config.trashDir = args[++i];
    } else if (arg === '--generateNames') {
      config.generateNames = true;
    } else if (arg === '--renameFiles') {
      config.renameFiles = true;
      config.generateNames = true; // Auto-enable generateNames if renaming
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
  --cleanup              Enable cleanup after processing
  --cleanupLevel <lvl>   Cleanup level: raw|tracks|all (default: all)
  --dryRun               Simulate cleanup without actually deleting
  --purgeTrash           Permanently delete trash after moving
  --trashDir <dir>       Trash directory (default: out/.trash)
  --generateNames        Generate names.json with enriched track titles
  --renameFiles          Rename MP3 files with enriched titles (implies --generateNames)

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

  # Enable cleanup to save disk space
  node src/cli.js item MyItem --cleanup --cleanupLevel all

  # Dry run to preview cleanup without deleting
  node src/cli.js item MyItem --cleanup --dryRun

  # Progressive cleanup with permanent deletion
  node src/cli.js item MyItem --cleanup --cleanupLevel raw --purgeTrash
`);
}

/**
 * Generate enriched track names and optionally rename files
 * @param {object} options - Configuration
 * @returns {object} - Track names data
 */
async function generateTrackNames(options) {
  const { tracks, identifier, metadata, itemDir, renameFiles = false } = options;

  const trackNamesData = {
    identifier,
    generatedAt: new Date().toISOString(),
    tracks: [],
    renamedCount: 0
  };

  for (let i = 0; i < tracks.length; i++) {
    const trackPath = tracks[i];
    const trackFilename = path.basename(trackPath);
    const trackIndex = i + 1;

    // Determine side from filename pattern
    let side = null;
    const sideMatch = trackFilename.match(/track_(\d{3})\.mp3/i);
    if (sideMatch) {
      const trackNum = parseInt(sideMatch[1]);
      // Simple heuristic: if track number > half of total, likely Side B
      side = trackNum <= Math.ceil(tracks.length / 2) ? 'Side A' : 'Side B';
    }

    // Infer track title (no transcript for now, but structure is ready)
    const titleInfo = inferTrackTitle({
      identifier,
      metadata,
      transcriptText: null, // Will be available when transcription is implemented
      trackIndex,
      side,
      sourceFilename: trackFilename
    });

    // Clean title for filesystem
    const safeName = sanitizeFilename(titleInfo.title);
    const newFilename = `${safeName}.mp3`;
    const newPath = path.join(path.dirname(trackPath), newFilename);

    const trackData = {
      originalFilename: trackFilename,
      originalPath: trackPath,
      trackIndex,
      side,
      suggestedTitle: titleInfo.title,
      suggestedFilename: newFilename,
      newPath: renameFiles ? newPath : null,
      renamed: false,
      ...titleInfo // Include all metadata from inferTrackTitle
    };

    // Rename file if requested
    if (renameFiles) {
      try {
        // Check if file exists and new name is different
        if (fs.existsSync(trackPath) && trackPath !== newPath) {
          fs.renameSync(trackPath, newPath);
          trackData.renamed = true;
          trackData.newPath = newPath;
          trackNamesData.renamedCount++;
        }
      } catch (error) {
        console.warn(`[naming] ⚠ Failed to rename ${trackFilename}: ${error.message}`);
        trackData.renameError = error.message;
      }
    }

    trackNamesData.tracks.push(trackData);
  }

  // Save names.json
  const namesPath = path.join(itemDir, 'names.json');
  fs.writeFileSync(namesPath, JSON.stringify(trackNamesData, null, 2));
  console.log(`[naming] Saved to ${namesPath}`);

  return trackNamesData;
}

/**
 * Sanitize filename for filesystem
 * @param {string} title - Title to sanitize
 * @returns {string}
 */
function sanitizeFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, 200); // Limit length
}

/**
 * Process a single Archive.org item
 */
async function processItem(identifier, config) {
  console.log(`\n========================================`);
  console.log(`Processing item: ${identifier}`);
  console.log(`========================================\n`);

  const startTime = Date.now();
  let processingFailed = false;

  try {
    // 1. Fetch metadata first to get source name
    const metadata = await getMetadata(identifier);
    const sourceName = extractSourceName(metadata);

    // Build item directory path with source organization
    const itemDir = sourceName
      ? path.join(config.out, sourceName, identifier)
      : path.join(config.out, identifier);

    if (sourceName) {
      console.log(`[source] Organizing under: ${sourceName}`);
    }
    console.log(`[item] ${metadata.metadata?.title || identifier}\n`);

    // Check if we can skip processing (intelligent re-run)
    if (config.cleanup) {
      const skipStatus = await checkSkipStatus(itemDir);
      if (skipStatus.skip) {
        console.log(`[skip] ✓ ${skipStatus.reason}`);
        console.log(`\n✓ Already complete\n`);
        return null;
      }

      if (skipStatus.needsDownload) {
        console.log(`[re-run] Missing raw files, will re-download`);
      } else if (skipStatus.needsSplit) {
        console.log(`[re-run] Missing tracks, will re-split`);
      }
    }

    // Get preset settings with CLI overrides
    const settings = getPreset(config.preset, {
      noiseDb: config.noiseDb,
      minSilence: config.minSilence,
      minSegment: config.minSegment,
      introTrimSec: config.introTrimSec,
      concurrency: config.concurrency
    });

    // 2. Pick Side A/B MP3s
    const audioFiles = pickAudioFiles(metadata, { preferMp3: true });
    console.log('');

    // 3. Download files (using itemDir which includes source folder)
    const baseOutDir = sourceName
      ? path.join(config.out, sourceName)
      : config.out;

    const downloadedPaths = await downloadItemFiles(
      identifier,
      audioFiles,
      baseOutDir,
      metadata
    );
    console.log('');

    // 4. Split into tracks
    const tracksDir = path.join(itemDir, 'tracks');

    const tracks = await processSides(downloadedPaths, tracksDir, {
      ...settings,
      progressiveCleanup: config.cleanup,
      cleanupLevel: config.cleanupLevel,
      trashDir: config.trashDir || path.join(config.out, '.trash'),
      identifier,
      dryRun: config.dryRun
    });

    console.log(`\n[done] ✓ Processed ${tracks.length} tracks`);

    // 5. Generate enriched names if enabled
    let trackNamesData = null;
    if (config.generateNames) {
      console.log(`\n[naming] Generating enriched track titles...`);
      trackNamesData = generateTrackNames({
        tracks,
        identifier,
        metadata,
        itemDir,
        renameFiles: config.renameFiles
      });
      console.log(`[naming] ✓ Generated ${trackNamesData.tracks.length} track titles`);

      if (config.renameFiles) {
        console.log(`[naming] ✓ Renamed ${trackNamesData.renamedCount} files`);
      }
    }

    // 6. Cleanup if enabled
    const trashDir = config.trashDir || path.join(config.out, '.trash');
    const cleanupReport = await maybeCleanupItem({
      itemDir,
      identifier,
      cleanup: config.cleanup,
      cleanupLevel: config.cleanupLevel,
      dryRun: config.dryRun,
      trashDir,
      purgeTrash: config.purgeTrash,
      failed: processingFailed
    });

    // 6. Write report
    const report = {
      identifier,
      source: sourceName || 'unknown',
      timestamp: new Date().toISOString(),
      settings,
      inputFiles: audioFiles.map(f => f.name),
      tracks: tracks.map(t => path.basename(t)),
      trackCount: tracks.length,
      durationMs: Date.now() - startTime,
      cleanup: cleanupReport,
      naming: trackNamesData ? {
        enabled: true,
        tracksNamed: trackNamesData.tracks.length,
        filesRenamed: config.renameFiles,
        renamedCount: trackNamesData.renamedCount || 0,
        namesJsonPath: 'names.json'
      } : {
        enabled: false
      }
    };

    const reportPath = path.join(itemDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[report] Saved to ${reportPath}`);

    console.log(`\n✓ Complete in ${(report.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Output: ${itemDir}\n`);

    return report;
  } catch (error) {
    processingFailed = true;
    console.error(`\n✗ Error processing ${identifier}:`);
    console.error(`  ${error.message}\n`);

    // Try to save error report
    try {
      // Try to get metadata for source name, but fallback if it fails
      let itemDir;
      try {
        const metadata = await getMetadata(identifier);
        const sourceName = extractSourceName(metadata);
        itemDir = sourceName
          ? path.join(config.out, sourceName, identifier)
          : path.join(config.out, identifier);
      } catch {
        // If metadata fetch fails, use simple path
        itemDir = path.join(config.out, identifier);
      }

      const trashDir = config.trashDir || path.join(config.out, '.trash');
      const cleanupReport = await maybeCleanupItem({
        itemDir,
        identifier,
        cleanup: config.cleanup,
        cleanupLevel: config.cleanupLevel,
        dryRun: config.dryRun,
        trashDir,
        purgeTrash: config.purgeTrash,
        failed: true
      });

      const errorReport = {
        identifier,
        timestamp: new Date().toISOString(),
        error: error.message,
        failed: true,
        cleanup: cleanupReport
      };

      const reportPath = path.join(itemDir, 'report.json');
      fs.mkdirSync(itemDir, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(errorReport, null, 2));
    } catch (reportError) {
      // Ignore report write errors
    }

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
