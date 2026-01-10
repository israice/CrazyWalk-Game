/**
 * Map Helpers Module
 * Utility functions for map generation
 */

const { roundCoord } = require('../../utils/geometry');

/**
 * Filter orphaned white lines and green circles
 * @param {Array} whiteLines - White lines array
 * @param {Array} greenCircles - Green circles array
 * @param {Set} usedIds - Set of used line IDs
 * @returns {Object} { whiteLines, greenCircles }
 */
function filterOrphanedElements(whiteLines, greenCircles, usedIds) {
    const usedIdsStr = new Set(Array.from(usedIds).map(String));
    const origWlCount = whiteLines.length;
    const origGcCount = greenCircles.length;

    const filteredWL = whiteLines.filter(wl => usedIdsStr.has(String(wl.id)));
    const filteredGC = greenCircles.filter(gc => usedIdsStr.has(String(gc.line_id)));

    console.log(`Filtered White Lines: ${origWlCount} -> ${filteredWL.length}`);
    console.log(`Filtered Green Circles: ${origGcCount} -> ${filteredGC.length}`);

    return { whiteLines: filteredWL, greenCircles: filteredGC };
}

/**
 * Calculate polygon total points
 * @param {Array} polygons - Polygons array
 * @param {Array} whiteLines - White lines array
 * @param {Array} blueCircles - Blue circles array
 */
function calculatePolygonPoints(polygons, whiteLines, blueCircles) {
    const lineGreenCounts = {};
    const lineNodesMap = {};

    for (const wl of whiteLines) {
        lineGreenCounts[wl.id] = wl.green_count || 0;
        lineNodesMap[wl.id] = { start: wl.start, end: wl.end };
    }

    const blueCircleCoords = new Set();
    for (const bc of blueCircles) {
        const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
        blueCircleCoords.add(key);
    }

    for (const poly of polygons) {
        let greenTotal = 0;
        const polygonNodes = new Set();

        for (const lineId of poly.boundary_white_lines || []) {
            greenTotal += lineGreenCounts[lineId] || 0;
            const nodes = lineNodesMap[lineId];
            if (nodes) {
                const sKey = `${roundCoord(nodes.start[0])}_${roundCoord(nodes.start[1])}`;
                const eKey = `${roundCoord(nodes.end[0])}_${roundCoord(nodes.end[1])}`;
                polygonNodes.add(sKey);
                polygonNodes.add(eKey);
            }
        }

        let blueCount = 0;
        for (const node of polygonNodes) {
            if (blueCircleCoords.has(node)) blueCount++;
        }

        poly.total_points = greenTotal + blueCount;
    }
}

module.exports = {
    filterOrphanedElements,
    calculatePolygonPoints
};
