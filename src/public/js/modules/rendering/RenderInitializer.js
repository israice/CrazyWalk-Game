/**
 * RenderInitializer.js
 * Handles initialization and data preparation for rendering
 */

import { createUIDMaps } from '../utils/UIDGenerator.js';
import { showError } from '../ui/ErrorDisplay.js';

/**
 * Initialize render context and prepare data
 * @param {Object} data - Game data from server
 * @param {string} mode - 'initial' or 'expand'
 * @param {Object} deps - Dependencies object
 * @returns {Object} Prepared data for rendering
 */
export function initializeRender(data, mode, deps) {
    const {
        posterRenderer,
        groupsLayer,
        detailsLayer,
        expandedLayer,
        expandedItemUids,
        expandedCircleCoords,
        clearedCircleCoords,
        gameState
    } = deps;

    console.log("DEBUG: Starting Render with Progress Tracking...");

    // --- 0. INITIALIZE POSTERS & MASK EARLY ---
    if (data.poster_grid && data.poster_grid.length > 0) {
        posterRenderer.setPosterGrid(data.poster_grid);
        console.log(`DEBUG: Stored ${data.poster_grid.length} posters from server`);
    } else {
        console.log("DEBUG: No poster_grid data received from server");
        posterRenderer.setPosterGrid(null);
    }

    // Initialize poster grid UI and revealMask object
    posterRenderer.initPosterGrid(data, mode);

    // Clear layers based on mode
    if (mode !== 'expand') {
        groupsLayer.clearLayers();
        detailsLayer.clearLayers();
        expandedLayer.clearLayers();
        expandedItemUids.clear();
        expandedCircleCoords.clear();
        clearedCircleCoords.clear();
    } else {
        console.log(`DEBUG: Expand mode - accumulating new polygons to existing ${expandedItemUids.size} expanded items`);
    }

    // STRICT VALIDATION
    if (!data || !data.polygons || data.polygons.length === 0) {
        console.error("CRITICAL: No polygons found in game data.");
        showError("CRITICAL ERROR:<br>No polygons found.<br>Map cannot be generated.");
        return null;
    }

    // --- GLOBAL STORAGE ---
    if (mode !== 'expand') {
        window.allItems = new Map();
    } else if (!window.allItems) {
        window.allItems = new Map();
    }

    // --- PREPARE BLUE CIRCLES DATA ---
    let localBlueCircles = data.blue_circles || [];
    if (mode === 'initial' && gameState.restoredBlueCircles && gameState.restoredBlueCircles.length > 0) {
        const backendBlueCoords = new Set(
            localBlueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
        );

        gameState.restoredBlueCircles.forEach(restoredCircle => {
            const coordKey = `${restoredCircle.lat.toFixed(7)},${restoredCircle.lon.toFixed(7)}`;
            if (!backendBlueCoords.has(coordKey)) {
                localBlueCircles.push(restoredCircle);
            }
        });

        console.log(`DEBUG: Merged blue circles - Backend: ${data.blue_circles?.length || 0}, Restored: ${gameState.restoredBlueCircles.length}, Total: ${localBlueCircles.length}`);
    }

    // --- UID MAPPING ---
    const { lineIdMap, polyIdMap } = createUIDMaps(data, window.allItems, mode);

    // Update window.allItems with processed data
    if (data.white_lines) {
        data.white_lines.forEach(line => {
            window.allItems.set(line.uid, line);
            if (mode === 'expand' && !expandedItemUids.has(line.uid)) {
                expandedItemUids.add(line.uid);
            }
        });
    }

    if (data.green_circles) {
        data.green_circles.forEach(circle => {
            window.allItems.set(circle.uid, circle);
            if (mode === 'expand' && !expandedItemUids.has(circle.uid)) {
                expandedItemUids.add(circle.uid);
            }
        });
    }

    if (data.polygons) {
        data.polygons.forEach(poly => {
            window.allItems.set(poly.uid, poly);
            if (mode === 'expand' && !expandedItemUids.has(poly.uid)) {
                expandedItemUids.add(poly.uid);
            }
        });
    }

    // --- ENRICH DATA ---
    enrichBlueCircleCounts(data.polygons, localBlueCircles);
    enrichWhiteLineRelations(data.white_lines, localBlueCircles, data.green_circles);
    const blueCircleDataMap = buildBlueCircleDataMap(localBlueCircles);
    ensureNeighborArrays(data.polygons);

    return {
        localBlueCircles,
        lineIdMap,
        polyIdMap,
        blueCircleDataMap
    };
}

/**
 * Count blue circles per polygon
 */
function enrichBlueCircleCounts(polygons, blueCircles) {
    if (!polygons || !blueCircles || blueCircles.length === 0) return;

    const blueCircleCoords = new Set(
        blueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
    );

    polygons.forEach(poly => {
        let count = 0;
        if (poly.coords) {
            const uniquePolyCoords = new Set(
                poly.coords.map(c => `${c[0].toFixed(7)},${c[1].toFixed(7)}`)
            );
            uniquePolyCoords.forEach(coordKey => {
                if (blueCircleCoords.has(coordKey)) {
                    count++;
                }
            });
        }
        poly.blue_circles_count = count;
    });
}

/**
 * Enrich white lines with endpoint and green circle info
 */
function enrichWhiteLineRelations(whiteLines, blueCircles, greenCircles) {
    if (!whiteLines || !blueCircles || blueCircles.length === 0 || !greenCircles) return;

    // Build coord -> blue circle UID map
    const blueByCoord = new Map();
    blueCircles.forEach(bc => {
        const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
        blueByCoord.set(key, bc.uid);
    });

    // Build lineId -> green circles list
    const greenByLine = new Map();
    greenCircles.forEach(gc => {
        if (!greenByLine.has(gc.line_id)) greenByLine.set(gc.line_id, []);
        greenByLine.get(gc.line_id).push(gc.uid);
    });

    whiteLines.forEach(line => {
        const startKey = `${line.start[0].toFixed(7)},${line.start[1].toFixed(7)}`;
        const endKey = `${line.end[0].toFixed(7)},${line.end[1].toFixed(7)}`;

        line.endpoint_blue_circles = [];
        if (blueByCoord.has(startKey)) line.endpoint_blue_circles.push(blueByCoord.get(startKey));
        if (blueByCoord.has(endKey)) line.endpoint_blue_circles.push(blueByCoord.get(endKey));

        line.green_circles_uids = greenByLine.get(line.uid) || [];
        line.green_circles_count = line.green_circles_uids.length;
        line.total_circles = line.endpoint_blue_circles.length + line.green_circles_count;
    });
}

/**
 * Build blue circle data map for neighbor polygon calculations
 */
function buildBlueCircleDataMap(blueCircles) {
    const blueCircleDataMap = new Map();
    if (!blueCircles || blueCircles.length === 0) return blueCircleDataMap;

    blueCircles.forEach(bc => {
        const key = `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`;
        blueCircleDataMap.set(key, {
            id: bc.id,
            connections: bc.connections || 0,
            connected_polygon_ids: bc.connected_polygon_ids || [],
            connected_polygons_count: bc.connected_polygons_count || 0
        });
    });

    return blueCircleDataMap;
}

/**
 * Ensure neighbor arrays exist on polygons
 */
function ensureNeighborArrays(polygons) {
    if (!polygons) return;
    polygons.forEach(poly => {
        if (!poly.neighbor_polygon_ids) poly.neighbor_polygon_ids = [];
    });
}
