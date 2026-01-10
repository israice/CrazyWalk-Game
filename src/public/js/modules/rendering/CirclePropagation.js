/**
 * CirclePropagation.js
 * Handles neighbor propagation and saturation updates for circles in expand mode
 */

/**
 * Propagate circle connections after expansion
 * @param {Object} data - Game data
 * @param {string} mode - 'initial' or 'expand'
 * @param {Object} deps - Dependencies object
 */
export function propagateCircleConnections(data, mode, deps) {
    const {
        circleLayerMap,
        blueCircleLayerMap,
        visiblePolygonIds
    } = deps;

    const localPolys = data.polygons || [];
    const localWhiteLines = data.white_lines || [];

    // Propagate neighbor updates
    propagateNeighborUpdates(localPolys, localWhiteLines, circleLayerMap);

    // Final safety check in expand mode
    if (mode === 'expand' && window.allItems) {
        performFinalSafetyCheck(circleLayerMap);
    }

    // Update saturation for all circles based on visible polygons
    if (mode === 'expand') {
        updateAllCircleSaturation(blueCircleLayerMap, visiblePolygonIds);
    }
}

/**
 * Propagate neighbor polygon updates to blue circles
 */
function propagateNeighborUpdates(localPolys, localWhiteLines, circleLayerMap) {
    if (!localPolys || localPolys.length === 0) return;

    localPolys.forEach(poly => {
        const polyId = poly.id;
        (poly.boundary_white_lines || []).forEach(lineId => {
            // Find white line
            let whiteLine = null;
            if (localWhiteLines) {
                whiteLine = localWhiteLines.find(l => l.id === lineId);
            }
            if (!whiteLine && window.allItems) {
                whiteLine = window.allItems.get(lineId);
            }

            if (whiteLine && whiteLine.endpoint_blue_circles) {
                whiteLine.endpoint_blue_circles.forEach(bcUid => {
                    if (window.allItems && window.allItems.has(bcUid)) {
                        const bcItem = window.allItems.get(bcUid);

                        // Update connected polygons
                        const existingIds = new Set(bcItem.connected_polygon_ids || []);
                        existingIds.add(polyId);
                        bcItem.connected_polygon_ids = Array.from(existingIds);
                        bcItem.connected_polygons_count = bcItem.connected_polygon_ids.length;

                        // Recalculate connected lines
                        if (bcItem.connected_white_lines) {
                            let visibleLinesCount = 0;
                            bcItem.connected_white_lines.forEach(lid => {
                                let isVisible = false;
                                if (window.allItems && window.allItems.has(lid)) isVisible = true;
                                if (!isVisible && localWhiteLines) {
                                    if (localWhiteLines.find(l => l.id === lid)) isVisible = true;
                                }
                                if (isVisible) visibleLinesCount++;
                            });
                            bcItem.stats_connected_lines = visibleLinesCount;
                        }

                        // Recalculate polygon stats
                        bcItem.stats_connected_polygons = bcItem.connected_polygon_ids.length;
                        const expectedPolygons = bcItem.stats_connected_lines || bcItem.connections || 0;
                        bcItem.stats_not_connected_polygons = Math.max(0, expectedPolygons - bcItem.stats_connected_polygons);

                        // Update saturation
                        const isNowSaturated = (bcItem.stats_not_connected_polygons === 0) &&
                            (bcItem.stats_not_connected_lines === 0) &&
                            (bcItem.stats_connected_lines > 0);
                        bcItem.is_saturated = isNowSaturated;

                        // Update visuals
                        const key = `${bcItem.lat.toFixed(6)},${bcItem.lon.toFixed(6)}`;
                        const marker = circleLayerMap.get(key);
                        if (marker) {
                            marker.isSaturated = isNowSaturated;
                            if (isNowSaturated) {
                                marker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                            } else {
                                marker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                            }
                        }
                    }
                });
            }
        });
    });
}

/**
 * Final safety check - rebuild blue circle data from white lines
 */
/**
 * Final safety check - rebuild blue circle data from white lines
 */
function performFinalSafetyCheck(circleLayerMap) {
    const relevantBlueCircles = new Set();

    // 1. Iterate all white lines and propagate to blue circles
    rebuildConnectionsFromWhiteLines(relevantBlueCircles);

    // 2. Finalize and recalculate for all blue circles
    recalculateBlueCircleStats(circleLayerMap);
}

/**
 * Rebuild connections from white lines to blue circles
 */
function rebuildConnectionsFromWhiteLines(relevantBlueCircles) {
    window.allItems.forEach(item => {
        if (item.id && item.id.startsWith('WHITE_LINE_')) {
            const linePolys = item.connected_polygon_ids || [];

            if (item.endpoint_blue_circles) {
                item.endpoint_blue_circles.forEach(bcUid => {
                    if (window.allItems.has(bcUid)) {
                        const bcItem = window.allItems.get(bcUid);
                        relevantBlueCircles.add(bcItem);

                        // Ensure white line UID is tracked
                        if (!bcItem.connected_white_lines_uids) {
                            bcItem.connected_white_lines_uids = new Set();
                        }
                        bcItem.connected_white_lines_uids.add(item.id);

                        // Ensure polygons are tracked
                        if (!bcItem.connected_polygon_ids_set) {
                            bcItem.connected_polygon_ids_set = new Set(bcItem.connected_polygon_ids || []);
                        }
                        linePolys.forEach(pid => {
                            if (window.allItems.has(pid)) {
                                bcItem.connected_polygon_ids_set.add(pid);
                            }
                        });
                    }
                });
            }
        }
    });
}

/**
 * Recalculate stats and saturation for all blue circles
 */
function recalculateBlueCircleStats(circleLayerMap) {
    window.allItems.forEach(item => {
        if (item.id && item.id.startsWith('BLUE_CIRCLE_')) {
            // Flush sets to counts
            if (item.connected_white_lines_uids) {
                item.stats_connected_lines = item.connected_white_lines_uids.size;
            } else if (item.connected_white_lines) {
                let visibleCount = 0;
                item.connected_white_lines.forEach(lid => {
                    if (window.allItems.has(lid)) visibleCount++;
                });
                item.stats_connected_lines = visibleCount;
            }

            if (item.connected_polygon_ids_set) {
                item.connected_polygon_ids = Array.from(item.connected_polygon_ids_set);
            } else if (item.connected_polygon_ids) {
                item.connected_polygon_ids = item.connected_polygon_ids.filter(pid => window.allItems.has(pid));
            }
            item.stats_connected_polygons = item.connected_polygon_ids ? item.connected_polygon_ids.length : 0;

            // Recalculate stats
            const expectedPolygons = item.stats_connected_lines || item.connections || 0;
            item.stats_not_connected_polygons = Math.max(0, expectedPolygons - item.stats_connected_polygons);
            item.stats_not_connected_lines = Math.max(0, (item.connections || 0) - (item.stats_connected_lines || 0));

            // Strict saturation check
            const isNowSaturated = (item.stats_not_connected_polygons === 0) &&
                (item.stats_not_connected_lines === 0) &&
                (item.stats_connected_lines > 0);
            item.is_saturated = isNowSaturated;

            // Update visuals
            const key = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
            const marker = circleLayerMap.get(key);
            if (marker) {
                marker.isSaturated = isNowSaturated;
                if (marker.isSaturated) {
                    marker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                } else {
                    marker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                }
            }
        }
    });
}

/**
 * Update saturation for all blue circles based on visible polygons
 */
function updateAllCircleSaturation(blueCircleLayerMap, visiblePolygonIds) {
    blueCircleLayerMap.forEach((layer, coordKey) => {
        // Find circle data
        let circleData = null;
        for (const [uid, item] of window.allItems.entries()) {
            if (item.lat !== undefined && item.lon !== undefined) {
                const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                    circleData = item;
                    break;
                }
            }
        }

        if (circleData && circleData.connected_polygon_ids) {
            // Count visible polygons
            const visiblePolyCount = circleData.connected_polygon_ids.filter(
                pid => visiblePolygonIds.has(pid)
            ).length;
            const totalConnections = circleData.connections || 0;

            // Circle is saturated if all connections are to visible polygons
            const shouldBeSaturated = (totalConnections === visiblePolyCount && totalConnections > 0);

            // Update if changed
            if (shouldBeSaturated !== circleData.is_saturated) {
                circleData.is_saturated = shouldBeSaturated;
                layer.isSaturated = shouldBeSaturated;

                const newMainColor = shouldBeSaturated ? '#ff7b00' : 'blue';
                const newFillColor = shouldBeSaturated ? '#ffa600' : '#00ccff';
                layer.setStyle({ color: newMainColor, fillColor: newFillColor });

                console.log(`DEBUG: Updated circle at ${coordKey}: connections=${totalConnections}, visible_polys=${visiblePolyCount}, is_saturated=${shouldBeSaturated}`);
            }
        }
    });
}

/**
 * Update endpoint polygon IDs for expand mode
 * @param {Array} localPolys - Local polygon data
 * @param {Map} blueCircleLayerMap - Blue circle layer map
 */
export function updateEndpointPolygonIds(localPolys, blueCircleLayerMap) {
    // Create map of white line endpoints to polygon UIDs
    const endpointToPolyIds = new Map();

    localPolys.forEach(poly => {
        const whiteLines = poly.whiteLines || [];
        whiteLines.forEach(line => {
            const startKey = `${line.start[0].toFixed(6)},${line.start[1].toFixed(6)}`;
            if (!endpointToPolyIds.has(startKey)) {
                endpointToPolyIds.set(startKey, new Set());
            }
            endpointToPolyIds.get(startKey).add(poly.id);

            const endKey = `${line.end[0].toFixed(6)},${line.end[1].toFixed(6)}`;
            if (!endpointToPolyIds.has(endKey)) {
                endpointToPolyIds.set(endKey, new Set());
            }
            endpointToPolyIds.get(endKey).add(poly.id);
        });
    });

    // Update all blue circles with new polygon IDs
    blueCircleLayerMap.forEach((layer, coordKey) => {
        let circleData = null;
        for (const [uid, item] of window.allItems.entries()) {
            if (item.lat !== undefined && item.lon !== undefined) {
                const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
                if (itemKey === coordKey && uid.startsWith('BLUE_CIRCLE_')) {
                    circleData = item;
                    break;
                }
            }
        }

        if (circleData) {
            const newPolyIds = endpointToPolyIds.get(coordKey);
            if (newPolyIds && newPolyIds.size > 0) {
                const existingIds = new Set(circleData.connected_polygon_ids || []);
                newPolyIds.forEach(pid => existingIds.add(pid));
                circleData.connected_polygon_ids = Array.from(existingIds);

                console.log(`DEBUG: Updated circle ${coordKey}: added ${newPolyIds.size} new polygon IDs, total now: ${circleData.connected_polygon_ids.length}`);
            }
        }
    });
}
