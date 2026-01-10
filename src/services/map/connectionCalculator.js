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
function calculateConnections(whiteLines, greenCircles, blueCircles, polygons) {
    // White line node data
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

    // Filter and enrich blue circles
    let filteredBlueCircles = blueCircles.map(bc => {
        const nodeKey = `${bc.lat}_${bc.lon}`;
        const nodeData = wlNodeData[nodeKey];
        return {
            ...bc,
            active_connections: nodeData ? nodeData.count : 0,
            connected_white_lines: nodeData ? nodeData.line_ids : []
        };
    }).filter(bc => bc.active_connections > 0);

    // White line to polygon mapping
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

    // Update white lines with polygon connections
    for (const wl of whiteLines) {
        const connectedPolys = Array.from(wlPolyMap[wl.id] || []);
        wl.connected_polygon_ids = connectedPolys;
        wl.connected_polygons_count = connectedPolys.length;
    }

    // Update green circles with polygon connections
    for (const gc of greenCircles) {
        const connectedPolys = Array.from(wlPolyMap[gc.line_id] || []);
        gc.connected_polygon_ids = connectedPolys;
        gc.connected_polygons_count = connectedPolys.length;
    }

    // Blue circle polygon connections
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

    // Polygon neighbors
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

    return filteredBlueCircles;
}

module.exports = {
    calculateConnections
};
