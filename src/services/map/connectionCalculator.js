/**
 * Connection Calculator Module
 * Calculates connections between map elements (white lines, circles, polygons)
 */

const { roundCoord } = require('../../utils/geometry');

/**
 * Calculate connections for all elements
 * @param {Array} whiteLines - White lines
 * @param {Array} greenCircles - Green circles
 * @param {Array} blueCircles - Blue circles
 * @param {Array} polygons - Polygons
 * @returns {Array} Filtered blue circles with connections
 */
/**
 * Calculate connections for all elements
 * @param {Array} whiteLines - White lines
 * @param {Array} greenCircles - Green circles
 * @param {Array} blueCircles - Blue circles
 * @param {Array} polygons - Polygons
 * @returns {Array} Filtered blue circles with connections
 */
function calculateConnections(whiteLines, greenCircles, blueCircles, polygons) {
    // 1. Build Node Data from White Lines
    const wlNodeData = buildNodeData(whiteLines);

    // 2. Filter Blue Circles based on connections
    const filteredBlueCircles = filterBlueCircles(blueCircles, wlNodeData);

    // 3. Map White Lines to Polygons
    const wlPolyMap = mapLinesToPolygons(whiteLines, polygons);

    // 4. Update White Lines with Polygon Connections
    enrichWhiteLines(whiteLines, wlPolyMap);

    // 5. Update Green Circles with Polygon Connections
    enrichGreenCircles(greenCircles, wlPolyMap);

    // 6. Update Blue Circles with Polygon Connections
    enrichBlueCircles(filteredBlueCircles, whiteLines, polygons);

    // 7. Calculate Polygon Neighbors
    findPolygonNeighbors(polygons, whiteLines);

    return filteredBlueCircles;
}

// --- Helper Functions ---

function buildNodeData(whiteLines) {
    const wlNodeData = {};
    for (const wl of whiteLines) {
        const sKey = `${wl.start[0]}_${wl.start[1]}`;
        const eKey = `${wl.end[0]}_${wl.end[1]}`;

        if (!wlNodeData[sKey]) wlNodeData[sKey] = { count: 0, line_ids: [] };
        if (!wlNodeData[eKey]) wlNodeData[eKey] = { count: 0, line_ids: [] };

        wlNodeData[sKey].count++;
        wlNodeData[sKey].line_ids.push(wl.id);
        wlNodeData[eKey].count++;
        wlNodeData[eKey].line_ids.push(wl.id);
    }
    return wlNodeData;
}

function filterBlueCircles(blueCircles, wlNodeData) {
    return blueCircles.map(bc => {
        const nodeKey = `${bc.lat}_${bc.lon}`;
        const nodeData = wlNodeData[nodeKey];
        return {
            ...bc,
            active_connections: nodeData ? nodeData.count : 0,
            connected_white_lines: nodeData ? nodeData.line_ids : []
        };
    }).filter(bc => bc.active_connections > 0);
}

function mapLinesToPolygons(whiteLines, polygons) {
    const wlPolyMap = {};
    for (const wl of whiteLines) {
        wlPolyMap[wl.id] = new Set();
    }

    for (const poly of polygons) {
        for (const lineId of poly.boundary_white_lines || []) {
            if (wlPolyMap[lineId]) {
                wlPolyMap[lineId].add(poly.id);
            }
        }
    }
    return wlPolyMap;
}

function enrichWhiteLines(whiteLines, wlPolyMap) {
    for (const wl of whiteLines) {
        const connectedPolys = Array.from(wlPolyMap[wl.id] || []);
        wl.connected_polygon_ids = connectedPolys;
        wl.connected_polygons_count = connectedPolys.length;
    }
}

function enrichGreenCircles(greenCircles, wlPolyMap) {
    for (const gc of greenCircles) {
        const connectedPolys = Array.from(wlPolyMap[gc.line_id] || []);
        gc.connected_polygon_ids = connectedPolys;
        gc.connected_polygons_count = connectedPolys.length;
    }
}

function enrichBlueCircles(filteredBlueCircles, whiteLines, polygons) {
    const coordToBcId = {};
    for (const bc of filteredBlueCircles) {
        const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
        coordToBcId[key] = bc.id;
    }

    const bcPolyMap = {};
    for (const bc of filteredBlueCircles) {
        bcPolyMap[bc.id] = new Set();
    }

    const lineMap = {};
    for (const wl of whiteLines) {
        lineMap[wl.id] = wl;
    }

    for (const poly of polygons) {
        for (const lineId of poly.boundary_white_lines || []) {
            const wl = lineMap[lineId];
            if (!wl) continue;

            const sKey = `${roundCoord(wl.start[0])}_${roundCoord(wl.start[1])}`;
            const eKey = `${roundCoord(wl.end[0])}_${roundCoord(wl.end[1])}`;

            if (coordToBcId[sKey] && bcPolyMap[coordToBcId[sKey]]) {
                bcPolyMap[coordToBcId[sKey]].add(poly.id);
            }
            if (coordToBcId[eKey] && bcPolyMap[coordToBcId[eKey]]) {
                bcPolyMap[coordToBcId[eKey]].add(poly.id);
            }
        }
    }

    for (const bc of filteredBlueCircles) {
        const connectedPolys = Array.from(bcPolyMap[bc.id] || []);
        bc.connected_polygon_ids = connectedPolys;
        bc.connected_polygons_count = connectedPolys.length;
        bc.is_saturated = bc.active_connections === connectedPolys.length && bc.active_connections > 0;
    }
}

function findPolygonNeighbors(polygons, whiteLines) {
    const lineMap = {};
    for (const wl of whiteLines) {
        lineMap[wl.id] = wl;
    }

    for (const poly of polygons) {
        const neighborIds = new Set();
        for (const lineId of poly.boundary_white_lines || []) {
            const wl = lineMap[lineId];
            if (!wl) continue;
            for (const pid of wl.connected_polygon_ids || []) {
                if (pid !== poly.id) neighborIds.add(pid);
            }
        }
        poly.neighbor_polygon_ids = Array.from(neighborIds);
        poly.neighbor_polygons_count = neighborIds.size;
    }
}

module.exports = {
    calculateConnections
};
