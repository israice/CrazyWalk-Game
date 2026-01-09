/**
 * CoordinateUtils.js
 * 
 * Utility functions for coordinate manipulation and location key generation.
 * Extracted from map-logic.js (lines 59-62)
 */

/**
 * Generate location key from coordinates (round to ~100m precision)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} Location key in format "lat_lon"
 */
export function getLocationKey(lat, lon) {
    return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

/**
 * Parse location key back to coordinates
 * @param {string} locationKey - Location key in format "lat_lon"
 * @returns {{lat: number, lon: number}} Coordinate object
 */
export function parseLocationKey(locationKey) {
    const [lat, lon] = locationKey.split('_').map(Number);
    return { lat, lon };
}

/**
 * Create coordinate key with higher precision (6 decimal places)
 * Used for circle and element tracking
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} Coordinate key in format "lat,lon"
 */
export function getCoordinateKey(lat, lon) {
    return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * Parse coordinate key back to coordinates
 * @param {string} coordKey - Coordinate key in format "lat,lon"
 * @returns {{lat: number, lon: number}} Coordinate object
 */
export function parseCoordinateKey(coordKey) {
    const [lat, lon] = coordKey.split(',').map(Number);
    return { lat, lon };
}
