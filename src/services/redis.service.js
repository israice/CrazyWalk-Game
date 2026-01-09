/**
 * Redis Service for CrazyWalk Game
 * Provides Redis client and utility functions
 */

const Redis = require('ioredis');
const config = require('../config');
const { REDIS_KEYS } = require('../config/constants');

// Singleton Redis client
let redisClient = null;

/**
 * Returns a configured Redis client instance
 * @returns {Redis} Redis client
 */
function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > config.redis.retryAttempts) return null;
        return Math.min(times * 200, 1000);
      }
    });

    redisClient.on('error', (err) => {
      console.error(`Redis error: ${err.message}`);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  }
  return redisClient;
}

/**
 * Flush the current database
 * @returns {Promise<void>}
 */
async function flushDatabase() {
  const client = getRedisClient();
  await client.flushdb();
}

/**
 * Saves data to Redis as a JSON string
 * @param {string} key - Redis key
 * @param {any} data - Data to save
 * @param {number|null} expiration - Seconds to expire (default 1 hour, null for no expiration)
 * @returns {Promise<boolean>} Success status
 */
async function saveToRedis(key, data, expiration = 3600) {
  try {
    const client = getRedisClient();
    await client.set(key, JSON.stringify(data));

    if (expiration) {
      await client.expire(key, expiration);
    }

    const count = Array.isArray(data) ? data.length : 'data';
    console.log(`REDIS: Saved ${count} items to ${key}`);
    return true;
  } catch (err) {
    console.error(`REDIS: Failed to save to ${key}: ${err.message}`);
    return false;
  }
}

/**
 * Loads data from Redis JSON string
 * @param {string} key - Redis key
 * @returns {Promise<any|null>} Parsed data or null if missing
 */
async function loadFromRedis(key) {
  try {
    const client = getRedisClient();
    const val = await client.get(key);
    if (val) {
      return JSON.parse(val);
    }
  } catch (err) {
    console.error(`REDIS: Failed to load from ${key}: ${err.message}`);
  }
  return null;
}

/**
 * Delete a key from Redis
 * @param {string} key - Redis key
 * @returns {Promise<boolean>} Success status
 */
async function deleteFromRedis(key) {
  try {
    const client = getRedisClient();
    await client.del(key);
    return true;
  } catch (err) {
    console.error(`REDIS: Failed to delete ${key}: ${err.message}`);
    return false;
  }
}

/**
 * Check if Redis is connected
 * @returns {Promise<boolean>}
 */
async function isConnected() {
  try {
    const client = getRedisClient();
    await client.ping();
    return true;
  } catch (err) {
    return false;
  }
}

// Re-export REDIS_KEYS for backward compatibility
module.exports = {
  getRedisClient,
  flushDatabase,
  saveToRedis,
  loadFromRedis,
  deleteFromRedis,
  isConnected,
  // Backward compatibility exports
  KEY_RED_LINES: REDIS_KEYS.RED_LINES,
  KEY_BLUE_CIRCLES: REDIS_KEYS.BLUE_CIRCLES,
  KEY_ADJACENCY: REDIS_KEYS.ADJACENCY,
  KEY_WHITE_LINES: REDIS_KEYS.WHITE_LINES,
  KEY_GREEN_CIRCLES: REDIS_KEYS.GREEN_CIRCLES,
  KEY_POLYGONS: REDIS_KEYS.POLYGONS,
  KEY_GROUPS: REDIS_KEYS.GROUPS,
  KEY_META: REDIS_KEYS.META,
  KEY_GAME_STATE: REDIS_KEYS.GAME_STATE
};
