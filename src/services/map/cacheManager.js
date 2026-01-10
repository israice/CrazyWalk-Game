/**
 * Map Cache Manager
 * Handles Redis caching operations for map data
 */

const config = require('../../config');
const { saveToRedis, loadFromRedis } = require('../redis.service');

/**
 * Generate cache key from coordinates
 * @param {number} lat 
 * @param {number} lon 
 * @returns {string}
 */
const getCacheKey = (lat, lon) => {
    const cacheLat = Math.round(lat * 1000) / 1000;
    const cacheLon = Math.round(lon * 1000) / 1000;
    return `map_cache:${cacheLat}_${cacheLon}`;
};

/**
 * Try to get map data from cache
 * @param {number} lat 
 * @param {number} lon 
 * @param {boolean} forceRebuild 
 * @param {string} mode 
 * @returns {Promise<Object|null>} Cached data or null
 */
async function checkCache(lat, lon, forceRebuild, mode) {
    const cacheKey = getCacheKey(lat, lon);

    if (mode === 'initial' && !forceRebuild) {
        const cachedData = await loadFromRedis(cacheKey);
        if (cachedData) {
            console.log(`CACHE HIT: Returning cached map data for ${cacheKey}`);
            return cachedData;
        }
        console.log(`CACHE MISS: No cached data for ${cacheKey}, generating...`);
    }

    return null;
}

/**
 * Save map data to cache
 * @param {number} lat 
 * @param {number} lon 
 * @param {string} mode 
 * @param {Object} data 
 */
async function saveCache(lat, lon, mode, data) {
    if (mode === 'initial') {
        const cacheKey = getCacheKey(lat, lon);
        await saveToRedis(cacheKey, data, config.cache.mapData);
        console.log(`CACHE SAVED: Stored map data in ${cacheKey}`);
    }
}

module.exports = {
    checkCache,
    saveCache
};
