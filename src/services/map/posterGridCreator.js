/**
 * Poster Grid Creator Module
 * Creates and manages the poster grid overlay for the map
 */

const path = require('path');
const fs = require('fs');
const { PATHS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');
const { generateUid } = require('../../utils/geometry');

/**
 * Create poster grid overlay
 * @param {Array} polygons - Polygons array
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @returns {Promise<Array|null>} Poster grid or null
 */
async function createPosterGrid(polygons, lat, lon) {
    if (polygons.length === 0) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const poly of polygons) {
        for (const coord of poly.coords || []) {
            minLat = Math.min(minLat, coord[0]);
            maxLat = Math.max(maxLat, coord[0]);
            minLon = Math.min(minLon, coord[1]);
            maxLon = Math.max(maxLon, coord[1]);
        }
    }

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const POSTER_LAT_SIZE = 0.003;
    const POSTER_LON_SIZE = 0.004;

    const startLat = centerLat - (1.5 * POSTER_LAT_SIZE);
    const startLon = centerLon - (1.5 * POSTER_LON_SIZE);

    let availableImages = [];
    if (fs.existsSync(PATHS.POSTERS_DIR)) {
        availableImages = fs.readdirSync(PATHS.POSTERS_DIR).filter(f =>
            ['.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase())
        );
    }

    if (!availableImages.length) {
        availableImages = Array.from({ length: 9 }, (_, i) => `${i + 1}.jpg`);
    }

    // Check cache
    const posterCacheKey = `game:posters:${Math.round(lat * 1000000) / 1000000}_${Math.round(lon * 1000000) / 1000000}`;
    let selectedImages = await loadFromRedis(posterCacheKey);

    if (!selectedImages) {
        if (availableImages.length >= 9) {
            const shuffled = [...availableImages].sort(() => Math.random() - 0.5);
            selectedImages = shuffled.slice(0, 9);
        } else {
            selectedImages = Array.from({ length: 9 }, (_, i) => availableImages[i % availableImages.length]);
        }
        await saveToRedis(posterCacheKey, selectedImages, null);
    }

    const posterGrid = [];
    let imgIdx = 0;

    for (let row = 2; row >= 0; row--) {
        for (let col = 0; col < 3; col++) {
            const posterId = generateUid('POSTER');
            const posterPosition = row * 3 + col + 1;

            posterGrid.push({
                id: posterId,
                position: posterPosition,
                min_lat: startLat + row * POSTER_LAT_SIZE,
                max_lat: startLat + (row + 1) * POSTER_LAT_SIZE,
                min_lon: startLon + col * POSTER_LON_SIZE,
                max_lon: startLon + (col + 1) * POSTER_LON_SIZE,
                image_url: `/GAME_POSTERS/${selectedImages[imgIdx++]}`
            });
        }
    }

    // Assign posters to polygons
    for (const poly of polygons) {
        const polyCoords = poly.coords || [];
        if (!polyCoords.length) {
            poly.poster_ids = [];
            continue;
        }

        const polyMinLat = Math.min(...polyCoords.map(c => c[0]));
        const polyMaxLat = Math.max(...polyCoords.map(c => c[0]));
        const polyMinLon = Math.min(...polyCoords.map(c => c[1]));
        const polyMaxLon = Math.max(...polyCoords.map(c => c[1]));

        const intersecting = [];
        for (const poster of posterGrid) {
            const intersects = !(polyMaxLat < poster.min_lat ||
                polyMinLat > poster.max_lat ||
                polyMaxLon < poster.min_lon ||
                polyMinLon > poster.max_lon);
            if (intersects) intersecting.push(poster.id);
        }
        poly.poster_ids = intersecting;
    }

    return posterGrid;
}

module.exports = {
    createPosterGrid
};
