/**
 * GameAPI - Client-side API handler
 * Moves logic out of index.html
 */
class GameAPI {
    constructor() {
        this.baseUrl = '/api';
    }

    /**
     * Save complete game state
     * @param {Object} state - The game state object
     * @returns {Promise<Object>} Response from server
     */
    async saveGameState(state) {
        try {
            const response = await fetch(`${this.baseUrl}/game_state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
            return await response.json();
        } catch (err) {
            console.error('GameAPI: Failed to save game state:', err);
            throw err;
        }
    }

    /**
     * Load complete game state
     * @returns {Promise<Object|null>} Game state or null
     */
    async loadGameState() {
        try {
            console.log('GameAPI: Loading game state...');
            const response = await fetch(`${this.baseUrl}/game_state`);
            const state = await response.json();

            if (state && !state.empty && state.polygons && state.polygons.length > 0) {
                return state;
            }
            return null;
        } catch (err) {
            console.error('GameAPI: Failed to load game state:', err);
            return null;
        }
    }

    /**
     * Load state for a specific location (Legacy/Fallback)
     * @param {string} locationKey 
     */
    async loadLocationState(locationKey) {
        try {
            const response = await fetch(`${this.baseUrl}/location_state?location_key=${encodeURIComponent(locationKey)}`);
            return await response.json();
        } catch (err) {
            console.error('GameAPI: Failed to load location state:', err);
            return null;
        }
    }
}

// Export as global instance
window.gameAPI = new GameAPI();
