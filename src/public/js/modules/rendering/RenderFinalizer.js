/**
 * RenderFinalizer.js
 * Handles finalization: snap logic, state application, layer setup
 */

import { setupProgressHiding, findNearestActiveCircle } from '../logic/ProgressManager.js';
import { updateDebugBoxIntersections } from '../debug/IntersectionDebug.js';

/**
 * Finalize rendering - snap, state application, layer setup
 * @param {Object} data - Game data
 * @param {string} mode - 'initial' or 'expand'
 * @param {Object} deps - Dependencies object
 */
export async function finalizeRender(data, mode, deps) {
    const {
        map,
        detailsLayer,
        expandedLayer,
        circleLayerMap,
        circleToPolyMap,
        polygonState,
        lineLayerMap,
        blueCircleLayerMap,
        visiblePolygonIds,
        userMarker,
        controls,
        stateSaver,
        posterRenderer,
        gameState,
        updateAndSaveUserPosition,
        debouncedSavePosition,
        updatePolygonVisuals,
        loadGameData
    } = deps;

    const localGreenCircles = data.green_circles || [];
    const localBlueCircles = data.blue_circles || [];
    const localWhiteLines = data.white_lines || [];

    // Setup visibility and check current zoom
    controls.checkVisibility();
    const currentZoom = map.getZoom();
    console.log(`GPS: Visibility check complete. Current zoom: ${currentZoom}. detailsLayer has ${detailsLayer.getLayers().length} layers.`);
    console.log(`GPS: Polygons visible at zoom >= 18. Current: ${currentZoom >= 18 ? 'YES' : 'NO'}`);

    // Initial snap check
    handleInitialSnap(mode, gameState, userMarker, circleLayerMap, updateAndSaveUserPosition);

    // Update graph
    controls.updateGraph(localGreenCircles, localBlueCircles, localWhiteLines);

    // Apply collected state
    applyCollectedState(gameState.collectedCircles, {
        circleLayerMap,
        circleToPolyMap,
        polygonState,
        lineLayerMap,
        gameState,
        posterRenderer,
        updatePolygonVisuals
    });

    // Setup progress hiding
    setupProgressHiding({
        layerMap: circleLayerMap,
        circleMap: circleToPolyMap,
        polyState: polygonState,
        lineMap: lineLayerMap,
        blueMap: blueCircleLayerMap,
        userMarker,
        stateSaver,
        posterRenderer,
        onExpand: (lat, lon) => loadGameData(lat, lon, false, 'expand'),
        debouncedSavePosition,
        updatePolygonVisuals
    });

    // Map view event handlers
    map.on('viewreset move zoom', () => posterRenderer.updateMaskPaths());
    posterRenderer.updateMaskPaths();

    // Update debug box intersections if debug active
    if (gameState.isDebugActive) {
        console.log('DEBUG: renderGameElements complete - updating debug box intersections');
        updateDebugBoxIntersections();
    }

    // Save state after expand
    if (mode === 'expand') {
        console.log('DEBUG: Expand complete - saving state...');
        await stateSaver.saveGlobalState({
            gameState,
            visiblePolygonIds,
            currentPosterGrid: posterRenderer ? posterRenderer.getPosterGrid() : null
        });
    }

    // Add layers to map
    if (!map.hasLayer(detailsLayer)) {
        detailsLayer.addTo(map);
        console.log('DEBUG: detailsLayer added to map - all elements rendered synchronously');
    }
    if (!map.hasLayer(expandedLayer)) {
        expandedLayer.addTo(map);
        console.log('DEBUG: expandedLayer added to map');
    }

    // Clear restoration flag
    if (gameState.isRestoringState) {
        gameState.isRestoringState = false;
        console.log(`DEBUG: Setting gameState.isRestoringState = false (restoration complete, saves now allowed)`);
    }
}

/**
 * Handle initial snap to nearest circle
 */
function handleInitialSnap(mode, gameState, userMarker, circleLayerMap, updateAndSaveUserPosition) {
    // Restore saved position if exists
    if (gameState.currentUserPosition && gameState.currentUserPosition.lat !== undefined && mode === 'initial') {
        console.log(`DEBUG: Restoring saved user position: ${gameState.currentUserPosition.lat}, ${gameState.currentUserPosition.lon}`);
        userMarker.setLatLng([gameState.currentUserPosition.lat, gameState.currentUserPosition.lon]);
        updateAndSaveUserPosition(userMarker, gameState.currentUserPosition.lat, gameState.currentUserPosition.lon, false);
    }

    // Snap to nearest active circle on initial load
    if (mode === 'initial') {
        console.log(`DEBUG: Mode is 'initial' - SNAP logic will execute`);
        const currentPos = userMarker.getLatLng();
        const initialSnap = findNearestActiveCircle(currentPos.lat, currentPos.lng, circleLayerMap);
        if (initialSnap) {
            console.log(`DEBUG: Initial Snap triggered! Moving from ${currentPos.lat},${currentPos.lng} to ${initialSnap.lat},${initialSnap.lon}`);
            userMarker.setLatLng([initialSnap.lat, initialSnap.lon]);
            updateAndSaveUserPosition(userMarker, initialSnap.lat, initialSnap.lon, (gameState.isGpsActive && window.loadedQuality !== 'NONE'));
        }
    } else if (mode === 'restore') {
        console.log(`DEBUG: Mode is 'restore' - SNAP logic SKIPPED (marker should be at saved position)`);
        const currentPos = userMarker.getLatLng();
        console.log(`DEBUG: Current marker position after restore: ${currentPos.lat}, ${currentPos.lng}`);
    }
}

/**
 * Apply collected state to circles and polygons
 */
function applyCollectedState(keysToApply, deps) {
    const {
        circleLayerMap,
        circleToPolyMap,
        polygonState,
        lineLayerMap,
        gameState,
        posterRenderer,
        updatePolygonVisuals
    } = deps;

    // Reset polygon counts first
    polygonState.forEach(state => state.current = 0);

    if (!keysToApply || keysToApply.size === 0) {
        posterRenderer.updateMaskPaths();
        return;
    }

    console.log(`DEBUG: Applying ${keysToApply.size} collected circles to state...`);
    let appliedCount = 0;

    keysToApply.forEach(key => {
        const target = circleLayerMap.get(key);

        // Ensure it's in memory tracking
        gameState.collectedCircles.add(key);

        if (target) {
            // Check visibility rules
            const shouldHide = !gameState.isPostersDebugActive;
            if (shouldHide && target.options.opacity !== 0) {
                target.setStyle({ opacity: 0, fillOpacity: 0 });
            }
            if (typeof target.getTooltip === 'function' && target.getTooltip()) {
                target.unbindTooltip();
            }
            // Update visual for hit box too if composite
            if (target.visualSibling) {
                if (shouldHide) target.visualSibling.setStyle({ opacity: 0, fillOpacity: 0 });
            }

            // Update visual progress maps
            const relevantPolys = circleToPolyMap.get(key);
            if (relevantPolys) {
                relevantPolys.forEach(pid => {
                    const state = polygonState.get(pid);
                    if (state) state.current++;
                });
            }
            appliedCount++;
        }
    });

    // Recalculate polygon completion & visuals
    let completedAndMasked = 0;
    polygonState.forEach(state => {
        updatePolygonVisuals(state, lineLayerMap);
        if (state.current >= state.total && state.coords) {
            completedAndMasked++;
        }
    });

    console.log(`DEBUG: Applied state. Completed polygons: ${completedAndMasked}`);

    // Force mask update
    posterRenderer.updateMaskPaths();
}
