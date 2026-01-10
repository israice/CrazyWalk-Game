/**
 * Promo Assigner
 * Assigns promo GIFs to polygons
 */

const fs = require('fs');
const { PATHS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');

/**
 * Assign promo GIFs to polygons
 * @param {Array} polygonsData - Polygons array
 * @returns {Promise<void>}
 */
async function assignPromoGifs(polygonsData) {
    let promoGifs = [];
    if (fs.existsSync(PATHS.PROMOS_DIR)) {
        promoGifs = fs.readdirSync(PATHS.PROMOS_DIR).filter(f => f.toLowerCase().endsWith('.gif'));
    }

    if (promoGifs.length === 0) return;

    for (const poly of polygonsData) {
        const redisKey = `game:promo_assignment:${poly.id}`;
        let assignedGif = await loadFromRedis(redisKey);

        if (!assignedGif) {
            assignedGif = promoGifs[Math.floor(Math.random() * promoGifs.length)];
            await saveToRedis(redisKey, assignedGif, null);
        }

        poly.promo_gif = assignedGif;
    }
}

module.exports = { assignPromoGifs };
