/**
 * MovementHandlers.js
 * 
 * Handles user movement events from keyboard controls.
 * Extracted from map-logic.js for better code organization.
 */

/**
 * Setup movement event handlers
 * @param {Object} params - Handler parameters
 * @param {L.Marker} params.userMarker - User marker instance
 * @param {Object} params.gameState - Game state object
 * @param {Function} params.debouncedSave - Debounced save function
 */
export function setupMovementHandlers({ userMarker, gameState, debouncedSave }) {
    // Handle keyboard movement requests from map_controls.js
    document.addEventListener('map-move-request', (e) => {
        const { lat, lon, direction } = e.detail;
        console.log(`DEBUG: Keyboard move request to ${lat}, ${lon} (direction: ${direction})`);

        // Move marker to new position
        userMarker.setLatLng([lat, lon]);

        // Update current position
        gameState.currentUserPosition = { lat, lon };

        // Update circle UID if we moved to a blue circle
        const coordKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        if (window.allItems) {
            // Try to find blue circle at this position
            for (const [uid, item] of window.allItems.entries()) {
                if (item.lat !== undefined && item.lon !== undefined) {
                    const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                    if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                        gameState.currentCircleUid = uid;
                        console.log(`DEBUG: Moved to blue circle ${uid}`);
                        break;
                    }
                }
            }
        }

        // Trigger debounced save
        debouncedSave();
    });

    console.log('DEBUG: Movement handlers initialized');
}
