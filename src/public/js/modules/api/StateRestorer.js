/**
 * StateRestorer.js
 * 
 * Handles restoration of game state from Redis and rendering.
 * Extracted from map-logic.js for better code organization.
 */

/**
 * Render game from saved state (without regeneration)
 * @param {Object} state - Saved game state
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.gameState - Game state object
 * @param {Set} dependencies.visiblePolygonIds - Set of visible polygon IDs
 * @param {L.Marker} dependencies.userMarker - User marker
 * @param {L.Map} dependencies.map - Leaflet map instance
 * @param {Function} dependencies.renderGameElements - Render function
 * @param {Function} dependencies.updateAndSaveUserPosition - Position update function
 * @param {Function} dependencies.setPosterGrid - Function to set poster grid
 * @returns {Promise<boolean>} True if restoration successful
 */
export async function renderFromSavedState(state, {
    gameState,
    visiblePolygonIds,
    userMarker,
    map,
    renderGameElements,
    updateAndSaveUserPosition,
    setPosterGrid
}) {
    console.log('GLOBAL_STATE: Rendering from saved state...');

    // Restore progress Sets
    gameState.collectedCircles.clear();
    (state.collected_circles || []).forEach(c => gameState.collectedCircles.add(c));

    visiblePolygonIds.clear();
    (state.visible_polygon_ids || []).forEach(id => visiblePolygonIds.add(id));

    gameState.expandedCircles.clear();
    (state.expanded_circles || []).forEach(c => gameState.expandedCircles.add(c));

    // Restore GIF assignments
    if (state.promo_gif_map) {
        gameState.promoGifAssignments = new Map(Object.entries(state.promo_gif_map));
    }

    // Restore user position
    if (state.user_position) {
        gameState.currentUserPosition = state.user_position;

        // FIX: Move marker IMMEDIATELY to saved position BEFORE rendering
        // This prevents any logic inside renderGameElements from seeing DEFAULT position
        console.log(`GLOBAL_STATE: Pre-positioning marker at saved position: ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
        userMarker.setLatLng([gameState.currentUserPosition.lat, gameState.currentUserPosition.lon]);
        map.setView([gameState.currentUserPosition.lat, gameState.currentUserPosition.lon], 18);
    }

    // Restore circle UID
    if (state.current_circle_uid) {
        gameState.currentCircleUid = state.current_circle_uid;
    }

    // Store poster grid
    if (state.poster_grid) {
        setPosterGrid(state.poster_grid);
    }

    // Cache the data for future saves
    gameState.cachedGameData = {
        polygons: state.polygons,
        white_lines: state.white_lines,
        green_circles: state.green_circles,
        blue_circles: state.blue_circles,
        poster_grid: state.poster_grid,
        groups: state.groups
    };

    // Build game data object for renderGameElements
    const gameData = {
        polygons: state.polygons,
        white_lines: state.white_lines,
        green_circles: state.green_circles,
        blue_circles: state.blue_circles,
        poster_grid: state.poster_grid,
        groups: state.groups,
        red_lines: []
    };

    console.log(`GLOBAL_STATE: Restoring ${gameData.polygons.length} polygons, ${gameState.collectedCircles.size} collected circles`);

    // Render everything - marker is already at correct position from above
    await renderGameElements(gameData, 'restore');

    // Refine position to exact circle center if UID is available
    if (gameState.currentCircleUid && window.allItems) {
        const circleData = window.allItems.get(gameState.currentCircleUid);
        if (circleData && circleData.lat !== undefined && circleData.lon !== undefined) {
            console.log(`GLOBAL_STATE: Refining marker to saved circle center ${gameState.currentCircleUid}`);
            updateAndSaveUserPosition(userMarker, circleData.lat, circleData.lon);
            map.setView([circleData.lat, circleData.lon], 18);
        } else {
            console.log(`GLOBAL_STATE: Circle ${gameState.currentCircleUid} not found in items, keeping position at ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
        }
    } else if (gameState.currentUserPosition) {
        console.log(`GLOBAL_STATE: No circle UID saved, marker remains at position ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
    }

    return true;
}
