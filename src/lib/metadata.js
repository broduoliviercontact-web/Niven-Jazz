import axios from 'axios';

/**
 * Fetch metadata for an Archive.org item
 * @param {string} identifier - Archive.org identifier
 * @returns {Promise<object>} - Item metadata including files list
 */
export async function getMetadata(identifier) {
  const url = `https://archive.org/metadata/${identifier}`;
  console.log(`[metadata] Fetching ${identifier}...`);

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch metadata for ${identifier}: ${error.message}`);
  }
}

/**
 * Check if file is a valid audio file
 * @param {object} file - File object from metadata
 * @returns {boolean}
 */
function isAudioFile(file) {
  const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg'];
  const name = (file.name || '').toLowerCase();

  // Exclude playlists and metadata files
  if (name.includes('.m3u') || name.includes('_files.xml') || name.includes('_meta.xml')) {
    return false;
  }

  return audioExtensions.some(ext => name.endsWith(ext));
}

/**
 * Ensure we have both Side A and Side B files
 * @param {Array} files - Array of file objects
 * @returns {object} - { hasA: boolean, hasB: boolean, sideA: object|null, sideB: object|null }
 */
function ensureSides(files) {
  const sideAPattern = /_Side_A\.mp3$/i;
  const sideBPattern = /_Side_B\.mp3$/i;

  const sideA = files.find(f => sideAPattern.test(f.name));
  const sideB = files.find(f => sideBPattern.test(f.name));

  return {
    hasA: !!sideA,
    hasB: !!sideB,
    sideA,
    sideB
  };
}

/**
 * Pick audio files from metadata, prioritizing Side A/B MP3s
 *
 * Expected naming pattern:
 *   <identifier>_Side_A.mp3
 *   <identifier>_Side_B.mp3
 * Example:
 *   Louis_Armstrong_Tape_1_1923-1924_Side_A.mp3
 *   Louis_Armstrong_Tape_1_1923-1924_Side_B.mp3
 *
 * @param {object} metadata - Full metadata object from Archive.org
 * @param {object} options - { preferMp3: boolean }
 * @returns {Array} - Array of selected file objects
 */
export function pickAudioFiles(metadata, { preferMp3 = true } = {}) {
  const files = Object.values(metadata.files || {});

  // Filter to only real audio files
  const audioFiles = files.filter(isAudioFile);

  if (audioFiles.length === 0) {
    throw new Error('No audio files found in item');
  }

  console.log(`[audio] Found ${audioFiles.length} audio files total`);

  if (preferMp3) {
    // Priority 1: Side A/B MP3 pattern
    const mp3Files = audioFiles.filter(f => f.name.toLowerCase().endsWith('.mp3'));

    if (mp3Files.length > 0) {
      const sides = ensureSides(mp3Files);

      if (sides.hasA && sides.hasB) {
        console.log(`[audio] ✓ Found Side A + Side B MP3s`);
        console.log(`  → ${sides.sideA.name}`);
        console.log(`  → ${sides.sideB.name}`);
        return [sides.sideA, sides.sideB];
      } else {
        console.warn(`[audio] ⚠ Side A/B pattern not complete:`);
        console.warn(`  Side A: ${sides.hasA ? '✓' : '✗'}`);
        console.warn(`  Side B: ${sides.hasB ? '✓' : '✗'}`);
        console.warn(`  Available audio files:`);
        audioFiles.forEach(f => console.warn(`    - ${f.name} (${f.format})`));

        throw new Error('Missing Side A or Side B MP3. Check file listing above.');
      }
    }

    // Fallback: FLAC files
    const flacFiles = audioFiles.filter(f => f.name.toLowerCase().endsWith('.flac'));
    if (flacFiles.length > 0) {
      console.log(`[audio] No MP3s found, using ${flacFiles.length} FLAC file(s)`);
      return flacFiles;
    }

    // Fallback: WAV files
    const wavFiles = audioFiles.filter(f => f.name.toLowerCase().endsWith('.wav'));
    if (wavFiles.length > 0) {
      console.log(`[audio] No MP3/FLAC found, using ${wavFiles.length} WAV file(s)`);
      return wavFiles;
    }
  }

  // Last resort: return all audio files
  console.log(`[audio] Returning all ${audioFiles.length} audio files`);
  return audioFiles;
}
