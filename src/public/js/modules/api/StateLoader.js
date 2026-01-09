/**
 * StateLoader.js
 * 
 * Handles loading game state from Redis.
 * Extracted from map-logic.js for better code organization.
 */

/**
 * Load complete game state from Redis
 * @returns {Promise<Object|null>} Game state object or null if not found
 */
export async function loadGlobalState() {
    return await window.gameAPI.loadGameState();
}

/**
 * Load location-specific state from Redis
 * @param {string} locationKey - Location key (e.g., "32.0569_34.7688")
 * @returns {Promise<Object|null>} Location state or null if not found
 */
export async function loadLocationState(locationKey) {
    return await window.gameAPI.loadLocationState(locationKey);
}
