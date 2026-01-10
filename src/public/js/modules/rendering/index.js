/**
 * Rendering Module - Main Orchestrator
 * Coordinates all rendering sub-modules for game elements
 */

import { initializeRender } from './RenderInitializer.js';
import { renderPolygons } from './PolygonRenderer.js';
import { renderWhiteLines } from './WhiteLineRenderer.js';
import { renderBlueCircles } from './BlueCircleRenderer.js';
import { renderGreenCircles } from './GreenCircleRenderer.js';
import { propagateCircleConnections, updateEndpointPolygonIds } from './CirclePropagation.js';
import { finalizeRender } from './RenderFinalizer.js';

/**
 * Main render function - orchestrates all rendering steps
 * @param {Object} data - Game data from server
 * @param {string} mode - 'initial' or 'expand'
 * @param {Object} deps - All dependencies
 */
export async function renderGameElements(data, mode, deps) {
    console.log("DEBUG: Starting Render with Progress Tracking...");

    // Extract commonly needed dependencies
    const {
        map,
        detailsLayer,
        expandedLayer,
        circleLayerMap,
        blueCircleLayerMap,
        lineLayerMap,
        greenCirclesByLine,
        polygonState,
        circleToPolyMap,
        visiblePolygonIds,
        gameState,
        debugHandler
    } = deps;

    // 1. Initialize - prepare data and clear layers
    const initResult = initializeRender(data, mode, deps);
    if (!initResult) {
        console.error("CRITICAL: Initialization failed");
        return;
    }

    const { localBlueCircles } = initResult;
    const localPolys = data.polygons || [];
    const localWhiteLines = data.white_lines || [];
    const localGreenCircles = data.green_circles || [];

    console.log(`DEBUG: Received from backend - Polygons: ${localPolys.length}, White Lines: ${localWhiteLines.length}, Green Circles: ${localGreenCircles.length}, Blue Circles: ${localBlueCircles.length}`);

    // Setup debug handler layer maps
    debugHandler.setLayerMaps({
        lineMap: lineLayerMap,
        circleMap: circleLayerMap,
        blueMap: blueCircleLayerMap,
        greenByLine: greenCirclesByLine,
        polyState: polygonState
    });

    // Map click to clear selection
    map.on('click', () => {
        if (gameState.isDebugActive) {
            deps.resetSelection();
            map.closePopup();
        }
    });

    // Helper to map circles to polygons
    const mapCircleToPolys = createMapCircleToPolys(circleToPolyMap, localPolys);

    // Create enhanced deps with helper functions
    const renderDeps = {
        ...deps,
        mode,
        mapCircleToPolys,
        localPolys
    };

    // 2. Render Polygons
    renderPolygons(localPolys, mode, renderDeps);

    // 3. Render White Lines
    renderWhiteLines(localWhiteLines, renderDeps);

    // 4. Render Blue Circles
    renderBlueCircles(localBlueCircles, localPolys, renderDeps);

    // 5. Propagate circle connections (neighbor updates)
    propagateCircleConnections(data, mode, renderDeps);

    // 6. Render Green Circles
    renderGreenCircles(localGreenCircles, localPolys, renderDeps);

    // 7. Update endpoint polygon IDs in expand mode
    if (mode === 'expand') {
        updateEndpointPolygonIds(localPolys, blueCircleLayerMap);
    }

    // 8. Finalize - snap, state application, layer setup
    await finalizeRender(data, mode, renderDeps);
}

/**
 * Create helper function to map circle coordinates to polygons
 */
function createMapCircleToPolys(circleToPolyMap, localPolys) {
    return function mapCircleToPolys(lat, lon, polyList, whiteLineId = -1) {
        const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

        if (!circleToPolyMap.has(key)) {
            circleToPolyMap.set(key, []);
        }
        const list = circleToPolyMap.get(key);

        polyList.forEach(poly => {
            let isRelevant = false;

            // Check Green Stickiness (Line ID)
            if (whiteLineId !== -1 && poly.boundary_white_lines && poly.boundary_white_lines.includes(whiteLineId)) {
                isRelevant = true;
            }
            // Check Blue Stickiness (Vertex Match)
            else if (whiteLineId === -1) {
                const isVertex = poly.coords.some(c =>
                    Math.abs(c[0] - lat) < 0.00001 && Math.abs(c[1] - lon) < 0.00001
                );
                if (isVertex) isRelevant = true;
            }

            if (isRelevant) {
                if (!list.includes(poly.id)) {
                    list.push(poly.id);
                }
            }
        });
    };
}

// Re-export individual modules for direct access if needed
export { initializeRender } from './RenderInitializer.js';
export { renderPolygons } from './PolygonRenderer.js';
export { renderWhiteLines } from './WhiteLineRenderer.js';
export { renderBlueCircles } from './BlueCircleRenderer.js';
export { renderGreenCircles } from './GreenCircleRenderer.js';
export { propagateCircleConnections } from './CirclePropagation.js';
export { finalizeRender } from './RenderFinalizer.js';
