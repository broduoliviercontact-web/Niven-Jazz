import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Detect silence segments in audio file using ffmpeg
 * @param {string} inputPath - Path to input audio file
 * @param {object} options - { noiseDb: number, minSilence: number }
 * @returns {Promise<Array>} - Array of silence segments { start, end, duration }
 */
async function detectSilence(inputPath, { noiseDb = -35, minSilence = 0.6 } = {}) {
  console.log(`[silence] Detecting silence in ${path.basename(inputPath)}`);
  console.log(`[silence] Settings: noise=${noiseDb}dB, minSilence=${minSilence}s`);

  const command = `ffmpeg -i "${inputPath}" -af silencedetect=noise=${noiseDb}dB:d=${minSilence} -f null -`;

  try {
    const { stderr } = await execAsync(command);
    const silences = [];
    let currentSilence = {};

    const lines = stderr.split('\n');
    for (const line of lines) {
      const startMatch = line.match(/silence_start: ([\d.]+)/);
      const endMatch = line.match(/silence_end: ([\d.]+)/);

      if (startMatch) {
        currentSilence.start = parseFloat(startMatch[1]);
      }
      if (endMatch && currentSilence.start !== undefined) {
        currentSilence.end = parseFloat(endMatch[1]);
        currentSilence.duration = currentSilence.end - currentSilence.start;
        silences.push({ ...currentSilence });
        currentSilence = {};
      }
    }

    console.log(`[silence] Found ${silences.length} silence segments`);
    return silences;
  } catch (error) {
    throw new Error(`Silence detection failed: ${error.message}`);
  }
}

/**
 * Split audio file into tracks based on silence detection
 *
 * @param {string} inputPath - Path to input audio file
 * @param {string} outDir - Output directory for tracks
 * @param {object} options - Processing options
 * @param {number} options.introTrimSec - Seconds to trim from the start
 * @param {number} options.noiseDb - Noise threshold for silence detection
 * @param {number} options.minSilence - Minimum silence duration
 * @param {number} options.minSegment - Minimum segment duration to keep
 * @param {number} options.startIndex - Track index to start numbering from (default: 1)
 * @returns {Promise<object>} - { tracks: Array, nextIndex: number }
 */
export async function splitIntoTracks(inputPath, outDir, options = {}) {
  const {
    introTrimSec = 0,
    noiseDb = -35,
    minSilence = 0.6,
    minSegment = 20,
    startIndex = 1
  } = options;

  fs.mkdirSync(outDir, { recursive: true });

  // Apply intro trim if needed
  let workingFile = inputPath;
  if (introTrimSec > 0) {
    console.log(`[trim] Removing first ${introTrimSec}s from ${path.basename(inputPath)}`);
    const trimmedPath = path.join(outDir, `_trimmed_${path.basename(inputPath)}`);
    const trimCommand = `ffmpeg -i "${inputPath}" -ss ${introTrimSec} -c copy "${trimmedPath}" -y`;

    try {
      await execAsync(trimCommand);
      workingFile = trimmedPath;
      console.log(`[trim] ✓ Trimmed file created`);
    } catch (error) {
      throw new Error(`Trim failed: ${error.message}`);
    }
  }

  // Detect silence
  const silences = await detectSilence(workingFile, { noiseDb, minSilence });

  if (silences.length === 0) {
    console.warn(`[split] No silence detected, exporting whole file as single track`);
    const outputPath = path.join(outDir, `track_${String(startIndex).padStart(3, '0')}.mp3`);
    const copyCommand = `ffmpeg -i "${workingFile}" -c copy "${outputPath}" -y`;
    await execAsync(copyCommand);
    return { tracks: [outputPath], nextIndex: startIndex + 1 };
  }

  // Build segments from silences
  const segments = [];
  let lastEnd = 0;

  for (const silence of silences) {
    if (silence.start > lastEnd) {
      const duration = silence.start - lastEnd;
      if (duration >= minSegment) {
        segments.push({ start: lastEnd, end: silence.start, duration });
      }
    }
    lastEnd = silence.end;
  }

  // Add final segment (from last silence to end)
  const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${workingFile}"`);
  const totalDuration = parseFloat(stdout.trim());
  if (totalDuration > lastEnd) {
    const duration = totalDuration - lastEnd;
    if (duration >= minSegment) {
      segments.push({ start: lastEnd, end: totalDuration, duration });
    }
  }

  console.log(`[split] Extracted ${segments.length} segments (min ${minSegment}s)`);

  // Export tracks
  const tracks = [];
  let trackIndex = startIndex;

  for (const segment of segments) {
    const trackName = `track_${String(trackIndex).padStart(3, '0')}.mp3`;
    const outputPath = path.join(outDir, trackName);

    const exportCommand = `ffmpeg -i "${workingFile}" -ss ${segment.start} -to ${segment.end} -c copy "${outputPath}" -y`;

    try {
      await execAsync(exportCommand);
      console.log(`[split] ✓ ${trackName} (${segment.duration.toFixed(1)}s)`);
      tracks.push(outputPath);
      trackIndex++;
    } catch (error) {
      console.error(`[split] ✗ Failed to export ${trackName}: ${error.message}`);
    }
  }

  // Clean up trimmed temp file
  if (workingFile !== inputPath && fs.existsSync(workingFile)) {
    fs.unlinkSync(workingFile);
  }

  return { tracks, nextIndex: trackIndex };
}

/**
 * Process Side A and Side B with continuous track numbering
 * @param {Array} sideFiles - [sideAPath, sideBPath]
 * @param {string} outDir - Output directory
 * @param {object} options - Split options
 * @returns {Promise<Array>} - All track paths
 */
export async function processSides(sideFiles, outDir, options = {}) {
  const allTracks = [];
  let currentIndex = 1;

  for (let i = 0; i < sideFiles.length; i++) {
    const sideName = i === 0 ? 'Side A' : 'Side B';
    const sidePath = sideFiles[i];

    console.log(`\n[process] === ${sideName} ===`);

    const result = await splitIntoTracks(sidePath, outDir, {
      ...options,
      startIndex: currentIndex
    });

    allTracks.push(...result.tracks);
    currentIndex = result.nextIndex;
  }

  return allTracks;
}
