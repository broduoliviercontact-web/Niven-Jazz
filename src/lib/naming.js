/**
 * Naming utilities for track titles
 * Extracts pretty names from metadata and transcripts
 */

/**
 * Parse identifier to extract basic information
 * @param {string} identifier - Archive.org identifier
 * @returns {object} - { prettyBase, artist, title, year }
 */
function parseIdentifier(identifier) {
  // Try to extract parts from identifier
  // Common patterns: Artist_Title_Year, Artist_Album_Date, etc.

  const parts = identifier.split('_').filter(p => p.length > 0);

  // Try to find year (4 digits)
  const yearMatch = identifier.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : null;

  // Simple heuristic: first part might be artist, rest is title
  const artist = parts.length > 0 ? parts[0].replace(/-/g, ' ') : null;
  const title = parts.length > 1
    ? parts.slice(1).join(' ').replace(/-/g, ' ').replace(/\d{4}/, '').trim()
    : null;

  // Build prettyBase
  let prettyBase = identifier.replace(/_/g, ' ');
  if (artist && title) {
    prettyBase = `${artist} — ${title}`;
    if (year) {
      prettyBase += ` (${year})`;
    }
  }

  return { prettyBase, artist, title, year };
}

/**
 * Extract pretty base from Archive.org metadata
 * @param {object} options - { identifier, metadata }
 * @returns {object} - { prettyBase, sourceBaseMethod, metaTitle, metaCreator, metaDate }
 */
export function extractPrettyBaseFromMetadata({ identifier, metadata }) {
  const meta = metadata?.metadata || {};

  // Extract metadata fields
  let metaTitle = null;
  let metaCreator = null;
  let metaDate = null;

  // Title
  if (meta.title) {
    metaTitle = typeof meta.title === 'string'
      ? meta.title.trim()
      : Array.isArray(meta.title) ? meta.title[0]?.trim() : null;
  }

  // Creator
  if (meta.creator) {
    if (typeof meta.creator === 'string') {
      metaCreator = meta.creator.trim();
    } else if (Array.isArray(meta.creator)) {
      metaCreator = meta.creator.filter(c => c).join(', ').trim();
    }
  }

  // Date (try multiple fields)
  if (meta.date) {
    metaDate = typeof meta.date === 'string' ? meta.date.trim() : null;
  } else if (meta.year) {
    metaDate = typeof meta.year === 'string' ? meta.year.trim() : String(meta.year);
  } else if (meta.publicdate) {
    // Extract year from publicdate (format: YYYY-MM-DD)
    const dateMatch = String(meta.publicdate).match(/(\d{4})/);
    metaDate = dateMatch ? dateMatch[1] : null;
  }

  // Clean up
  if (metaTitle) {
    metaTitle = metaTitle.replace(/\s+/g, ' ').substring(0, 100);
  }
  if (metaCreator) {
    metaCreator = metaCreator.replace(/\s+/g, ' ').substring(0, 80);
  }
  if (metaDate) {
    metaDate = metaDate.substring(0, 20);
  }

  // Build prettyBase in cascade
  let prettyBase = null;
  let sourceBaseMethod = 'identifier';

  if (metaCreator && metaTitle && metaDate) {
    prettyBase = `${metaCreator} — ${metaTitle} (${metaDate})`;
    sourceBaseMethod = 'metadata';
  } else if (metaCreator && metaTitle) {
    prettyBase = `${metaCreator} — ${metaTitle}`;
    sourceBaseMethod = 'metadata';
  } else if (metaTitle && metaDate) {
    prettyBase = `${metaTitle} (${metaDate})`;
    sourceBaseMethod = 'metadata';
  } else if (metaTitle) {
    prettyBase = metaTitle;
    sourceBaseMethod = 'metadata';
  } else {
    // Fallback to identifier parsing
    const parsed = parseIdentifier(identifier);
    prettyBase = parsed.prettyBase;
    sourceBaseMethod = 'identifier';
  }

  return {
    prettyBase,
    sourceBaseMethod,
    metaTitle,
    metaCreator,
    metaDate
  };
}

/**
 * Extract location from transcript text
 * @param {string} transcriptText - Transcript content
 * @returns {object} - { location, confidence, reason }
 */
export function extractLocation(transcriptText) {
  if (!transcriptText || typeof transcriptText !== 'string') {
    return { location: null, confidence: 0, reason: 'no transcript' };
  }

  // Patterns ordered by confidence (most specific first)
  // Capture until first major punctuation or preposition
  const patterns = [
    {
      regex: /recorded at (the )?([^.\n,!?]{3,40})(?:\s+(?:in|on|at|during|from)\s+([^.\n,!?]{3,30}))?/i,
      confidence: 0.9,
      reason: 'recorded at',
      useGroups: [2, 3]
    },
    {
      regex: /live at (the )?([^.\n,!?]{3,40})(?:\s+(?:in|on)\s+([^.\n,!?]{3,30}))?/i,
      confidence: 0.9,
      reason: 'live at',
      useGroups: [2, 3]
    },
    {
      regex: /from (the )?([^.\n,!?]{3,40})\s+(?:in|on)\s+([^.\n,!?]{3,30})/i,
      confidence: 0.7,
      reason: 'from <place> in <city>',
      useGroups: [2, 3]
    },
    {
      regex: /from (the )?([^.\n,!?]{3,40})(?:\s+(?:during|and|with))?/i,
      confidence: 0.6,
      reason: 'from'
    }
  ];

  // Try each pattern (taking first 500 chars for performance)
  const searchText = transcriptText.substring(0, 500);

  for (const pattern of patterns) {
    const match = searchText.match(pattern.regex);
    if (match) {
      let location;

      if (pattern.useGroups) {
        // Combine multiple groups
        location = pattern.useGroups
          .map(i => match[i])
          .filter(p => p)
          .join(', ')
          .trim();
      } else {
        location = match[2]?.trim();
      }

      if (location) {
        // Clean up location
        location = cleanLocation(location);

        // Validate (reject if too generic or suspicious)
        if (isValidLocation(location)) {
          return {
            location,
            confidence: pattern.confidence,
            reason: pattern.reason
          };
        }
      }
    }
  }

  return { location: null, confidence: 0, reason: 'no match' };
}

/**
 * Clean location string
 * @param {string} location
 * @returns {string}
 */
function cleanLocation(location) {
  // Remove common noise words
  const noiseWords = [
    'ladies and gentlemen',
    'thank you',
    'now',
    'here',
    'tonight',
    'this evening'
  ];

  let cleaned = location.toLowerCase();
  for (const noise of noiseWords) {
    cleaned = cleaned.replace(new RegExp(noise, 'gi'), '');
  }

  // Clean up
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 40);

  // Capitalize first letter of each word
  cleaned = cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return cleaned;
}

/**
 * Validate if location seems legitimate
 * @param {string} location
 * @returns {boolean}
 */
function isValidLocation(location) {
  if (!location || location.length < 3) return false;

  // Reject too short or too generic
  const tooGeneric = ['the', 'a', 'an', 'here', 'there', 'this', 'that'];
  const lower = location.toLowerCase().trim();

  if (tooGeneric.includes(lower)) return false;

  // Reject if mostly numbers or special chars
  const alphaCount = (location.match(/[a-z]/gi) || []).length;
  if (alphaCount < location.length * 0.5) return false;

  return true;
}

/**
 * Build fallback title for a track
 * @param {object} options - Configuration
 * @returns {object} - { title, method, ...details }
 */
export function buildFallbackTitle(options) {
  const {
    identifier,
    metadata,
    transcriptText,
    trackIndex,
    side,
    sourceFilename
  } = options;

  // Extract pretty base from metadata
  const baseInfo = extractPrettyBaseFromMetadata({ identifier, metadata });
  const { prettyBase, sourceBaseMethod, metaTitle, metaCreator, metaDate } = baseInfo;

  // Extract location if transcript available
  const locationInfo = transcriptText
    ? extractLocation(transcriptText)
    : { location: null, confidence: 0, reason: 'no transcript' };

  // Build title parts
  const parts = [prettyBase];

  // Add location if confidence is high enough
  if (locationInfo.location && locationInfo.confidence >= 0.6) {
    parts.push(locationInfo.location);
  }

  // Add side
  if (side) {
    parts.push(side);
  }

  // Add track number
  const trackNum = String(trackIndex).padStart(2, '0');
  parts.push(`Track ${trackNum}`);

  const title = parts.join(' — ');

  return {
    title,
    method: 'fallback',
    sourceBaseMethod,
    prettyBase,
    metaTitle,
    metaCreator,
    metaDate,
    location: locationInfo.location,
    locationConfidence: locationInfo.confidence,
    locationReason: locationInfo.reason,
    reason: `Fallback title (base from ${sourceBaseMethod}${locationInfo.location ? ', location detected' : ''})`
  };
}

/**
 * Infer track title (main entry point)
 * @param {object} options - All available context
 * @returns {object} - Title and metadata
 */
export function inferTrackTitle(options) {
  // For now, always use fallback (ASR-based naming would be added later)
  return buildFallbackTitle(options);
}
