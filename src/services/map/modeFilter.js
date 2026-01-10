/**
 * Mode Filter Module
 * Filters map elements based on mode (initial/expand)
 */

const { roundCoord } = require('../../utils/geometry');

/**
 * Apply mode filtering (initial/expand)
 * @param {string} mode - Mode ('initial' or 'expand')
 * @param {Array} polygons - Polygons
 * @param {Array} whiteLines - White lines
 * @param {Array} greenCircles - Green circles
 * @param {Array} blueCircles - Blue circles
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {Array|null} restoredPolygonIds - Previously visible polygon IDs
 * @returns {Object} Filtered elements
 */
function applyModeFiltering(mode, polygons, whiteLines, greenCircles, blueCircles, lat, lon, restoredPolygonIds) {
    if ((mode !== 'initial' && mode !== 'expand') || polygons.length === 0) {
        return { polygons, whiteLines, greenCircles, blueCircles };
    }

    let connectedPolyIds = null;

    if (mode === 'initial') {
        if (restoredPolygonIds && restoredPolygonIds.length > 0) {
            connectedPolyIds = new Set(restoredPolygonIds);
            console.log(`Initial mode (RESTORE): Restoring ${restoredPolygonIds.length} previously visible polygons`);
        } else {
            // Find nearest green circle
            let minDist = Infinity;
            let nearestGc = null;

            for (const gc of greenCircles) {
                const dist = Math.sqrt((gc.lat - lat) ** 2 + (gc.lon - lon) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearestGc = gc;
                }
            }

            if (nearestGc && nearestGc.connected_polygon_ids) {
                connectedPolyIds = new Set(nearestGc.connected_polygon_ids);
                console.log(`Initial mode: Starting green circle ${nearestGc.id}, connected polygons: ${nearestGc.connected_polygon_ids}`);
            }
        }
    } else if (mode === 'expand') {
        // Find nearest blue circle
        let minDist = Infinity;
        let nearestBc = null;

        for (const bc of blueCircles) {
            const dist = Math.sqrt((bc.lat - lat) ** 2 + (bc.lon - lon) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearestBc = bc;
            }
        }

        if (nearestBc && nearestBc.connected_polygon_ids) {
            connectedPolyIds = new Set(nearestBc.connected_polygon_ids);
            console.log(`Expand mode: Clicked blue circle ${nearestBc.id}, connected polygons: ${nearestBc.connected_polygon_ids}`);
        }
    }

    if (!connectedPolyIds) {
        return { polygons, whiteLines, greenCircles, blueCircles };
    }

    const filteredPolygons = polygons.filter(p => connectedPolyIds.has(p.id));

    const visibleLineIds = new Set();
    for (const poly of filteredPolygons) {
        for (const lineId of poly.boundary_white_lines || []) {
            visibleLineIds.add(lineId);
        }
    }

    const filteredWhiteLines = whiteLines.filter(wl => visibleLineIds.has(wl.id));
    const filteredGreenCircles = greenCircles.filter(gc => visibleLineIds.has(gc.line_id));

    // Collect visible blue circle coords
    const visibleBlueCoords = new Set();
    for (const wl of filteredWhiteLines) {
        const sKey = `${roundCoord(wl.start[0])}_${roundCoord(wl.start[1])}`;
        const eKey = `${roundCoord(wl.end[0])}_${roundCoord(wl.end[1])}`;
        visibleBlueCoords.add(sKey);
        visibleBlueCoords.add(eKey);
    }

    const filteredBlueCircles = blueCircles.filter(bc => {
        const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
        return visibleBlueCoords.has(key);
    });

    console.log(`${mode.toUpperCase()} MODE FILTER: ${polygons.length} -> ${filteredPolygons.length} polygons`);

    return {
        polygons: filteredPolygons,
        whiteLines: filteredWhiteLines,
        greenCircles: filteredGreenCircles,
        blueCircles: filteredBlueCircles
    };
}

module.exports = {
    applyModeFiltering
};
