/**
 * Map Generator - Main orchestrator
 * Coordinates all steps of map generation
 */

// Import orchestrator modules
const { checkCache, saveCache } = require('./cacheManager');
const { processRegion } = require('./regionProcessor');

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

  // 1. Check Cache
  const cachedData = await checkCache(lat, lon, forceRebuild, mode);
  if (cachedData) {
    return cachedData;
  }

  const tStart = Date.now();

  // 2. Generation Loop (Retry Strategy)
  for (let attempt = 0; attempt < REGION_SIZES.length; attempt++) {
    const size = REGION_SIZES[attempt];

    const result = await processRegion(
      lat,
      lon,
      size,
      attempt,
      REGION_SIZES.length,
      mode,
      restoredPolygonIds
    );

    if (result.success) {
      // 3. Save to Cache
      await saveCache(lat, lon, mode, result.data);

      console.log(`PERF: Total generation took ${((Date.now() - tStart) / 1000).toFixed(4)}s`);
      return result.data;
    }

    if (result.shouldRetry) {
      console.log('Retrying with larger region...');
      continue;
    }

    // Return the error from the last failed attempt
    return { error: result.error.code, message: result.error.message };
  }

  return { error: 'UNKNOWN', message: 'Generation failed unexpectedly' };
}

module.exports = {
  generateMap
};
