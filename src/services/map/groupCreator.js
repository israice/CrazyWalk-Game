/**
 * Group Creator - Step 5 of Map Generation
 * Groups touching polygons into monolith areas
 */

const turf = require('@turf/turf');
const { REDIS_KEYS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');

/**
 * Convert polygon to Turf.js format
 * @param {Object} polygon - Polygon data with coords
 * @returns {Object|null} Turf polygon or null
 */
function polygonToTurf(polygon) {
  const coords = polygon.coords.map(c => [c[1], c[0]]);
  if (coords.length < 4) return null;

  try {
    return turf.polygon([coords]);
  } catch (e) {
    return null;
  }
}

/**
 * Dissolve touching polygons into groups
 * @param {Array} turfPolygons - Array of Turf polygons
 * @returns {Array} Array of dissolved geometries
 */
function dissolvePolygons(turfPolygons) {
  if (turfPolygons.length === 0) return [];

  try {
    const fc = turf.featureCollection(turfPolygons);
    const dissolved = turf.dissolve(fc);

    if (dissolved.type === 'FeatureCollection') {
      return dissolved.features;
    } else if (dissolved.type === 'Feature') {
      return [dissolved];
    }
  } catch (e) {
    console.error(`Dissolve error: ${e.message}`);
  }

  return [];
}

/**
 * Find which source polygons are contained in a dissolved geometry
 * @param {Object} dissolvedGeom - Dissolved Turf geometry
 * @param {Array} sources - Array of {id, geom} objects
 * @returns {Array} Array of polygon IDs
 */
function findContainedPolygons(dissolvedGeom, sources) {
  const ids = [];

  for (const s of sources) {
    try {
      if (turf.booleanIntersects(dissolvedGeom, s.geom)) {
        ids.push(s.id);
      }
    } catch (e) { /* skip */ }
  }

  return ids;
}

/**
 * Create groups from dissolved polygons
 * @returns {Promise<Array>} Groups array
 */
async function createGroups() {
  console.log('Step 5 - Grouping');

  const polygons = await loadFromRedis(REDIS_KEYS.POLYGONS);
  const groups = [];

  if (!polygons || polygons.length === 0) {
    await saveToRedis(REDIS_KEYS.GROUPS, groups);
    return groups;
  }

  // Convert polygons to Turf format
  const turfPolygons = [];
  const sources = [];

  for (const p of polygons) {
    const turfPoly = polygonToTurf(p);
    if (turfPoly) {
      turfPolygons.push(turfPoly);
      sources.push({ id: p.id, geom: turfPoly });
    }
  }

  if (turfPolygons.length === 0) {
    await saveToRedis(REDIS_KEYS.GROUPS, groups);
    return groups;
  }

  // Dissolve touching polygons
  const dissolvedGeoms = dissolvePolygons(turfPolygons);

  // Create group objects
  for (let idx = 0; idx < dissolvedGeoms.length; idx++) {
    const g = dissolvedGeoms[idx];
    const boundary = g.geometry.coordinates[0].map(c => [c[1], c[0]]);
    const memberIds = findContainedPolygons(g, sources);

    groups.push({
      id: `area_${idx}`,
      coords: boundary,
      type: 'monolith',
      polygon_ids: memberIds
    });
  }

  await saveToRedis(REDIS_KEYS.GROUPS, groups);

  console.log(`Created ${groups.length} groups`);

  return groups;
}

module.exports = {
  createGroups,
  polygonToTurf,
  dissolvePolygons,
  findContainedPolygons
};
