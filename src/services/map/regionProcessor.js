/**
 * Map Region Processor
 * Handles the core generation pipeline for a specific region size
 */

// Import step modules
const { fetchRedLines } = require('./roadFetcher');
const { identifyIntersections } = require('./intersectionFinder');
const { createGraphElements } = require('./graphBuilder');
const { findPolygons } = require('./polygonFinder');
const { createGroups } = require('./groupCreator');

// Import extracted modules
const { calculateConnections } = require('./connectionCalculator');
const { createPosterGrid } = require('./posterGridCreator');
const { applyModeFiltering } = require('./modeFilter');
const { filterOrphanedElements, calculatePolygonPoints } = require('./mapHelpers');

/**
 * Process a single region attempt
 * @param {number} lat 
 * @param {number} lon 
 * @param {number} size 
 * @param {number} attemptIndex 
 * @param {number} totalAttempts 
 * @param {string} mode 
 * @param {Array|null} restoredPolygonIds 
 * @returns {Promise<Object>} { success, data, shouldRetry, error }
 */
async function processRegion(lat, lon, size, attemptIndex, totalAttempts, mode, restoredPolygonIds) {
    const meters = Math.round(size * 111000);

    console.log('========================================');
    console.log(`GPS POLYGON ATTEMPT ${attemptIndex + 1}/${totalAttempts}: region_size=${size} (~${meters}m)`);
    console.log('========================================');

    // Step 1: Fetch roads
    const t0 = Date.now();
    const { segments: redSegments, visual: redVisual } = await fetchRedLines(lat, lon, size, mode);
    console.log(`PERF: Fetch Red Lines took ${((Date.now() - t0) / 1000).toFixed(4)}s`);

    if (!redVisual.length && !redSegments.length) {
        console.warn(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: No roads found for region_size=${size}`);
        return {
            success: false,
            shouldRetry: attemptIndex < totalAttempts - 1,
            error: { code: 'NO_ROADS', message: `No roads found at (${lat}, ${lon})` }
        };
    }

    console.log(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: Found ${redVisual.length} road segments`);

    // Step 2: Find intersections
    const t1 = Date.now();
    const { blueCircles } = await identifyIntersections();
    console.log(`PERF: Identify Intersections took ${((Date.now() - t1) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: Identified ${blueCircles.length} intersections`);

    // Step 3: Create graph elements
    const t2 = Date.now();
    let { whiteLines, greenCircles } = await createGraphElements();
    console.log(`PERF: Create Graph Elements took ${((Date.now() - t2) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: Created ${whiteLines.length} white lines, ${greenCircles.length} green circles`);

    // Step 4: Find polygons
    const t3 = Date.now();
    let { polygons, usedIds } = await findPolygons();
    console.log(`PERF: Find Polygons took ${((Date.now() - t3) / 1000).toFixed(4)}s`);

    if (!polygons.length) {
        console.warn(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: No polygons created from roads`);
        return {
            success: false,
            shouldRetry: attemptIndex < totalAttempts - 1,
            error: { code: 'NO_POLYGONS', message: `No polygons created at (${lat}, ${lon})` }
        };
    }

    console.log(`ATTEMPT ${attemptIndex + 1}/${totalAttempts}: Created ${polygons.length} polygons - SUCCESS!`);

    // Filter orphaned elements
    const filtered = filterOrphanedElements(whiteLines, greenCircles, usedIds);
    whiteLines = filtered.whiteLines;
    greenCircles = filtered.greenCircles;

    // Calculate polygon points
    calculatePolygonPoints(polygons, whiteLines, blueCircles);

    // Step 5: Create groups
    const groups = await createGroups();

    // Calculate all connections
    let filteredBlueCircles = calculateConnections(whiteLines, greenCircles, blueCircles, polygons);

    // Create poster grid
    const posterGrid = await createPosterGrid(polygons, lat, lon);

    // Apply mode filtering
    const modeFiltered = applyModeFiltering(
        mode, polygons, whiteLines, greenCircles, filteredBlueCircles, lat, lon, restoredPolygonIds
    );

    polygons = modeFiltered.polygons;
    whiteLines = modeFiltered.whiteLines;
    greenCircles = modeFiltered.greenCircles;
    filteredBlueCircles = modeFiltered.blueCircles;

    console.log('========================================');
    console.log(`SUCCESS on attempt ${attemptIndex + 1}: ${polygons.length} polygons, ${filteredBlueCircles.length} circles, ${whiteLines.length} lines`);
    console.log('========================================');

    const resultData = {
        red_lines: [],
        blue_circles: filteredBlueCircles,
        white_lines: whiteLines,
        green_circles: greenCircles,
        polygons,
        groups,
        poster_grid: posterGrid
    };

    return { success: true, data: resultData };
}

module.exports = {
    processRegion
};
