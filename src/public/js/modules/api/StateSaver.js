/**
 * StateSaver.js
 * 
 * Handles saving game state to Redis with debouncing support.
 * Extracted from map-logic.js for better code organization.
 */

export class StateSaver {
    constructor(debounceMs = 2000) {
        this.debounceMs = debounceMs;
        this.saveDebounceTimer = null;
    }

    /**
     * Save complete game state to Redis
     * @param {Object} params - State parameters
     * @param {Object} params.gameState - Game state object
     * @param {Set} params.visiblePolygonIds - Set of visible polygon IDs
     * @param {Array} params.currentPosterGrid - Current poster grid
     * @returns {Promise<Object|null>} Save result or null if validation fails
     */
    async saveGlobalState({ gameState, visiblePolygonIds, currentPosterGrid }) {
        if (!gameState.cachedGameData || !gameState.cachedGameData.polygons || gameState.cachedGameData.polygons.length === 0) {
            console.log('GLOBAL_STATE: No data to save (empty gameState.cachedGameData)');
            return null;
        }

        // Build complete state
        const state = {
            // Geometry (accumulated from gameState.cachedGameData)
            polygons: gameState.cachedGameData.polygons || [],
            white_lines: gameState.cachedGameData.white_lines || [],
            green_circles: gameState.cachedGameData.green_circles || [],
            blue_circles: gameState.cachedGameData.blue_circles || [],
            poster_grid: gameState.cachedGameData.poster_grid || currentPosterGrid || [],
            groups: gameState.cachedGameData.groups || [],

            // Progress
            collected_circles: Array.from(gameState.collectedCircles),
            visible_polygon_ids: Array.from(visiblePolygonIds),
            expanded_circles: Array.from(gameState.expandedCircles),

            // Position
            user_position: gameState.currentUserPosition,
            current_circle_uid: gameState.currentCircleUid,

            // GIF assignments
            promo_gif_map: Object.fromEntries(gameState.promoGifAssignments)
        };

        const result = await window.gameAPI.saveGameState(state);
        if (result) {
            console.log(`GLOBAL_STATE: Saved - ${result.saved_polygons} polygons, ${result.saved_lines} lines, circle_uid=${gameState.currentCircleUid}`);
        }
        return result;
    }

    /**
     * Debounced save for position updates
     * @param {Function} saveCallback - Callback to execute after debounce
     */
    debouncedSave(saveCallback) {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }

        this.saveDebounceTimer = setTimeout(async () => {
            console.log('DEBUG: Executing debounced save...');
            await saveCallback();
            console.log('DEBUG: Debounced save completed');
        }, this.debounceMs);
    }


}
