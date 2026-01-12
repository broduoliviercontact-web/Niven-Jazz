import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Check if tracks output is valid for an item
 * @param {string} itemDir - Path to item directory (e.g., out/identifier)
 * @returns {Promise<object>} - { valid: boolean, reason?: string }
 */
export async function isTracksOutputValid(itemDir) {
  const tracksDir = path.join(itemDir, 'tracks');

  // Check if tracks directory exists
  if (!await fs.pathExists(tracksDir)) {
    return { valid: false, reason: 'tracks/ directory not found' };
  }

  // Find MP3 files in tracks directory
  const files = await fs.readdir(tracksDir);
  const mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3'));

  if (mp3Files.length === 0) {
    return { valid: false, reason: 'no MP3 files in tracks/' };
  }

  // Optional: Probe each MP3 to ensure duration > 10s
  for (const mp3 of mp3Files) {
    const mp3Path = path.join(tracksDir, mp3);
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`
      );
      const duration = parseFloat(stdout.trim());

      if (isNaN(duration) || duration < 10) {
        return { valid: false, reason: `${mp3} is too short (${duration.toFixed(1)}s < 10s)` };
      }
    } catch (error) {
      return { valid: false, reason: `failed to probe ${mp3}: ${error.message}` };
    }
  }

  return { valid: true, mp3Count: mp3Files.length };
}

/**
 * Check if music output is valid for an item
 * (Kept for backward compatibility, delegates to isTracksOutputValid)
 * @param {string} itemDir - Path to item directory (e.g., out/identifier)
 * @returns {Promise<object>} - { valid: boolean, reason?: string }
 */
export async function isMusicOutputValid(itemDir) {
  // For now, validate tracks instead of music
  return isTracksOutputValid(itemDir);
}

/**
 * Move files/directories to trash instead of deleting
 * @param {string} srcPath - Source path to move
 * @param {string} trashBaseDir - Base trash directory (e.g., out/.trash)
 * @param {object} options - { identifier: string, dryRun?: boolean }
 * @returns {Promise<string|null>} - Trash path if moved, null if dryRun or error
 */
export async function moveToTrash(srcPath, trashBaseDir, { identifier, dryRun = false }) {
  if (!await fs.pathExists(srcPath)) {
    console.log(`[cleanup] skip (not found): ${srcPath}`);
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trashPath = path.join(trashBaseDir, identifier, timestamp, path.basename(srcPath));

  if (dryRun) {
    console.log(`[cleanup] [DRY-RUN] would move: ${srcPath} -> ${trashPath}`);
    return null;
  }

  try {
    await fs.ensureDir(path.dirname(trashPath));
    await fs.move(srcPath, trashPath, { overwrite: false });

    const stats = await fs.stat(trashPath);
    const sizeInfo = stats.isDirectory()
      ? await getDirSize(trashPath)
      : stats.size;

    console.log(`[cleanup] moved to trash: ${path.basename(srcPath)} (${formatBytes(sizeInfo)})`);
    return trashPath;
  } catch (error) {
    console.error(`[cleanup] failed to move ${srcPath}: ${error.message}`);
    return null;
  }
}

/**
 * Purge trash directory permanently
 * @param {string} trashPath - Path to trash directory to purge
 * @param {boolean} dryRun - Dry run mode
 * @returns {Promise<boolean>}
 */
export async function purgeTrash(trashPath, dryRun = false) {
  if (!await fs.pathExists(trashPath)) {
    console.log(`[cleanup] trash not found: ${trashPath}`);
    return false;
  }

  const size = await getDirSize(trashPath);

  if (dryRun) {
    console.log(`[cleanup] [DRY-RUN] would purge: ${trashPath} (${formatBytes(size)})`);
    return false;
  }

  try {
    await fs.remove(trashPath);
    console.log(`[cleanup] purged trash: ${trashPath} (freed ${formatBytes(size)})`);
    return true;
  } catch (error) {
    console.error(`[cleanup] failed to purge ${trashPath}: ${error.message}`);
    return false;
  }
}

/**
 * Get total size of a directory recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} - Size in bytes
 */
async function getDirSize(dirPath) {
  let totalSize = 0;

  const items = await fs.readdir(dirPath);
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = await fs.stat(itemPath);

    if (stats.isDirectory()) {
      totalSize += await getDirSize(itemPath);
    } else {
      totalSize += stats.size;
    }
  }

  return totalSize;
}

/**
 * Cleanup item based on policy
 * @param {object} options - Cleanup configuration
 * @param {string} options.itemDir - Item directory path
 * @param {string} options.identifier - Item identifier
 * @param {boolean} options.cleanup - Enable cleanup
 * @param {string} options.cleanupLevel - raw|tracks|all
 * @param {boolean} options.dryRun - Dry run mode
 * @param {string} options.trashDir - Trash base directory
 * @param {boolean} options.purgeTrash - Purge trash after move
 * @param {boolean} options.failed - Whether item processing failed
 * @returns {Promise<object>} - Cleanup report
 */
export async function maybeCleanupItem(options) {
  const {
    itemDir,
    identifier,
    cleanup = false,
    cleanupLevel = 'all',
    dryRun = false,
    trashDir = 'out/.trash',
    purgeTrash: shouldPurge = false,
    failed = false
  } = options;

  const report = {
    enabled: cleanup,
    level: cleanupLevel,
    movedToTrash: [],
    purged: false,
    savedBytes: 0,
    skipped: null
  };

  if (!cleanup) {
    report.skipped = 'cleanup disabled';
    return report;
  }

  if (failed) {
    console.log(`[cleanup] ⚠ skipping cleanup: item processing failed`);
    report.skipped = 'item failed';
    return report;
  }

  if (dryRun) {
    console.log(`[cleanup] [DRY-RUN] mode active`);
  }

  // Validate tracks output (final output in current workflow)
  console.log(`[cleanup] validating tracks output...`);
  const tracksValidation = await isTracksOutputValid(itemDir);

  if (!tracksValidation.valid) {
    console.warn(`[cleanup] ⚠ kept all files: ${tracksValidation.reason}`);
    report.skipped = tracksValidation.reason;
    return report;
  }

  console.log(`[cleanup] ✓ tracks output valid (${tracksValidation.mp3Count} files)`);

  // Determine what to cleanup based on level
  // For now, only 'raw' makes sense since tracks/ is the final output
  const rawDir = path.join(itemDir, 'raw');
  const toClean = [];

  if (cleanupLevel === 'raw' || cleanupLevel === 'tracks' || cleanupLevel === 'all') {
    if (await fs.pathExists(rawDir)) {
      toClean.push({ path: rawDir, name: 'raw', size: await getDirSize(rawDir) });
    }
  }

  if (toClean.length === 0) {
    console.log(`[cleanup] nothing to clean (level: ${cleanupLevel})`);
    report.skipped = 'nothing to clean';
    return report;
  }

  // Move to trash
  console.log(`[cleanup] level=${cleanupLevel}, moving ${toClean.length} directories to trash...`);

  for (const item of toClean) {
    const trashPath = await moveToTrash(item.path, trashDir, { identifier, dryRun });
    if (trashPath) {
      report.movedToTrash.push(item.name);
      report.savedBytes += item.size;
    }
  }

  // Purge trash if requested
  if (shouldPurge && report.movedToTrash.length > 0 && !dryRun) {
    const itemTrashPath = path.join(trashDir, identifier);
    const purged = await purgeTrash(itemTrashPath, dryRun);
    report.purged = purged;
  }

  if (report.savedBytes > 0) {
    console.log(`[cleanup] ✓ saved ${formatBytes(report.savedBytes)} (${report.movedToTrash.join(', ')})`);
  }

  return report;
}

/**
 * Progressive cleanup - cleanup individual files as processing progresses
 * @param {string} filePath - File to cleanup
 * @param {object} options - Cleanup options
 * @returns {Promise<boolean>}
 */
export async function progressiveCleanup(filePath, options) {
  const {
    enabled = false,
    trashDir = 'out/.trash',
    identifier,
    dryRun = false,
    prerequisiteValid = true
  } = options;

  if (!enabled) {
    return false;
  }

  if (!prerequisiteValid) {
    console.log(`[cleanup] kept ${path.basename(filePath)} because prerequisite invalid`);
    return false;
  }

  const trashPath = await moveToTrash(filePath, trashDir, { identifier, dryRun });
  return !!trashPath;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if processing can be skipped (intelligent re-run)
 * @param {string} itemDir - Item directory
 * @returns {Promise<object>} - { skip: boolean, reason: string, needsDownload: boolean, needsSplit: boolean }
 */
export async function checkSkipStatus(itemDir) {
  const tracksValid = await isTracksOutputValid(itemDir);
  const rawDir = path.join(itemDir, 'raw');

  // If tracks are valid, we can skip everything
  if (tracksValid.valid) {
    return { skip: true, reason: 'tracks output valid', needsDownload: false, needsSplit: false };
  }

  const hasRaw = await fs.pathExists(rawDir);

  // If no raw files, need full processing (download + split)
  if (!hasRaw) {
    return { skip: false, reason: 'needs full processing', needsDownload: true, needsSplit: true };
  }

  // If we have raw but tracks are invalid, need to re-split
  return { skip: false, reason: 'needs split', needsDownload: false, needsSplit: true };
}
