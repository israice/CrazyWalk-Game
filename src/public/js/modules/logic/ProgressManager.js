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
export function setupProgressHiding(params) {
    const { userMarker, layerMap, gameState } = params;

    const checkAndHide = () => {
        const { target, targetKey } = findTargetCircle(userMarker, layerMap);

        if (target && targetKey) {
            handleCircleEntry(target, params);
            handleCircleCollection(target, targetKey, params);
        }

        // Map expansion check (Blue Circles) - runs even if target is null (checking fuzzy match in expansion logic if needed, 
        // but typically expansion relies on being ON the circle, so passing targetKey is correct)
        handleMapExpansion(targetKey, params);

        // Trigger debounced save after any movement (unless restoring state)
        if (!params.gameState.isRestoringState && target) {
            params.debouncedSavePosition();
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

/**
 * Find the target circle the user is currently on (exact or fuzzy match)
 */
function findTargetCircle(userMarker, layerMap) {
    const pos = userMarker.getLatLng();
    const exactKey = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
    let target = layerMap.get(exactKey);
    let targetKey = exactKey;

    if (!target) {
        // Optimization: Use local search if efficient, or reuse exported finder
        const nearest = findNearestActiveCircle(pos.lat, pos.lng, layerMap);

        // Strict threshold for "arrived"
        if (nearest && nearest.dist < 0.000001) { // Extremely close
            const fuzzyKey = `${nearest.lat.toFixed(6)},${nearest.lon.toFixed(6)}`;
            // console.log(`DEBUG: Fuzzy match: ${fuzzyKey} (dist: ${nearest.dist})`);
            target = layerMap.get(fuzzyKey);
            targetKey = fuzzyKey; // Use the found key
        } else {
            targetKey = null; // No valid target found
        }
    } else {
        // Recovery check: if exactKey points to nothing (stale?), try fuzzy
        if (target !== layerMap.get(exactKey)) {
            const nearest = findNearestActiveCircle(pos.lat, pos.lng, layerMap);
            if (nearest) targetKey = nearest.key;
        }
    }

    return { target, targetKey };
}

/**
 * Handle logic when user enters a circle (State update & Save)
 */
function handleCircleEntry(target, { gameState, stateSaver, posterRenderer }) {
    if (target.uid) {
        if (gameState.currentCircleUid !== target.uid) {
            console.log(`GLOBAL_STATE: Player moved to circle ${target.uid}`);
            gameState.currentCircleUid = target.uid;

            // Save state immediately when reaching a new circle
            if (!gameState.isRestoringState) {
                stateSaver.saveGlobalState({
                    gameState,
                    visiblePolygonIds: window.visiblePolygonIds || [],
                    currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
                });
            }
        }
    }
}

/**
 * Handle logic for collecting a circle
 */
function handleCircleCollection(target, targetKey, { gameState, circleMap, polyState, lineMap, updatePolygonVisuals }) {
    const isCollected = gameState.collectedCircles.has(targetKey);
    if (!isCollected) {
        console.log(`DEBUG: COLLECTED CIRCLE at ${targetKey}`);

        // 1. Mark Collected
        gameState.collectedCircles.add(targetKey);

        // 2. Log
        if (!gameState.isRestoringState) {
            console.log(`DEBUG: Collected circle at ${targetKey}, will persist to Redis`);
        }

        // 3. Hide Visuals (Unless Debug Posters Active)
        if (!gameState.isPostersDebugActive) {
            target.setStyle({ opacity: 0, fillOpacity: 0 });
        } else {
            target.setStyle({ color: '#555', opacity: 0.5 });
        }

        // 4. Remove Tooltip
        if (typeof target.getTooltip === 'function' && target.getTooltip()) {
            target.unbindTooltip();
        }

        // 5. Update Progress
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

/**
 * Handle map expansion logic when reaching blue circles
 */
function handleMapExpansion(targetKey, { blueMap, layerMap, gameState, onExpand }) {
    if (targetKey && blueMap && blueMap.has(targetKey)) {
        const targetCircle = layerMap.get(targetKey);

        // Check if Saturated (Orange) - If so, NO EXPANSION
        if (targetCircle && targetCircle.isSaturated) {
            // Already saturated
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
}
