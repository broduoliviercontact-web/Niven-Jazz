#!/usr/bin/env node

import { extractPrettyBaseFromMetadata, extractLocation, buildFallbackTitle } from '../lib/naming.js';

console.log('=== Testing Naming Functions ===\n');

// Test 1: extractPrettyBaseFromMetadata
console.log('Test 1: extractPrettyBaseFromMetadata');
console.log('==========================================');

const testMetadata = [
  {
    name: 'Full metadata (creator + title + date)',
    metadata: {
      metadata: {
        creator: 'Larry Niven',
        title: 'Louis Armstrong Tape 1 (1923-1924)',
        date: '1923-1924'
      }
    },
    identifier: 'Louis_Armstrong_Tape_1_1923-1924'
  },
  {
    name: 'Creator array + title',
    metadata: {
      metadata: {
        creator: ['Larry Niven', 'Co-author'],
        title: 'Jazz Collection Volume 1'
      }
    },
    identifier: 'Jazz_Collection_Vol_1'
  },
  {
    name: 'Title only',
    metadata: {
      metadata: {
        title: 'Historic Jazz Recordings'
      }
    },
    identifier: 'Historic_Jazz_Recordings'
  },
  {
    name: 'No useful metadata (fallback to identifier)',
    metadata: {
      metadata: {}
    },
    identifier: 'Duke_Ellington_1930_1935'
  },
  {
    name: 'Date from publicdate',
    metadata: {
      metadata: {
        creator: 'Archive User',
        title: 'Old Recordings',
        publicdate: '2024-01-15'
      }
    },
    identifier: 'old_recordings'
  }
];

testMetadata.forEach((test, i) => {
  console.log(`\n${i + 1}. ${test.name}`);
  const result = extractPrettyBaseFromMetadata(test);
  console.log(`   Pretty Base: "${result.prettyBase}"`);
  console.log(`   Method: ${result.sourceBaseMethod}`);
  if (result.metaTitle) console.log(`   Meta Title: ${result.metaTitle}`);
  if (result.metaCreator) console.log(`   Meta Creator: ${result.metaCreator}`);
  if (result.metaDate) console.log(`   Meta Date: ${result.metaDate}`);
});

// Test 2: extractLocation
console.log('\n\nTest 2: extractLocation');
console.log('==========================================');

const testTranscripts = [
  {
    name: 'Recorded at',
    text: 'This recording was made. Recorded at the Savoy Ballroom in Chicago during the summer of 1924.'
  },
  {
    name: 'Live at',
    text: 'Ladies and gentlemen, welcome! Live at the Apollo Theater, here is the band!'
  },
  {
    name: 'From <place> in <city>',
    text: 'From the Sunset Cafe in New York City, broadcasting live tonight.'
  },
  {
    name: 'Just "from"',
    text: 'This performance is from Carnegie Hall and features the orchestra.'
  },
  {
    name: 'No location',
    text: 'This is a wonderful performance. The band plays beautifully. Thank you for listening.'
  },
  {
    name: 'Generic noise',
    text: 'Recorded at the. Ladies and gentlemen, thank you.'
  }
];

testTranscripts.forEach((test, i) => {
  console.log(`\n${i + 1}. ${test.name}`);
  const result = extractLocation(test.text);
  if (result.location) {
    console.log(`   ✓ Location: "${result.location}"`);
    console.log(`   Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`   Reason: ${result.reason}`);
  } else {
    console.log(`   ✗ No location detected (${result.reason})`);
  }
});

// Test 3: buildFallbackTitle
console.log('\n\nTest 3: buildFallbackTitle');
console.log('==========================================');

const testTitles = [
  {
    name: 'With metadata and location',
    options: {
      identifier: 'Louis_Armstrong_Tape_1_1923-1924',
      metadata: {
        metadata: {
          creator: 'Larry Niven',
          title: 'Louis Armstrong Collection',
          date: '1923-1924'
        }
      },
      transcriptText: 'Recorded at the Savoy Ballroom in Chicago.',
      trackIndex: 3,
      side: 'Side A',
      sourceFilename: 'file_Side_A.mp3'
    }
  },
  {
    name: 'Metadata only (no transcript)',
    options: {
      identifier: 'Duke_Ellington_1930',
      metadata: {
        metadata: {
          creator: 'Archive Collection',
          title: 'Duke Ellington Early Years'
        }
      },
      transcriptText: null,
      trackIndex: 1,
      side: 'Side B',
      sourceFilename: 'file_Side_B.mp3'
    }
  },
  {
    name: 'Low confidence location (ignored)',
    options: {
      identifier: 'Jazz_Recording',
      metadata: {
        metadata: {
          title: 'Unknown Jazz Session'
        }
      },
      transcriptText: 'From a place somewhere.',
      trackIndex: 5,
      side: 'Side A',
      sourceFilename: 'file.mp3'
    }
  }
];

testTitles.forEach((test, i) => {
  console.log(`\n${i + 1}. ${test.name}`);
  const result = buildFallbackTitle(test.options);
  console.log(`   Title: "${result.title}"`);
  console.log(`   Method: ${result.method}`);
  console.log(`   Base Method: ${result.sourceBaseMethod}`);
  console.log(`   Pretty Base: ${result.prettyBase}`);
  if (result.location) {
    console.log(`   Location: ${result.location} (confidence: ${result.locationConfidence.toFixed(2)})`);
  }
  console.log(`   Reason: ${result.reason}`);
});

console.log('\n\n=== All Tests Complete ===\n');
