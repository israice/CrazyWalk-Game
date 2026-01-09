/**
 * Location Controller
 * Handles geolocation and location state endpoints
 */

const axios = require('axios');
const config = require('../config');
const { REDIS_KEYS } = require('../config/constants');
const { getRedisClient, saveToRedis, loadFromRedis } = require('../services/redis.service');
const { getCityFromCoords, getCityCenter, reverseGeocode, searchPlace } = require('../services/nominatim.service');

/**
 * Get location from IP address
 * @param {Request} req
 * @param {Response} res
 */
async function getIpLocation(req, res) {
  // Get client IP
  let clientIp = req.ip || req.connection.remoteAddress;

  // For localhost, get external IP
  let apiUrl = `${config.apis.ipApi.baseUrl}/?fields=status,message,city,lat,lon`;
  if (clientIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp)) {
    clientIp = clientIp.replace('::ffff:', '');
    apiUrl = `${config.apis.ipApi.baseUrl}/${clientIp}?fields=status,message,city,lat,lon`;
  }

  const response = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'CrazyWalk/1.0' },
    timeout: config.apis.ipApi.timeout
  });

  const data = response.data;

  if (data.status === 'success') {
    console.log(`IP Geolocation Success: City='${data.city}', lat=${data.lat}, lon=${data.lon}`);
    return res.json({
      city: (data.city || 'Unknown City').toUpperCase(),
      lat: data.lat || 0,
      lon: data.lon || 0
    });
  }

  // Retry without IP
  console.warn(`IP Geolocation 1st attempt failed: ${data.message}. Retrying...`);
  const retryResponse = await axios.get(`${config.apis.ipApi.baseUrl}/?fields=status,message,city,lat,lon`, {
    headers: { 'User-Agent': 'CrazyWalk/1.0' },
    timeout: config.apis.ipApi.timeout
  });

  const retryData = retryResponse.data;
  if (retryData.status === 'success') {
    console.log(`IP Geolocation Retry Success: City='${retryData.city}'`);
    return res.json({
      city: (retryData.city || 'Unknown City').toUpperCase(),
      lat: retryData.lat || 0,
      lon: retryData.lon || 0
    });
  }

  res.json({ city: 'UNKNOWN CITY', lat: 0, lon: 0 });
}

/**
 * Locate by coordinates (reverse geocode + find city center)
 * @param {Request} req
 * @param {Response} res
 */
async function locate(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon parameters' });
  }

  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);

  let city = await getCityFromCoords(userLat, userLon);
  let targetLat = userLat;
  let targetLon = userLon;

  // Search for city center
  if (city !== 'Unknown City') {
    const center = await getCityCenter(city);
    if (center) {
      targetLat = center.lat;
      targetLon = center.lon;
    }
  }

  res.json({
    city: city.toUpperCase(),
    lat: targetLat,
    lon: targetLon,
    user_lat: userLat,
    user_lon: userLon
  });
}

/**
 * Proxy reverse geocoding request
 * @param {Request} req
 * @param {Response} res
 */
async function reverseProxy(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat/lon' });
  }

  const data = await reverseGeocode(parseFloat(lat), parseFloat(lon));
  res.json(data);
}

/**
 * Proxy search request
 * @param {Request} req
 * @param {Response} res
 */
async function searchProxy(req, res) {
  const { q, limit = '1' } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Missing query' });
  }

  const data = await searchPlace(q, parseInt(limit, 10));
  res.json(data);
}

/**
 * Get location state from Redis
 * @param {Request} req
 * @param {Response} res
 */
async function getLocationState(req, res) {
  const { location_key } = req.query;

  if (!location_key) {
    return res.status(400).json({ error: 'Missing location_key parameter' });
  }

  const redisKey = `location:${location_key}:state`;
  const data = await loadFromRedis(redisKey);

  if (data) {
    console.log(`Retrieved state for location ${location_key}: ${(data.collected_circles || []).length} circles, ${(data.visible_polygon_ids || []).length} polygons`);
    return res.json({
      location_key,
      collected_circles: data.collected_circles || [],
      visible_polygon_ids: data.visible_polygon_ids || [],
      expanded_circles: data.expanded_circles || [],
      blue_circles: data.blue_circles || [],
      user_position: data.user_position || null,
      promo_gif_map: data.promo_gif_map || {}
    });
  }

  console.log(`No state found for location ${location_key}`);
  res.json({
    location_key,
    collected_circles: [],
    visible_polygon_ids: [],
    expanded_circles: [],
    blue_circles: [],
    user_position: null,
    promo_gif_map: {}
  });
}

/**
 * Save location state to Redis
 * @param {Request} req
 * @param {Response} res
 */
async function saveLocationState(req, res) {
  const {
    location_key,
    collected_circles = [],
    visible_polygon_ids = [],
    expanded_circles = [],
    blue_circles = [],
    user_position = null,
    promo_gif_map = {}
  } = req.body;

  if (!location_key) {
    return res.status(400).json({ error: 'Missing location_key' });
  }

  const redisKey = `location:${location_key}:state`;
  const redis = getRedisClient();

  const completeState = {
    collected_circles,
    visible_polygon_ids,
    expanded_circles,
    blue_circles,
    user_position,
    promo_gif_map
  };

  const hasData = collected_circles.length ||
    visible_polygon_ids.length ||
    expanded_circles.length ||
    blue_circles.length ||
    Object.keys(promo_gif_map).length;

  if (hasData) {
    await redis.set(redisKey, JSON.stringify(completeState));
    await redis.expire(redisKey, config.cache.locationState);
    console.log(`Saved state for location ${location_key}: ${collected_circles.length} circles, ${visible_polygon_ids.length} polygons, ${expanded_circles.length} expanded, ${blue_circles.length} blue circles`);
  } else {
    await redis.del(redisKey);
    console.log(`Cleared state for location ${location_key}`);
  }

  res.json({
    status: 'ok',
    saved_circles: collected_circles.length,
    saved_polygons: visible_polygon_ids.length,
    saved_expanded: expanded_circles.length
  });
}

module.exports = {
  getIpLocation,
  locate,
  reverseProxy,
  searchProxy,
  getLocationState,
  saveLocationState
};
