#!/usr/bin/env node

/**
 * Smoke test for Louis Armstrong Tape 1
 * Verifies that Side A + Side B MP3s are correctly detected
 */

import { getMetadata, pickAudioFiles } from '../lib/metadata.js';

const IDENTIFIER = 'Louis_Armstrong_Tape_1_1923-1924';

async function smokeTest() {
  console.log('========================================');
  console.log('SMOKE TEST: Louis Armstrong Tape 1');
  console.log('========================================\n');

  try {
    // Fetch metadata
    console.log('[1/3] Fetching metadata...');
    const metadata = await getMetadata(IDENTIFIER);
    console.log(`  ✓ Got metadata for: ${metadata.metadata?.title || IDENTIFIER}\n`);

    // List all files
    const allFiles = Object.values(metadata.files || {});
    console.log(`[2/3] Total files in item: ${allFiles.length}`);
    console.log('  Audio files:');
    allFiles
      .filter(f => {
        const name = f.name.toLowerCase();
        return name.endsWith('.mp3') || name.endsWith('.flac') || name.endsWith('.wav');
      })
      .forEach(f => {
        console.log(`    - ${f.name} (${f.format})`);
      });
    console.log('');

    // Pick audio files
    console.log('[3/3] Running pickAudioFiles with preferMp3=true...');
    const selectedFiles = pickAudioFiles(metadata, { preferMp3: true });
    console.log('');

    // Assertions
    console.log('========================================');
    console.log('ASSERTIONS');
    console.log('========================================\n');

    let passed = true;

    // Check count
    if (selectedFiles.length === 2) {
      console.log('✓ Exactly 2 files selected');
    } else {
      console.error(`✗ Expected 2 files, got ${selectedFiles.length}`);
      passed = false;
    }

    // Check Side A
    const sideA = selectedFiles.find(f => /_Side_A\.mp3$/i.test(f.name));
    if (sideA) {
      console.log(`✓ Side A found: ${sideA.name}`);
    } else {
      console.error('✗ Side A MP3 not found');
      passed = false;
    }

    // Check Side B
    const sideB = selectedFiles.find(f => /_Side_B\.mp3$/i.test(f.name));
    if (sideB) {
      console.log(`✓ Side B found: ${sideB.name}`);
    } else {
      console.error('✗ Side B MP3 not found');
      passed = false;
    }

    // Final result
    console.log('');
    if (passed) {
      console.log('========================================');
      console.log('✓ ALL TESTS PASSED');
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.error('========================================');
      console.error('✗ TESTS FAILED');
      console.error('========================================\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('✗ TEST ERROR');
    console.error('========================================');
    console.error(`${error.message}\n`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

smokeTest();
