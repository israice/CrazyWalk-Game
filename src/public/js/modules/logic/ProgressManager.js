/**
 * modules/logic/ProgressManager.js
 * 
 * Manages player progress tracking:
 * - Detecting when player reaches a circle (collision detection)
 * - Hiding collected circles ("Fog of War" reveal)
 * - Updating polygon completion progress
 * - Triggering map expansion when reaching blue circles
 */

import { gameState } from '../state/GameState.js';

/**
 * Finds the nearest active circle to the given coordinates.
 * Useful for initial snapping or fuzzy collision detection.
 * 
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @param {Map} circleLayerMap - Map of circle layers by key "lat,lon"
 * @returns {Object|null} Nearest circle object {lat, lon, dist, key} or null
 */
export function findNearestActiveCircle(userLat, userLon, circleLayerMap) {
    let nearest = null;
    let minDist = Infinity;
    const SNAP_DIST_DEG = 0.001; // ~100 meters

    circleLayerMap.forEach((layer, key) => {
        const [cLat, cLon] = key.split(',').map(Number);
        const dist = Math.sqrt(Math.pow(cLat - userLat, 2) + Math.pow(cLon - userLon, 2));

        if (dist < SNAP_DIST_DEG) {
            if (dist < minDist) {
                minDist = dist;
                nearest = { lat: cLat, lon: cLon, dist: dist, key: key };
            }
        }
    });

    if (nearest) {
        console.log(`DEBUG: Found Nearest Circle: ${nearest.lat},${nearest.lon} (Dist: ${nearest.dist})`);
    } else {
        console.log(`DEBUG: No circle found within ${SNAP_DIST_DEG} degrees.`);
    }

    return nearest;
}

/**
 * Sets up the progress hiding logic (collision detection loop).
 * 
 * @param {Object} params - Dependencies
 * @param {Map} params.layerMap - circleLayerMap (all circles)
 * @param {Map} params.circleMap - circleToPolyMap (mapping circle key -> polygon IDs)
 * @param {Map} params.polyState - polygonState (mapping polygon ID -> progress state)
 * @param {Map} params.lineMap - lineLayerMap (for visual updates)
 * @param {Map} params.blueMap - blueCircleLayerMap (for expansion)
 * @param {Object} params.userMarker - Leaflet marker for the user
 * @param {Object} params.stateSaver - Instance of StateSaver
 * @param {Object} params.posterRenderer - Instance of PosterRenderer
 * @param {Function} params.onExpand - Callback to trigger map expansion (loadGameData)
 * @param {Function} params.debouncedSavePosition - Function to save user position
 * @param {Function} params.updatePolygonVisuals - Function to update polygon visuals (labels etc)
 */
export function setupProgressHiding({
    layerMap,
    circleMap,
    polyState,
    lineMap,
    blueMap,
    userMarker,
    stateSaver,
    posterRenderer,
    onExpand,
    debouncedSavePosition,
    updatePolygonVisuals
}) {
    const checkAndHide = () => {
        const pos = userMarker.getLatLng();
        const exactKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;

        // console.log(`DEBUG: CheckAndHide checking pos: ${exactKey}`);

        let target = layerMap.get(exactKey);

        // Fallback: Fuzzy search if exact match misses (due to float drift or manual snap differences)
        if (!target) {
            // We use the exported function directly here if needed, or pass it?
            // Actually we can implementation simplified logic or reuse the one above.
            // But for efficiency, we might want to skip full scan every move.
            // Let's assume strict snap for now, OR reuse the findNearestActiveCircle if available.
            // Since we are in the module, we can call findNearestActiveCircle, but it's O(N).
            // Maybe only do it if we are VERY close to a known circle?

            // Optimization: The original code used window.findNearestActiveCircle.
            // We will call the local function.
            const nearest = findNearestActiveCircle(pos.lat, pos.lng, layerMap);

            // Strict threshold for "arrived" (e.g. < 10cm or just exact snap check with epsilon)
            if (nearest && nearest.dist < 0.000001) { // Extremely close
                const fuzzyKey = `${nearest.lat.toFixed(6)},${nearest.lon.toFixed(6)}`;
                console.log(`DEBUG: Exact match failed, but found fuzzy match: ${fuzzyKey} (dist: ${nearest.dist})`);
                target = layerMap.get(fuzzyKey);
            }
        }


        let targetKey = null;

        if (target) {
            // GLOBAL STATE TRACKING: Update current circle UID
            if (target.uid) {
                if (gameState.currentCircleUid !== target.uid) {
                    console.log(`GLOBAL_STATE: Player moved to circle ${target.uid}`);
                    gameState.currentCircleUid = target.uid;

                    // Save state immediately when reaching a new circle
                    if (!gameState.isRestoringState) {
                        stateSaver.saveGlobalState({
                            gameState,
                            visiblePolygonIds: window.visiblePolygonIds || [], // TODO: Pass this properly
                            currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
                        });
                    }
                }
            }

            // Re-calculate targetKey
            targetKey = exactKey;

            // Handle fuzzy match key recovery
            if (target !== layerMap.get(exactKey)) {
                // Try to recover key from target options or re-scan
                // Ideally target should store its key.
                // For now, let's re-scan or rely on the fact that if we found target, we found it via fuzzy.
                const nearest = findNearestActiveCircle(pos.lat, pos.lng, layerMap);
                if (nearest) targetKey = nearest.key;
            }

            const isCollected = gameState.collectedCircles.has(targetKey);
            if (!isCollected) {
                console.log(`DEBUG: COLLECTED CIRCLE at ${targetKey}`);

                // 1. Mark Collected
                gameState.collectedCircles.add(targetKey);

                // 2. Log (server save happens via periodic tasks)
                if (!gameState.isRestoringState) {
                    console.log(`DEBUG: Collected circle at ${targetKey}, will persist to Redis`);
                }

                // 4. Hide Visual (Unless Debug Posters Active)
                if (!gameState.isPostersDebugActive) {
                    target.setStyle({ opacity: 0, fillOpacity: 0 });
                } else {
                    target.setStyle({ color: '#555', opacity: 0.5 }); // Visual Feedback in Debug
                }

                // Safe Tooltip Check
                if (typeof target.getTooltip === 'function' && target.getTooltip()) {
                    target.unbindTooltip(); // Permanently remove label
                }

                // UPDATE PROGRESS
                // We need the key to look up relevantPolys
                const relevantPolys = circleMap.get(targetKey);
                if (relevantPolys) {
                    relevantPolys.forEach(pid => {
                        const state = polyState.get(pid);
                        if (state && state.current < state.total) {
                            state.current++;
                            updatePolygonVisuals(state, lineMap);
                        }
                    });
                }
            }
        }

        // MAP EXPANSION CHECK (Blue Circles)
        // This runs for ANY move (GPS or Manual)
        // We check if targetKey (exact or fuzzy) is a blue circle

        // Re-establish targetKey if not set (e.g. if we move off-grid but satisfy blue circle?) 
        // Actually expansion happens only when we are ON a circle.

        if (targetKey && blueMap && blueMap.has(targetKey)) {
            const targetCircle = layerMap.get(targetKey); // Should exist

            // Check if Saturated (Orange) - If so, NO EXPANSION
            if (targetCircle && targetCircle.isSaturated) {
                // console.log(`DEBUG: Reached Saturated Circle ${targetKey} -> No Expansion.`);
            }
            else if (!gameState.expandedCircles.has(targetKey)) {
                console.log(`DEBUG: Reached new Blue Circle ${targetKey} -> Triggering Map Expansion...`);
                gameState.expandedCircles.add(targetKey);

                const [latStr, lonStr] = targetKey.split(',');
                if (onExpand) {
                    onExpand(parseFloat(latStr), parseFloat(lonStr));
                }
            }
        }

        // Trigger debounced save after any movement (unless restoring state)
        if (!gameState.isRestoringState && target) {
            debouncedSavePosition();
        }

    };

    // Remove old handler if exists
    if (userMarker._hideHandler) {
        userMarker.off('move', userMarker._hideHandler);
    }

    // Initial check
    checkAndHide();

    // Bind
    userMarker._hideHandler = checkAndHide;
    userMarker.on('move', checkAndHide);

    return checkAndHide; // Return for explicit calls if needed
}
