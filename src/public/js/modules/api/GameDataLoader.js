/**
 * GameDataLoader - Handles loading and caching of game data from server
 */
import { getLocationKey } from '../utils/CoordinateUtils.js';
import { showError } from '../ui/ErrorDisplay.js';

/**
 * Creates a game data loader with all necessary dependencies
 * @param {Object} deps - Dependencies object
 * @returns {Function} loadGameData function
 */
export function createGameDataLoader(deps) {
    const {
        gameState,
        stateSaver,
        posterRenderer,
        visiblePolygonIds,
        renderGameElements,
        revealMap,
        loadingGif,
        mapElement
    } = deps;

    /**
     * Load game data from server
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {boolean} forceRebuild - Force regeneration
     * @param {string} mode - 'initial' or 'expand'
     */
    return async function loadGameData(lat, lon, forceRebuild = false, mode = 'initial') {
        console.log("GPS: ========================================");
        console.log(`GPS: Starting polygon generation for (${lat.toFixed(6)}, ${lon.toFixed(6)}) [Mode: ${mode}]`);
        console.log(`GPS: Force rebuild: ${forceRebuild}`);
        console.log("GPS: ========================================");

        const newLocationKey = getLocationKey(lat, lon);
        console.log(`DEBUG: Location key: current=${gameState.currentLocationKey}, new=${newLocationKey}, mode=${mode}`);

        // 1. Restore State (Initial Mode Only)
        await restoreState(newLocationKey, mode, gameState, visiblePolygonIds);

        // 2. Handle Location Switching
        await handleLocationSwitch(newLocationKey, mode, gameState, stateSaver, visiblePolygonIds, posterRenderer);

        // 3. Update loading UI
        updateLoadingUI(mode, loadingGif, mapElement, gameState);

        // 4. Check Cache
        if (mode !== 'expand' && !forceRebuild && gameState.gameDataCache.has(newLocationKey)) {
            console.log(`GPS: Using CACHED data for location ${newLocationKey}`);
            const cachedData = gameState.gameDataCache.get(newLocationKey);
            await renderGameElements(cachedData, mode);
            revealMap();
            return;
        }

        // 5. Fetch Data
        const data = await fetchGameData(lat, lon, forceRebuild, mode, visiblePolygonIds);

        if (!data) return; // Error handled in fetch

        // 6. Process & Cache Data
        processGameData(data, mode, newLocationKey, gameState);

        // 7. Render & Save
        await renderGameElements(data, mode);
        revealMap();

        await stateSaver.saveGlobalState({
            gameState,
            visiblePolygonIds,
            currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
        });
    };
}

// --- Helper Functions ---

async function restoreState(newLocationKey, mode, gameState, visiblePolygonIds) {
    if (mode !== 'expand') {
        gameState.isRestoringState = true;
        console.log(`DEBUG: 🔒 Setting gameState.isRestoringState = true`);

        try {
            console.log(`DEBUG: Attempting to restore state from Redis for location: ${newLocationKey}`);
            const serverState = await window.gameAPI.loadLocationState(newLocationKey);

            if (serverState && serverState.visible_polygon_ids && serverState.visible_polygon_ids.length > 0) {
                console.log(`DEBUG: ✓ Found saved state in Redis: ${serverState.visible_polygon_ids.length} polygons`);

                visiblePolygonIds.clear();
                serverState.visible_polygon_ids.forEach(id => visiblePolygonIds.add(id));

                if (serverState.expanded_circles) {
                    gameState.expandedCircles.clear();
                    serverState.expanded_circles.forEach(coord => gameState.expandedCircles.add(coord));
                }

                if (serverState.collected_circles) {
                    gameState.collectedCircles.clear();
                    serverState.collected_circles.forEach(coord => gameState.collectedCircles.add(coord));
                }

                gameState.restoredBlueCircles = serverState.blue_circles || [];

                if (serverState.user_position && serverState.user_position.lat !== undefined) {
                    gameState.currentUserPosition = serverState.user_position;
                }
            } else {
                console.log(`DEBUG: No saved state found in Redis`);
                gameState.restoredBlueCircles = [];
            }
        } catch (e) {
            console.warn("DEBUG: Failed to load state from Redis:", e);
            gameState.restoredBlueCircles = [];
        }
    } else {
        gameState.restoredBlueCircles = [];
    }
}

async function handleLocationSwitch(newLocationKey, mode, gameState, stateSaver, visiblePolygonIds, posterRenderer) {
    if (mode !== 'expand') {
        const isSameLocation = (gameState.currentLocationKey === newLocationKey);

        if (!isSameLocation) {
            if (gameState.currentLocationKey && gameState.collectedCircles.size > 0) {
                console.log(`DEBUG: Saving state for ${gameState.currentLocationKey} before switching...`);
                await stateSaver.saveGlobalState({
                    gameState,
                    visiblePolygonIds,
                    currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
                });
            }

            console.log(`DEBUG: Switching location: ${gameState.currentLocationKey} -> ${newLocationKey}`);
            gameState.currentLocationKey = newLocationKey;
        } else {
            console.log(`DEBUG: Same location - keeping collected circles`);
        }
    } else {
        console.log(`DEBUG: Expansion mode - Keeping location key ${gameState.currentLocationKey}`);

        // Save before expansion (safety checkpoint)
        if (gameState.currentLocationKey && gameState.collectedCircles.size > 0) {
            await stateSaver.saveGlobalState({
                gameState,
                visiblePolygonIds,
                currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
            });
        }
    }
}

function updateLoadingUI(mode, loadingGif, mapElement, gameState) {
    if (mode !== 'expand') {
        loadingGif.style.display = 'block';
        loadingGif.style.opacity = '1';
        mapElement.style.opacity = '0.3';
        gameState.hasRevealed = false;
    }
}

async function fetchGameData(lat, lon, forceRebuild, mode, visiblePolygonIds) {
    let url = `/api/game_data?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&rebuild=${forceRebuild}&mode=${mode}&_t=${Date.now()}`;

    if (mode !== 'expand' && visiblePolygonIds.size > 0) {
        const polyIds = Array.from(visiblePolygonIds).join(',');
        url += `&restored_polygon_ids=${encodeURIComponent(polyIds)}`;
    }

    console.log(`GPS: Fetching from ${url}`);

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            console.error(`GPS: SERVER ERROR: ${data.error}`);
            showError(`POLYGON GENERATION FAILED<br><br>${data.message}`);
            return null;
        }

        if (!data.polygons || data.polygons.length === 0) {
            console.error("GPS: No polygons in response");
            showError("CRITICAL ERROR<br><br>No polygons found");
            return null;
        }

        console.log(`GPS: SUCCESS! ${data.polygons.length} polygons received`);
        return data;

    } catch (err) {
        console.error("GPS: NETWORK ERROR:", err);
        showError("CONNECTION ERROR<br><br>Server failed to respond");
        return null;
    }
}

function processGameData(data, mode, newLocationKey, gameState) {
    gameState.gameDataCache.set(newLocationKey, data);

    if (mode === 'expand' && gameState.cachedGameData) {
        gameState.cachedGameData.polygons = [...(gameState.cachedGameData.polygons || []), ...(data.polygons || [])];
        gameState.cachedGameData.white_lines = [...(gameState.cachedGameData.white_lines || []), ...(data.white_lines || [])];
        gameState.cachedGameData.green_circles = [...(gameState.cachedGameData.green_circles || []), ...(data.green_circles || [])];
        gameState.cachedGameData.blue_circles = [...(gameState.cachedGameData.blue_circles || []), ...(data.blue_circles || [])];
    } else {
        gameState.cachedGameData = {
            polygons: data.polygons || [],
            white_lines: data.white_lines || [],
            green_circles: data.green_circles || [],
            blue_circles: data.blue_circles || [],
            poster_grid: data.poster_grid || [],
            groups: data.groups || []
        };
    }
}
