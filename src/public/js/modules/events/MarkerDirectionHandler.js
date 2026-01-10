/**
 * Marker Direction Handler
 * Handles marker GIF flipping based on movement direction
 */

/**
 * Setup marker direction change handler
 * @param {Object} options - Configuration
 * @param {L.Marker} options.userMarker - User marker instance
 * @param {Object} options.gameState - Game state object
 * @param {Function} options.updateAndSaveUserPosition - Position update function
 * @param {L.Map} options.map - Leaflet map instance
 * @param {Function} options.debouncedSavePosition - Debounced save function
 */
export function setupMarkerDirectionHandler({ userMarker, gameState, updateAndSaveUserPosition, map, debouncedSavePosition }) {
    let lastFacingDirection = 'left';

    document.addEventListener('map-move-request', (e) => {
        const { lat, lon, direction } = e.detail;

        // Flip marker GIF based on direction
        if (direction) {
            const isLeft = direction.includes('LEFT');
            const isRight = direction.includes('RIGHT');
            const markerGif = document.getElementById('marker-gif');

            if (isRight && lastFacingDirection !== 'right' && markerGif) {
                markerGif.style.transform = 'translateY(-25%) scaleX(-1)';
                lastFacingDirection = 'right';
            } else if (isLeft && lastFacingDirection !== 'left' && markerGif) {
                markerGif.style.transform = 'translateY(-25%)';
                lastFacingDirection = 'left';
            }
        }

        // Move marker and update state
        userMarker.setLatLng([lat, lon]);
        gameState.currentUserPosition = { lat, lon };
        updateAndSaveUserPosition(userMarker, lat, lon);
        map.panTo([lat, lon]);
        debouncedSavePosition();
    });
}
