/**
 * Map Generator - Main orchestrator
 * Coordinates all steps of map generation
 */

const config = require('../../config');
const { REDIS_KEYS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');

// Import step modules
const { fetchRedLines } = require('./roadFetcher');
const { identifyIntersections } = require('./intersectionFinder');
const { createGraphElements } = require('./graphBuilder');
const { findPolygons } = require('./polygonFinder');
const { createGroups } = require('./groupCreator');

// Import extracted modules
const { calculateConnections } = require('./connectionCalculator');
const { createPosterGrid } = require('./posterGridCreator');
const { applyModeFiltering } = require('./modeFilter');
const { filterOrphanedElements, calculatePolygonPoints } = require('./mapHelpers');

// Region sizes for retry attempts (in degrees)
const REGION_SIZES = [0.0015, 0.005, 0.01];


/**
 * Main map generation function
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {boolean} forceRebuild - Force regeneration
 * @param {string} mode - 'initial' or 'expand'
 * @param {Array|null} restoredPolygonIds - Previously visible polygon IDs
 * @returns {Promise<Object>} Map data
 */
async function generateMap(lat, lon, forceRebuild = false, mode = 'initial', restoredPolygonIds = null) {
  console.log(`>>> generateMap: lat=${lat}, lon=${lon}, force_rebuild=${forceRebuild}, mode=${mode}, restored_ids=${restoredPolygonIds ? restoredPolygonIds.length : 0}`);

  // Cache check
  const cacheLat = Math.round(lat * 1000) / 1000;
  const cacheLon = Math.round(lon * 1000) / 1000;
  const cacheKey = `map_cache:${cacheLat}_${cacheLon}`;

  if (mode === 'initial' && !forceRebuild) {
    const cachedData = await loadFromRedis(cacheKey);
    if (cachedData) {
      console.log(`CACHE HIT: Returning cached map data for ${cacheKey}`);
      return cachedData;
    }
    console.log(`CACHE MISS: No cached data for ${cacheKey}, generating...`);
  }

  const tStart = Date.now();

  for (let attempt = 0; attempt < REGION_SIZES.length; attempt++) {
    const size = REGION_SIZES[attempt];
    const meters = Math.round(size * 111000);

    console.log('========================================');
    console.log(`GPS POLYGON ATTEMPT ${attempt + 1}/3: region_size=${size} (~${meters}m)`);
    console.log('========================================');

    // Step 1: Fetch roads
    const t0 = Date.now();
    const { segments: redSegments, visual: redVisual } = await fetchRedLines(lat, lon, size, mode);
    console.log(`PERF: Fetch Red Lines took ${((Date.now() - t0) / 1000).toFixed(4)}s`);

    if (!redVisual.length && !redSegments.length) {
      console.warn(`ATTEMPT ${attempt + 1}/3: No roads found for region_size=${size}`);
      if (attempt < REGION_SIZES.length - 1) {
        console.log('Retrying with larger region...');
        continue;
      }
      return { error: 'NO_ROADS', message: `No roads found at (${lat}, ${lon})` };
    }

    console.log(`ATTEMPT ${attempt + 1}/3: Found ${redVisual.length} road segments`);

    // Step 2: Find intersections
    const t1 = Date.now();
    const { blueCircles } = await identifyIntersections();
    console.log(`PERF: Identify Intersections took ${((Date.now() - t1) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attempt + 1}/3: Identified ${blueCircles.length} intersections`);

    // Step 3: Create graph elements
    const t2 = Date.now();
    let { whiteLines, greenCircles } = await createGraphElements();
    console.log(`PERF: Create Graph Elements took ${((Date.now() - t2) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attempt + 1}/3: Created ${whiteLines.length} white lines, ${greenCircles.length} green circles`);

    // Step 4: Find polygons
    const t3 = Date.now();
    let { polygons, usedIds } = await findPolygons();
    console.log(`PERF: Find Polygons took ${((Date.now() - t3) / 1000).toFixed(4)}s`);

    if (!polygons.length) {
      console.warn(`ATTEMPT ${attempt + 1}/3: No polygons created from roads`);
      if (attempt < REGION_SIZES.length - 1) {
        console.log('Retrying with larger region...');
        continue;
      }
      return { error: 'NO_POLYGONS', message: `No polygons created at (${lat}, ${lon})` };
    }

    console.log(`ATTEMPT ${attempt + 1}/3: Created ${polygons.length} polygons - SUCCESS!`);

    // Filter orphaned elements
    const filtered = filterOrphanedElements(whiteLines, greenCircles, usedIds);
    whiteLines = filtered.whiteLines;
    greenCircles = filtered.greenCircles;

    // Calculate polygon points
    calculatePolygonPoints(polygons, whiteLines, blueCircles);

    // Step 5: Create groups
    const groups = await createGroups();

    // Calculate all connections
    let filteredBlueCircles = calculateConnections(whiteLines, greenCircles, blueCircles, polygons);

    // Create poster grid
    const posterGrid = await createPosterGrid(polygons, lat, lon);

    // Apply mode filtering
    const modeFiltered = applyModeFiltering(
      mode, polygons, whiteLines, greenCircles, filteredBlueCircles, lat, lon, restoredPolygonIds
    );

    polygons = modeFiltered.polygons;
    whiteLines = modeFiltered.whiteLines;
    greenCircles = modeFiltered.greenCircles;
    filteredBlueCircles = modeFiltered.blueCircles;

    console.log('========================================');
    console.log(`SUCCESS on attempt ${attempt + 1}: ${polygons.length} polygons, ${filteredBlueCircles.length} circles, ${whiteLines.length} lines`);
    console.log('========================================');

    const resultData = {
      red_lines: [],
      blue_circles: filteredBlueCircles,
      white_lines: whiteLines,
      green_circles: greenCircles,
      polygons,
      groups,
      poster_grid: posterGrid
    };

    // Save to cache
    if (mode === 'initial') {
      await saveToRedis(cacheKey, resultData, config.cache.mapData);
      console.log(`CACHE SAVED: Stored map data in ${cacheKey}`);
    }

    console.log(`PERF: Total generation took ${((Date.now() - tStart) / 1000).toFixed(4)}s`);

    return resultData;
  }

  return { error: 'UNKNOWN', message: 'Generation failed unexpectedly' };
}

module.exports = {
  generateMap
};
