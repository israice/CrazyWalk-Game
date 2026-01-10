/**
 * RenderInitializer.js
 * Handles initialization and data preparation for rendering
 */

import { createUIDMaps } from '../utils/UIDGenerator.js';
import { showError } from '../ui/ErrorDisplay.js';
import {
    enrichBlueCircleCounts,
    enrichWhiteLineRelations,
    buildBlueCircleDataMap,
    ensureNeighborArrays
} from './RenderDataEnricher.js';
import {
    mergeBlueCircles,
    initGlobalStorage,
    updateGlobalStorage
} from './RenderDataManager.js';

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

    // 1. INITIALIZE POSTERS
    if (data.poster_grid && data.poster_grid.length > 0) {
        posterRenderer.setPosterGrid(data.poster_grid);
    } else {
        posterRenderer.setPosterGrid(null);
    }
    posterRenderer.initPosterGrid(data, mode);

    // 2. CLEAR LAYERS (if not expanding)
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

    // 3. VALIDATION
    if (!data || !data.polygons || data.polygons.length === 0) {
        console.error("CRITICAL: No polygons found in game data.");
        showError("CRITICAL ERROR:<br>No polygons found.<br>Map cannot be generated.");
        return null;
    }

    // 4. PREPARE STORAGE
    initGlobalStorage(mode);

    // 5. MERGE DATA
    let localBlueCircles = mergeBlueCircles(data.blue_circles, gameState.restoredBlueCircles, mode);

    // 6. MAP UIDS
    const { lineIdMap, polyIdMap } = createUIDMaps(data, window.allItems, mode);

    // 7. UPDATE GLOBAL STORAGE
    updateGlobalStorage(data, expandedItemUids, mode);

    // 8. ENRICH DATA
    enrichBlueCircleCounts(data.polygons, localBlueCircles);
    enrichWhiteLineRelations(data.white_lines, localBlueCircles, data.green_circles);
    ensureNeighborArrays(data.polygons);

    const blueCircleDataMap = buildBlueCircleDataMap(localBlueCircles);

    return {
        localBlueCircles,
        lineIdMap,
        polyIdMap,
        blueCircleDataMap
    };
}
