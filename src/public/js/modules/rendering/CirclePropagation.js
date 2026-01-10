/**
 * CirclePropagation.js
 * Handles neighbor propagation and saturation updates for circles in expand mode
 */

const getCoordKey = (lat, lon) => `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;

/**
 * Propagate circle connections after expansion
 */
export function propagateCircleConnections(data, mode, deps) {
    const { circleLayerMap, blueCircleLayerMap, visiblePolygonIds } = deps;
    const localPolys = data.polygons || [];
    const localWhiteLines = data.white_lines || [];
    const allItems = window.allItems;

    // 1. Propagate neighbor updates (Polygons -> WhiteLines -> BlueCircles)
    if (localPolys.length > 0) {
        localPolys.forEach(poly => {
            (poly.boundary_white_lines || []).forEach(lineId => {
                const line = localWhiteLines.find(l => l.id === lineId) || (allItems ? allItems.get(lineId) : null);
                if (line && line.endpoint_blue_circles) {
                    line.endpoint_blue_circles.forEach(bcUid => {
                        const bcItem = allItems ? allItems.get(bcUid) : null;
                        if (bcItem) {
                            // Update connected polygons
                            const polySet = new Set(bcItem.connected_polygon_ids || []);
                            polySet.add(poly.id);
                            bcItem.connected_polygon_ids = Array.from(polySet);
                            bcItem.connected_polygons_count = polySet.size;
                            updateCircleStatsAndVisuals(bcItem, circleLayerMap);
                        }
                    });
                }
            });
        });
    }

    // 2. Final safety check (Expand mode only): Re-verify from all global white lines
    if (mode === 'expand' && allItems) {
        const relevantCircles = new Set();
        allItems.forEach(item => {
            if (item.id?.startsWith('WHITE_LINE_') && item.endpoint_blue_circles) {
                item.endpoint_blue_circles.forEach(bcUid => {
                    const bcItem = allItems.get(bcUid);
                    if (bcItem) {
                        relevantCircles.add(bcItem);
                        // Track connections
                        bcItem.connected_white_lines_uids = (bcItem.connected_white_lines_uids || new Set()).add(item.id);
                        if (item.connected_polygon_ids) {
                            const polySet = bcItem.connected_polygon_ids_set = (bcItem.connected_polygon_ids_set || new Set(bcItem.connected_polygon_ids || []));
                            item.connected_polygon_ids.forEach(pid => {
                                if (allItems.has(pid)) polySet.add(pid);
                            });
                        }
                    }
                });
            }
        });
        relevantCircles.forEach(bc => updateCircleStatsAndVisuals(bc, circleLayerMap));
    }

    // 3. Update saturation based on visibility
    if (mode === 'expand') {
        updateAllCircleSaturation(blueCircleLayerMap, visiblePolygonIds);
    }
}

/**
 * Update stats and visuals for a single blue circle item
 */
function updateCircleStatsAndVisuals(item, circleLayerMap) {
    // 1. Calculate connected lines count
    if (item.connected_white_lines_uids) {
        item.stats_connected_lines = item.connected_white_lines_uids.size;
    } else if (item.connected_white_lines) {
        item.stats_connected_lines = item.connected_white_lines.filter(lid =>
            window.allItems && (window.allItems.has(lid) || (window.localWhiteLines && window.localWhiteLines.find(l => l.id === lid)))
        ).length;
    }

    // 2. Calculate connected polygons count
    if (item.connected_polygon_ids_set) {
        item.connected_polygon_ids = Array.from(item.connected_polygon_ids_set);
    }
    item.stats_connected_polygons = item.connected_polygon_ids ? item.connected_polygon_ids.length : 0;

    // 3. Update saturation stats
    const totalLines = item.connections || 0;
    const connectedLines = item.stats_connected_lines || 0;

    // Logic: Connected polygons matches expected lines, OR other heuristic
    item.stats_not_connected_polygons = Math.max(0, connectedLines - item.stats_connected_polygons);
    item.stats_not_connected_lines = Math.max(0, totalLines - connectedLines);

    const isSaturated = (item.stats_not_connected_polygons === 0) &&
        (item.stats_not_connected_lines === 0) &&
        (connectedLines > 0);

    item.is_saturated = isSaturated;

    // 4. Update visual layer
    if (circleLayerMap) {
        const marker = circleLayerMap.get(getCoordKey(item.lat, item.lon));
        if (marker) {
            marker.isSaturated = isSaturated;
            marker.setStyle({
                color: isSaturated ? '#ff7b00' : 'blue',
                fillColor: isSaturated ? '#ffa600' : '#00ccff'
            });
        }
    }
}

/**
 * Update saturation for all blue circles based on visible polygons
 */
function updateAllCircleSaturation(blueCircleLayerMap, visiblePolygonIds) {
    const allItems = window.allItems;
    if (!allItems) return;

    blueCircleLayerMap.forEach((layer, coordKey) => {
        // Find corresponding data item efficiently
        // Note: Map keys are coords, but we need the data item. 
        // We iterate layers, so we need to find the item.
        // Optimization: Rely on layer.uid or search if needed, but here we scan allItems if no direct link.
        // To be compact and safe, we can try to find by coordKey if we construct it from item.

        let circleData = null;
        // Optimization attempt: fast finding not guaranteed without index, iterating is what original did.
        // However, we can filter allItems for BLUE_CIRCLE keys if map is huge.
        // For now, linear scan of allItems is acceptable if consistent with original behavior, 
        // but we can break early.
        for (const item of allItems.values()) {
            if (item.id?.startsWith('BLUE_CIRCLE_') && getCoordKey(item.lat, item.lon) === coordKey) {
                circleData = item;
                break;
            }
        }

        if (circleData?.connected_polygon_ids) {
            const visibleCount = circleData.connected_polygon_ids.filter(pid => visiblePolygonIds.has(pid)).length;
            const total = circleData.connections || 0;
            const shouldBeSaturated = (total === visibleCount && total > 0);

            if (shouldBeSaturated !== circleData.is_saturated) {
                circleData.is_saturated = shouldBeSaturated;
                layer.isSaturated = shouldBeSaturated;
                layer.setStyle({
                    color: shouldBeSaturated ? '#ff7b00' : 'blue',
                    fillColor: shouldBeSaturated ? '#ffa600' : '#00ccff'
                });
            }
        }
    });
}

/**
 * Update endpoint polygon IDs for expand mode
 */
export function updateEndpointPolygonIds(localPolys, blueCircleLayerMap) {
    // fast lookup for endpoints [key] -> Set(polyIds)
    const endpointToPolyIds = new Map();
    const addPolyToKey = (key, polyId) => {
        if (!endpointToPolyIds.has(key)) endpointToPolyIds.set(key, new Set());
        endpointToPolyIds.get(key).add(polyId);
    };

    (localPolys || []).forEach(poly => {
        (poly.whiteLines || []).forEach(line => {
            addPolyToKey(getCoordKey(line.start[0], line.start[1]), poly.id);
            addPolyToKey(getCoordKey(line.end[0], line.end[1]), poly.id);
        });
    });

    // Update blue circles
    blueCircleLayerMap.forEach((layer, coordKey) => {
        const additionalPolys = endpointToPolyIds.get(coordKey);
        if (additionalPolys) {
            // Find data item
            let circleData = null;
            if (window.allItems) {
                for (const item of window.allItems.values()) {
                    if (item.id?.startsWith('BLUE_CIRCLE_') && getCoordKey(item.lat, item.lon) === coordKey) {
                        circleData = item;
                        break;
                    }
                }
            }

            if (circleData) {
                const existing = new Set(circleData.connected_polygon_ids || []);
                additionalPolys.forEach(pid => existing.add(pid));
                circleData.connected_polygon_ids = Array.from(existing);
                console.log(`DEBUG: Updated circle ${coordKey}: added ${additionalPolys.size} new polygon IDs`);
            }
        }
    });
}
