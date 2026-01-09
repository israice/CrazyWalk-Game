/**
 * Redis utilities for CrazyWalk Game
 * Converted from Python redis_tools.py
 */

const Redis = require('ioredis');

// Singleton Redis client
let redisClient = null;

// Key Constants
const KEY_RED_LINES = 'game:red_lines';
const KEY_BLUE_CIRCLES = 'game:blue_circles';
const KEY_ADJACENCY = 'game:adjacency';
const KEY_WHITE_LINES = 'game:white_lines';
const KEY_GREEN_CIRCLES = 'game:green_circles';
const KEY_POLYGONS = 'game:polygons';
const KEY_GROUPS = 'game:groups';
const KEY_META = 'game:meta';
const KEY_GAME_STATE = 'game:session:state';

/**
 * Returns a configured Redis client instance.
 * Uses environment variables REDIS_HOST and REDIS_PORT.
 */
function getRedisClient() {
    if (!redisClient) {
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            db: 0,
            lazyConnect: true,
            retryStrategy(times) {
                if (times > 3) return null;
                return Math.min(times * 200, 1000);
            }
        });

        redisClient.on('error', (err) => {
            console.error(`Redis error: ${err.message}`);
        });
    }
    return redisClient;
}

/**
 * Flush the current database
 */
async function flushDatabase() {
    const client = getRedisClient();
    await client.flushdb();
}

/**
 * Saves data to Redis as a JSON string.
 * @param {string} key - Redis key
 * @param {any} data - Data to save
 * @param {number|null} expiration - Seconds to expire (default 1 hour, null for no expiration)
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
 * Loads data from Redis JSON string.
 * @param {string} key - Redis key
 * @returns {any|null} - Parsed data or null if missing
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

module.exports = {
    getRedisClient,
    flushDatabase,
    saveToRedis,
    loadFromRedis,
    KEY_RED_LINES,
    KEY_BLUE_CIRCLES,
    KEY_ADJACENCY,
    KEY_WHITE_LINES,
    KEY_GREEN_CIRCLES,
    KEY_POLYGONS,
    KEY_GROUPS,
    KEY_META,
    KEY_GAME_STATE
};
