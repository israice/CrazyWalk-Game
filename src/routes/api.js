/**
 * API Routes for CrazyWalk Game
 * Converted from Python server.py
 */

const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const {
    getRedisClient,
    saveToRedis,
    loadFromRedis,
    KEY_GAME_STATE
} = require('../services/redis');

const { generateMap } = require('../services/mapGenerator');

/**
 * GET /api/session
 * Returns server session information for detecting server restarts
 */
router.get('/session', (req, res) => {
    try {
        res.json({
            session_id: req.app.locals.SERVER_SESSION_ID,
            start_time: req.app.locals.SERVER_START_TIME
        });
        console.log(`Session info sent: ${req.app.locals.SERVER_SESSION_ID}`);
    } catch (err) {
        console.error(`Error handling session request: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ip_locate
 * Uses ip-api.com to get approximate location from client IP
 */
router.get('/ip_locate', async (req, res) => {
    try {
        // Get client IP
        let clientIp = req.ip || req.connection.remoteAddress;

        // For localhost, get external IP
        let apiUrl = 'http://ip-api.com/json/?fields=status,message,city,lat,lon';
        if (clientIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp)) {
            // Remove IPv6 prefix if present
            clientIp = clientIp.replace('::ffff:', '');
            apiUrl = `http://ip-api.com/json/${clientIp}?fields=status,message,city,lat,lon`;
        }

        const response = await axios.get(apiUrl, {
            headers: { 'User-Agent': 'CrazyWalk/1.0' },
            timeout: 5000
        });

        const data = response.data;

        if (data.status === 'success') {
            console.log(`IP Geolocation Success: City='${data.city}', lat=${data.lat}, lon=${data.lon}`);
            res.json({
                city: (data.city || 'Unknown City').toUpperCase(),
                lat: data.lat || 0,
                lon: data.lon || 0
            });
        } else {
            // Retry without IP
            console.warn(`IP Geolocation 1st attempt failed: ${data.message}. Retrying...`);
            const retryResponse = await axios.get('http://ip-api.com/json/?fields=status,message,city,lat,lon', {
                headers: { 'User-Agent': 'CrazyWalk/1.0' },
                timeout: 5000
            });

            const retryData = retryResponse.data;
            if (retryData.status === 'success') {
                console.log(`IP Geolocation Retry Success: City='${retryData.city}'`);
                res.json({
                    city: (retryData.city || 'Unknown City').toUpperCase(),
                    lat: retryData.lat || 0,
                    lon: retryData.lon || 0
                });
            } else {
                res.json({ city: 'UNKNOWN CITY', lat: 0, lon: 0 });
            }
        }
    } catch (err) {
        console.error(`IP Locate Error: ${err.message}`);
        res.json({ city: 'UNKNOWN CITY', lat: 0, lon: 0 });
    }
});

/**
 * GET /api/locate
 * Reverse geocodes lat/lon to find city
 */
router.get('/locate', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing lat or lon parameters' });
        }

        const userLat = parseFloat(lat);
        const userLon = parseFloat(lon);

        let city = 'Unknown City';
        let targetLat = userLat;
        let targetLon = userLon;

        const headers = { 'User-Agent': 'CrazyWalk/1.0' };

        // 1. Reverse Geocode to get City Name
        try {
            const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&accept-language=en`;
            const reverseResponse = await axios.get(reverseUrl, { headers, timeout: 3000 });

            if (reverseResponse.status === 200) {
                const address = reverseResponse.data.address || {};
                city = address.city || address.municipality || address.town ||
                    address.suburb || address.village || address.hamlet ||
                    address.county || address.state || 'Unknown City';
            }
        } catch (err) {
            console.warn(`Reverse geocoding failed: ${err.message}`);
        }

        // 2. Search for City Center (if city found)
        if (city !== 'Unknown City') {
            try {
                const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1&accept-language=en`;
                const searchResponse = await axios.get(searchUrl, { headers, timeout: 3000 });

                if (searchResponse.status === 200 && searchResponse.data.length > 0) {
                    targetLat = parseFloat(searchResponse.data[0].lat);
                    targetLon = parseFloat(searchResponse.data[0].lon);
                }
            } catch (err) {
                console.warn(`City search failed: ${err.message}`);
            }
        }

        res.json({
            city: city.toUpperCase(),
            lat: targetLat,
            lon: targetLon,
            user_lat: userLat,
            user_lon: userLon
        });
    } catch (err) {
        console.error(`Locate Fatal Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/reverse
 * Proxy to Nominatim reverse geocoding
 */
router.get('/reverse', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing lat/lon' });
        }

        const targetUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en`;
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'CrazyWalk/1.0' }
        });

        res.json(response.data);
    } catch (err) {
        console.error(`Proxy error: ${err.message}`);
        res.status(500).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * GET /api/search
 * Proxy to Nominatim search
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = '1' } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Missing query' });
        }

        const targetUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=en`;
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'CrazyWalk/1.0' }
        });

        res.json(response.data);
    } catch (err) {
        console.error(`Proxy error: ${err.message}`);
        res.status(500).json({ error: `Proxy error: ${err.message}` });
    }
});

/**
 * GET /api/game_state
 * Returns complete game state from Redis
 */
router.get('/game_state', async (req, res) => {
    try {
        const data = await loadFromRedis(KEY_GAME_STATE);

        if (data) {
            const polygonCount = (data.polygons || []).length;
            console.log(`Retrieved global game state: ${polygonCount} polygons`);
            res.json(data);
        } else {
            console.log('No global game state found - signaling fresh start');
            res.json({ empty: true });
        }
    } catch (err) {
        console.error(`Get Game State Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/game_state
 * Saves complete game state to Redis
 */
router.post('/game_state', async (req, res) => {
    try {
        const state = req.body;
        const polygons = state.polygons || [];

        if (!polygons.length) {
            console.warn('Attempted to save empty game state - ignoring');
            return res.json({ status: 'ignored', reason: 'no polygons' });
        }

        const t0 = Date.now();
        const redis = getRedisClient();
        await redis.set(KEY_GAME_STATE, JSON.stringify(state));
        await redis.expire(KEY_GAME_STATE, 60 * 60 * 24 * 7); // 7 days
        const t1 = Date.now();

        console.log(`PERF: handle_save_game_state (Redis write) took ${((t1 - t0) / 1000).toFixed(4)}s`);
        console.log(`Saved global game state: ${polygons.length} polygons, ${(state.white_lines || []).length} lines, ${(state.collected_circles || []).length} collected`);

        res.json({
            status: 'ok',
            saved_polygons: polygons.length,
            saved_lines: (state.white_lines || []).length,
            saved_circles: (state.collected_circles || []).length
        });
    } catch (err) {
        console.error(`Save Game State Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/location_state
 * Returns saved game state for a specific location
 */
router.get('/location_state', async (req, res) => {
    try {
        const { location_key } = req.query;

        if (!location_key) {
            return res.status(400).json({ error: 'Missing location_key parameter' });
        }

        const redisKey = `location:${location_key}:state`;
        const data = await loadFromRedis(redisKey);

        if (data) {
            console.log(`Retrieved state for location ${location_key}: ${(data.collected_circles || []).length} circles, ${(data.visible_polygon_ids || []).length} polygons`);
            res.json({
                location_key,
                collected_circles: data.collected_circles || [],
                visible_polygon_ids: data.visible_polygon_ids || [],
                expanded_circles: data.expanded_circles || [],
                blue_circles: data.blue_circles || [],
                user_position: data.user_position || null,
                promo_gif_map: data.promo_gif_map || {}
            });
        } else {
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
    } catch (err) {
        console.error(`Get Location State Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/location_state
 * Saves game state for a specific location
 */
router.post('/location_state', async (req, res) => {
    try {
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

        if (collected_circles.length || visible_polygon_ids.length || expanded_circles.length || blue_circles.length || Object.keys(promo_gif_map).length) {
            await redis.set(redisKey, JSON.stringify(completeState));
            await redis.expire(redisKey, 60 * 60 * 24 * 7); // 7 days
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
    } catch (err) {
        console.error(`Save Location State Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/promos
 * Returns list of available promo GIFs
 */
router.get('/promos', (req, res) => {
    try {
        const promosDir = path.join(__dirname, '../../CORE/DATA/GAME_PROMOS');

        if (!fs.existsSync(promosDir)) {
            console.warn(`Promos directory not found: ${promosDir}`);
            return res.json([]);
        }

        const files = fs.readdirSync(promosDir);
        const fileList = files.filter(f => f.toLowerCase().endsWith('.gif'));

        console.log(`Retrieved ${fileList.length} promo GIFs`);
        res.json(fileList);
    } catch (err) {
        console.error(`Get Promos Error: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/game_data
 * Generates/retrieves game elements (Lines, Polygons)
 */
router.get('/game_data', async (req, res) => {
    try {
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
    } catch (err) {
        console.error(`Game Data Error: ${err.message}`);
        console.error(err.stack);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
