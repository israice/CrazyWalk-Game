/**
 * Game Controller
 * Handles game state and map generation endpoints
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');
const { REDIS_KEYS, PATHS } = require('../config/constants');
const { getRedisClient, loadFromRedis } = require('../services/redis.service');
const { generateMap } = require('../services/map');

/**
 * Get global game state
 * @param {Request} req
 * @param {Response} res
 */
async function getGameState(req, res) {
  const data = await loadFromRedis(REDIS_KEYS.GAME_STATE);

  if (data) {
    const polygonCount = (data.polygons || []).length;
    console.log(`Retrieved global game state: ${polygonCount} polygons`);
    return res.json(data);
  }

  console.log('No global game state found - signaling fresh start');
  res.json({ empty: true });
}

/**
 * Save global game state
 * @param {Request} req
 * @param {Response} res
 */
async function saveGameState(req, res) {
  const state = req.body;
  const polygons = state.polygons || [];

  if (!polygons.length) {
    console.warn('Attempted to save empty game state - ignoring');
    return res.json({ status: 'ignored', reason: 'no polygons' });
  }

  const t0 = Date.now();
  const redis = getRedisClient();
  await redis.set(REDIS_KEYS.GAME_STATE, JSON.stringify(state));
  await redis.expire(REDIS_KEYS.GAME_STATE, config.cache.gameState);
  const t1 = Date.now();

  console.log(`PERF: handle_save_game_state (Redis write) took ${((t1 - t0) / 1000).toFixed(4)}s`);
  console.log(`Saved global game state: ${polygons.length} polygons, ${(state.white_lines || []).length} lines, ${(state.collected_circles || []).length} collected`);

  res.json({
    status: 'ok',
    saved_polygons: polygons.length,
    saved_lines: (state.white_lines || []).length,
    saved_circles: (state.collected_circles || []).length
  });
}

/**
 * Get available promo GIFs
 * @param {Request} req
 * @param {Response} res
 */
function getPromos(req, res) {
  if (!fs.existsSync(PATHS.PROMOS_DIR)) {
    console.warn(`Promos directory not found: ${PATHS.PROMOS_DIR}`);
    return res.json([]);
  }

  const files = fs.readdirSync(PATHS.PROMOS_DIR);
  const fileList = files.filter(f => f.toLowerCase().endsWith('.gif'));

  console.log(`Retrieved ${fileList.length} promo GIFs`);
  res.json(fileList);
}

/**
 * Generate/retrieve game data (map elements)
 * @param {Request} req
 * @param {Response} res
 */
async function getGameData(req, res) {
  const lat = parseFloat(req.query.lat || '0');
  const lon = parseFloat(req.query.lon || '0');
  const rebuildParam = (req.query.rebuild || 'false').toLowerCase();
  const modeParam = req.query.mode || 'initial';
  const restoredPolygonIdsParam = req.query.restored_polygon_ids || null;

  // Parse restored polygon IDs if provided
  let restoredPolygonIds = null;
  if (restoredPolygonIdsParam) {
    restoredPolygonIds = restoredPolygonIdsParam.split(',').filter(pid => pid.trim());
    console.log(`Restoring ${restoredPolygonIds.length} previously visible polygons`);
  }

  const forceRebuild = rebuildParam === 'true';

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat/lon' });
  }

  const t0 = Date.now();
  const data = await generateMap(lat, lon, forceRebuild, modeParam, restoredPolygonIds);
  const t1 = Date.now();

  console.log(`PERF: handle_game_data total took ${((t1 - t0) / 1000).toFixed(4)}s`);

  res.json(data);
}

module.exports = {
  getGameState,
  saveGameState,
  getPromos,
  getGameData
};
