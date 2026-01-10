/**
 * BlueCircleRenderer.js
 * Handles rendering of blue circles with saturation logic
 */

/**
 * Render all blue circles
 * @param {Array} localBlueCircles - Blue circle data array
 * @param {Array} localPolys - Polygon data array
 * @param {Object} deps - Dependencies object
 */
export function renderBlueCircles(localBlueCircles, localPolys, deps) {
    const {
        detailsLayer,
        expandedLayer,
        circleLayerMap,
        blueCircleLayerMap,
        expandedCircleCoords,
        gameState,
        debugHandler,
        mapCircleToPolys,
        mode
    } = deps;

    if (!localBlueCircles || localBlueCircles.length === 0) return;

    const targetLayer = (mode === 'expand') ? expandedLayer : detailsLayer;

    localBlueCircles.forEach(circle => {
        const key = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;

        // Check if already rendered (expand mode reuses existing circles)
        if (circleLayerMap.has(key)) {
            updateExistingBlueCircle(circle, key, localPolys, deps);
            return;
        }

        // Determine colors based on saturation
        const isSaturated = circle.is_saturated || false;
        const mainColor = isSaturated ? '#ff7b00' : 'blue';
        const fillColor = isSaturated ? '#ffa600' : '#00ccff';

        const isCollected = gameState.collectedCircles.has(key);

        // Track expanded circle coordinates
        if (mode === 'expand') {
            expandedCircleCoords.add(key);
        }

        // Create marker
        const marker = L.circleMarker([circle.lat, circle.lon], {
            radius: 8,
            color: mainColor,
            fillColor: fillColor,
            fillOpacity: isCollected && !gameState.isPostersDebugActive ? 0 : 0.8,
            opacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1,
            interactive: !isCollected,
            pane: 'blueCirclesPane'
        }).addTo(targetLayer);

        // Style if collected but debug active
        if (isCollected && gameState.isPostersDebugActive) {
            marker.setStyle({ color: '#555', opacity: 0.5 });
        }

        // Save connection count for debug restoration
        marker.connections = circle.connections;
        marker.isSaturated = isSaturated;

        // UID Logic
        const blueUid = circle.id || `BLUE_CIRCLE_${circle.lat.toFixed(6)}_${circle.lon.toFixed(6)}`;
        marker.uid = blueUid;

        // Ensure data is in window.allItems
        if (window.allItems) {
            window.allItems.set(blueUid, {
                ...circle,
                id: blueUid,
                uid: blueUid
            });
        }

        // Bind tooltip with connection count
        if (!isCollected) {
            marker.bindTooltip(String(circle.connections), {
                permanent: true,
                direction: 'center',
                className: 'circle-label'
            });
        }

        // Add to maps
        circleLayerMap.set(key, marker);
        blueCircleLayerMap.set(key, marker);

        // Map to polygons
        mapCircleToPolys(circle.lat, circle.lon, localPolys, -1);

        // Attach debug click
        debugHandler.attachDebugClick(marker, circle, 'Blue Circle');
    });
}

/**
 * Update existing blue circle in expand mode
 */
function updateExistingBlueCircle(circle, key, localPolys, deps) {
    const { circleLayerMap, mapCircleToPolys } = deps;

    // Find and update in window.allItems
    for (const [uid, item] of window.allItems.entries()) {
        if (item.lat !== undefined && item.lon !== undefined) {
            const itemKey = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
            if (itemKey === key && uid.startsWith('BLUE_CIRCLE_')) {
                // Merge polygon IDs
                const existingIds = new Set(item.connected_polygon_ids || []);
                (circle.connected_polygon_ids || []).forEach(pid => existingIds.add(pid));
                item.connected_polygon_ids = Array.from(existingIds);
                item.connected_polygons_count = item.connected_polygon_ids.length;

                // Update stats from backend
                item.stats_connected_lines = circle.stats_connected_lines;
                item.stats_not_connected_lines = circle.stats_not_connected_lines;
                item.active_connections = circle.active_connections;
                item.is_saturated = circle.is_saturated;

                // Recalculate polygon stats
                item.stats_connected_polygons = item.connected_polygon_ids.length;
                const expectedPolygons = item.stats_connected_lines;
                item.stats_not_connected_polygons = Math.max(0, expectedPolygons - item.stats_connected_polygons);

                // Update saturation
                const isNowSaturated = (item.stats_not_connected_polygons === 0) &&
                    (item.stats_not_connected_lines === 0) &&
                    (item.stats_connected_lines > 0);
                item.is_saturated = isNowSaturated;

                // Update visual marker
                const existingMarker = circleLayerMap.get(key);
                if (existingMarker) {
                    existingMarker.isSaturated = isNowSaturated;
                    if (isNowSaturated) {
                        existingMarker.setStyle({ color: '#ff7b00', fillColor: '#ffa600' });
                    } else {
                        existingMarker.setStyle({ color: 'blue', fillColor: '#00ccff' });
                    }
                }
                break;
            }
        }
    }

    // Update polygon mapping
    mapCircleToPolys(circle.lat, circle.lon, localPolys, -1);
}
