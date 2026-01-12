import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Encode URL path preserving slashes
 * @param {string} str - Path to encode
 * @returns {string}
 */
function encodePathPreservingSlashes(str) {
  return str.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * Download files from Archive.org item
 *
 * URL format: https://archive.org/download/<identifier>/<filename>
 * Filenames with spaces are properly encoded
 *
 * @param {string} identifier - Archive.org identifier
 * @param {Array} files - Array of file objects from metadata
 * @param {string} outDir - Output directory (e.g., "./out")
 * @param {object} metadata - Full metadata to save
 * @returns {Promise<Array>} - Array of downloaded file paths
 */
export async function downloadItemFiles(identifier, files, outDir, metadata) {
  const itemDir = path.join(outDir, identifier);
  const rawDir = path.join(itemDir, 'raw');

  // Create directories
  fs.mkdirSync(rawDir, { recursive: true });

  // Save metadata
  const metadataPath = path.join(itemDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`[metadata] Saved to ${metadataPath}`);

  const downloadedFiles = [];

  for (const file of files) {
    const filename = file.name;
    const encodedFilename = encodePathPreservingSlashes(filename);
    const url = `https://archive.org/download/${identifier}/${encodedFilename}`;
    const dest = path.join(rawDir, filename);

    console.log(`[download] ${identifier} ${filename} -> ${dest}`);

    try {
      const response = await axios.get(url, {
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(dest);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`[download] ✓ ${filename} (${formatBytes(file.size)})`);
      downloadedFiles.push(dest);
    } catch (error) {
      console.error(`[download] ✗ Failed to download ${filename}: ${error.message}`);
      throw error;
    }
  }

  return downloadedFiles;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
