/**
 * GameInitializer - Handles game initialization and state restoration
 */
import { loadGlobalState } from '../api/StateLoader.js';
import { renderFromSavedState } from '../api/StateRestorer.js';

/**
 * Creates a game initializer with all dependencies
 * @param {Object} deps - Dependencies
 * @returns {Function} initializeGame function
 */
export function createGameInitializer(deps) {
    const {
        gameState,
        visiblePolygonIds,
        userMarker,
        map,
        renderGameElements,
        updateAndSaveUserPosition,
        posterRenderer,
        loadGameData,
        revealMap,
        loadingGif,
        mapElement,
        DEFAULT_LAT,
        DEFAULT_LON
    } = deps;

    /**
     * Initialize game - check Redis for saved state, otherwise generate fresh
     */
    return async function initializeGame() {
        console.log(`DEBUG: === INITIALIZING GAME ===`);

        try {
            // STEP 1: Check for saved global state in Redis
            const savedState = await loadGlobalState();

            if (savedState) {
                console.log(`DEBUG: ✅ Found saved global state - restoring without regeneration`);

                // Show loading indicator
                loadingGif.style.display = 'block';
                loadingGif.style.opacity = '1';
                mapElement.style.opacity = '0.3';
                gameState.hasRevealed = false;

                // Render from saved state
                await renderFromSavedState(savedState, {
                    gameState,
                    visiblePolygonIds,
                    userMarker,
                    map,
                    renderGameElements,
                    updateAndSaveUserPosition,
                    setPosterGrid: (grid) => {
                        if (posterRenderer) {
                            posterRenderer.setPosterGrid(grid);
                        }
                    }
                });

                // Reveal map
                revealMap();

                console.log(`DEBUG: ✅ Game restored from Redis - ${savedState.polygons.length} polygons`);
                return;
            }

            // STEP 2: No saved state - generate fresh
            console.log(`DEBUG: No saved state found - generating fresh map`);

            let initialLat = DEFAULT_LAT;
            let initialLon = DEFAULT_LON;

            console.log(`DEBUG: Starting at default location: ${initialLat}, ${initialLon}`);

            // Generate new game data
            await loadGameData(initialLat, initialLon);

        } catch (e) {
            console.error(`DEBUG: Error during game initialization:`, e);
            // Fallback: try to generate fresh
            await loadGameData(DEFAULT_LAT, DEFAULT_LON);
        }
    };
}
