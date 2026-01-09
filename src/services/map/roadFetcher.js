/**
 * Road Fetcher - Step 1 of Map Generation
 * Fetches road data from Overpass API
 */

const axios = require('axios');
const config = require('../../config');
const { REDIS_KEYS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');

const OVERPASS_SERVERS = config.apis.overpass.servers;

/**
 * Build Overpass query for road data
 * @param {number} minLat - Minimum latitude
 * @param {number} minLon - Minimum longitude
 * @param {number} maxLat - Maximum latitude
 * @param {number} maxLon - Maximum longitude
 * @returns {string} Overpass query
 */
function buildOverpassQuery(minLat, minLon, maxLat, maxLon) {
  return `
    [out:json][timeout:25];
    (
      way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out body;
    >;
    out skel qt;
  `;
}

/**
 * Race multiple Overpass servers and return first successful response
 * @param {string} query - Overpass query
 * @returns {Promise<Object>} Response data
 */
async function raceOverpassServers(query) {
  console.log(`Racing ${OVERPASS_SERVERS.length} Overpass servers simultaneously...`);

  const fetchPromises = OVERPASS_SERVERS.map(async (url) => {
    const response = await axios.post(url, query, {
      headers: { 'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)' },
      timeout: config.apis.overpass.timeout
    });
    return { data: response.data, url };
  });

  try {
    const result = await Promise.any(fetchPromises);
    console.log(`WINNER: ${result.url} returned data first!`);
    return result.data;
  } catch (e) {
    console.error('All Overpass servers failed.');
    return null;
  }
}

/**
 * Parse Overpass response into road segments
 * @param {Object} data - Overpass response data
 * @returns {Object} { segments, visual }
 */
function parseOverpassResponse(data) {
  if (!data || !data.elements) {
    return { segments: [], visual: [] };
  }

  const nodes = {};
  for (const el of data.elements) {
    if (el.type === 'node') {
      nodes[el.id] = [el.lat, el.lon];
    }
  }

  const visual = [];
  const segments = [];

  for (const el of data.elements) {
    if (el.type === 'way') {
      const wayNodes = el.nodes || [];
      const coords = wayNodes.filter(nid => nodes[nid]).map(nid => nodes[nid]);

      if (coords.length > 1) {
        visual.push(coords);
        for (let i = 0; i < coords.length - 1; i++) {
          segments.push([coords[i], coords[i + 1]]);
        }
      }
    }
  }

  return { segments, visual };
}

/**
 * Normalize path for deduplication
 * @param {Array} pathData - Path data (array of coords or object with path property)
 * @returns {string} Normalized path string
 */
function normalizePath(pathData) {
  const p = Array.isArray(pathData) ? pathData : (pathData.path || pathData);
  return JSON.stringify(p.map(pt => [pt[0], pt[1]]));
}

/**
 * Merge new lines with existing lines (for expand mode)
 * @param {Array} newLines - New road lines
 * @param {Array} existingLines - Existing road lines
 * @returns {Array} Combined unique lines
 */
function mergeRoadLines(newLines, existingLines) {
  const seenPaths = new Set();
  const combined = [];

  // Add existing
  for (const line of existingLines) {
    try {
      const norm = normalizePath(line);
      if (!seenPaths.has(norm)) {
        seenPaths.add(norm);
        combined.push(line);
      }
    } catch (e) { /* skip invalid */ }
  }

  // Add new
  let newAddedCount = 0;
  for (const line of newLines) {
    try {
      const norm = normalizePath(line);
      if (!seenPaths.has(norm)) {
        seenPaths.add(norm);
        combined.push(line);
        newAddedCount++;
      }
    } catch (e) { /* skip invalid */ }
  }

  console.log(`Merge result: ${combined.length} total lines (added ${newAddedCount} unique new lines)`);
  return combined;
}

/**
 * Fetch red lines (roads) from Overpass API
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} regionSize - Region size in degrees
 * @param {string} mode - 'initial' or 'expand'
 * @returns {Promise<Object>} { segments, visual }
 */
async function fetchRedLines(lat, lon, regionSize, mode = 'initial') {
  console.log(`Step 1 - Fetching Red Lines for ${lat}, ${lon} (mode=${mode})`);

  const minLat = lat - regionSize;
  const maxLat = lat + regionSize;
  const minLon = lon - regionSize;
  const maxLon = lon + regionSize;

  const query = buildOverpassQuery(minLat, minLon, maxLat, maxLon);
  const data = await raceOverpassServers(query);

  if (!data) {
    return { segments: [], visual: [] };
  }

  const { segments, visual } = parseOverpassResponse(data);

  // Handle expansion mode
  let finalVisual = visual;
  if (mode === 'expand') {
    const existingLines = await loadFromRedis(REDIS_KEYS.RED_LINES) || [];
    console.log(`Expansion: Merging ${visual.length} new lines with ${existingLines.length} existing lines.`);
    finalVisual = mergeRoadLines(visual, existingLines);
  }

  // Save to Redis
  await saveToRedis(REDIS_KEYS.META, { lat, lon });
  await saveToRedis(REDIS_KEYS.RED_LINES, finalVisual);

  return { segments, visual: finalVisual };
}

module.exports = {
  fetchRedLines,
  buildOverpassQuery,
  raceOverpassServers,
  parseOverpassResponse,
  mergeRoadLines
};
