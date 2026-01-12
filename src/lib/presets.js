/**
 * Default presets for different types of audio processing
 */

export const PRESETS = {
  niven: {
    name: 'Niven Tapes',
    description: 'Optimized for cassette recordings with commentary',
    noiseDb: -35,
    minSilence: 0.6,
    minSegment: 20,
    introTrimSec: 12,
    concurrency: 2
  },
  default: {
    name: 'Default',
    description: 'Balanced settings for general audio',
    noiseDb: -40,
    minSilence: 0.5,
    minSegment: 15,
    introTrimSec: 0,
    concurrency: 2
  }
};

/**
 * Get preset by name, with CLI overrides
 * @param {string} presetName - Name of preset (or null)
 * @param {object} cliOverrides - CLI flag overrides
 * @returns {object} - Final settings
 */
export function getPreset(presetName = null, cliOverrides = {}) {
  let baseSettings = {};

  if (presetName && PRESETS[presetName]) {
    baseSettings = { ...PRESETS[presetName] };
    console.log(`[preset] Using "${baseSettings.name}" preset`);
  } else if (presetName) {
    console.warn(`[preset] Unknown preset "${presetName}", using default`);
    baseSettings = { ...PRESETS.default };
  } else {
    // No preset specified, use Niven as default for this tool
    baseSettings = { ...PRESETS.niven };
  }

  // Apply CLI overrides
  const finalSettings = {
    ...baseSettings,
    ...Object.fromEntries(
      Object.entries(cliOverrides).filter(([_, v]) => v !== undefined && v !== null)
    )
  };

  // Show effective settings
  console.log('[preset] Effective settings:');
  console.log(`  noiseDb: ${finalSettings.noiseDb}dB`);
  console.log(`  minSilence: ${finalSettings.minSilence}s`);
  console.log(`  minSegment: ${finalSettings.minSegment}s`);
  console.log(`  introTrimSec: ${finalSettings.introTrimSec}s`);
  console.log(`  concurrency: ${finalSettings.concurrency}`);

  return finalSettings;
}
