/**
 * GameState.js
 * 
 * Centralized game state management.
 * All global state variables are stored here for shared access across modules.
 * 
 * Extracted from map-logic.js (lines 53-68)
 */

/**
 * Central game state object
 * This is exported as a mutable object so modules can directly read/write state
 */
export const gameState = {
    // Location State Persistence
    collectedCircles: new Set(),        // Tracks hidden circle keys: "lat,lon"
    currentLocationKey: null,           // Current location rounded key: "lat_lon"
    gameDataCache: new Map(),           // Caches game data per location key
    currentUserPosition: null,          // Current user position {lat, lon}
    expandedCircles: new Set(),         // Track circles that have triggered expansion
    isRestoringState: false,            // Flag to prevent saving during restoration
    restoredBlueCircles: [],            // Restored blue circles from saved state

    // PROMO GIF Global Cache
    promoGifCache: [],                  // Loaded once on startup
    promoGifAssignments: new Map(),     // PolyID -> GifFilename (Synced with Server)

    // Global Game State (for Redis persistence)
    currentCircleUid: null,             // UID of circle where player marker is currently positioned
    cachedGameData: null,               // Complete game data for saving to Redis (accumulated)

    // UI State
    isGpsActive: false,
    hasPreciseFix: false,
    isDebugActive: false,
    isPostersDebugActive: false,
    hasRevealed: false
};

/**
 * Reset game state to initial values
 * Useful for testing or starting a new game
 */
export function resetGameState() {
    gameState.collectedCircles.clear();
    gameState.currentLocationKey = null;
    gameState.gameDataCache.clear();
    gameState.currentUserPosition = null;
    gameState.expandedCircles.clear();
    gameState.isRestoringState = false;
    gameState.restoredBlueCircles = [];
    gameState.promoGifCache = [];
    gameState.promoGifAssignments.clear();
    gameState.currentCircleUid = null;
    gameState.cachedGameData = null;
    gameState.isGpsActive = false;
    gameState.hasPreciseFix = false;
    gameState.isDebugActive = false;
    gameState.isPostersDebugActive = false;
    gameState.hasRevealed = false;
}

/**
 * Get current user position
 * @returns {{lat: number, lon: number}|null}
 */
export function getCurrentPosition() {
    return gameState.currentUserPosition;
}

/**
 * Set current user position
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
export function setCurrentPosition(lat, lon) {
    gameState.currentUserPosition = { lat, lon };
}

/**
 * Check if a circle has been collected
 * @param {string} circleKey - Circle key in format "lat,lon"
 * @returns {boolean}
 */
export function isCircleCollected(circleKey) {
    return gameState.collectedCircles.has(circleKey);
}

/**
 * Mark a circle as collected
 * @param {string} circleKey - Circle key in format "lat,lon"
 */
export function collectCircle(circleKey) {
    gameState.collectedCircles.add(circleKey);
}

/**
 * Check if a circle has triggered expansion
 * @param {string} circleUid - Circle UID
 * @returns {boolean}
 */
export function isCircleExpanded(circleUid) {
    return gameState.expandedCircles.has(circleUid);
}

/**
 * Mark a circle as having triggered expansion
 * @param {string} circleUid - Circle UID
 */
export function markCircleExpanded(circleUid) {
    gameState.expandedCircles.add(circleUid);
}
