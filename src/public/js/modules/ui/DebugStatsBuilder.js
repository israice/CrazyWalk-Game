/**
 * DebugStatsBuilder.js
 * Generates HTML statistics panels for debug popups
 */

/**
 * Determines the status of an element based on game state
 */
export function getElementStatus(type, data, gameState, polygonState) {
    let status = 'Visible';

    if (type.includes('Green Circle') || type.includes('Blue Circle')) {
        const lat = data.lat || data.center?.[0];
        const lon = data.lon || data.center?.[1];

        if (lat !== undefined && lon !== undefined) {
            const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
            if (gameState.collectedCircles?.has(key)) {
                status = 'Collected';
            }
        }
    } else if (type === 'Polygon Label' || type === 'Polygon') {
        const polyId = data.parent_polygon_uid || data.uid || data.id;
        const pState = polygonState?.get(polyId);
        if (pState && pState.current >= pState.total) {
            status = 'Completed';
        }
    } else if (type === 'White Line') {
        const connectedPolys = data.connected_polygon_ids || [];
        let allCompleted = connectedPolys.length > 0;

        if (polygonState) {
            for (const polyId of connectedPolys) {
                const pState = polygonState.get(polyId);
                if (!pState || pState.current < pState.total) {
                    allCompleted = false;
                    break;
                }
            }
        }

        if (allCompleted && connectedPolys.length > 0) {
            status = 'Hidden (all polys completed)';
        }
    }

    return status;
}

/**
 * Generates status HTML with color coding
 */
function getStatusHtml(status) {
    const statusColor = status === 'Visible' ? 'green' : 'orange';
    return `<br>Status: <b style="color:${statusColor}">${status}</b>`;
}

/**
 * Builds stats HTML for Polygon elements
 */
export function buildPolygonStats(data, status, posterRenderer) {
    const blueCount = data.blue_circles_count || 0;
    const whiteLinesCount = data.boundary_white_lines?.length || 0;
    const totalPoints = data.total_points || 0;
    const greenCount = Math.max(0, totalPoints - blueCount);
    const mergeCount = data.merge_count || 1;

    const mergeInfo = mergeCount > 1
        ? `🔗 Merged From: <b>${mergeCount}</b> polygons<br>`
        : '';

    // Calculate intersecting posters
    const intersectingPosters = [];
    const grid = posterRenderer?.getPosterGrid();

    if (grid && data.coords?.length > 0) {
        let polyMinLat = Infinity, polyMaxLat = -Infinity;
        let polyMinLon = Infinity, polyMaxLon = -Infinity;

        data.coords.forEach(coord => {
            polyMinLat = Math.min(polyMinLat, coord[0]);
            polyMaxLat = Math.max(polyMaxLat, coord[0]);
            polyMinLon = Math.min(polyMinLon, coord[1]);
            polyMaxLon = Math.max(polyMaxLon, coord[1]);
        });

        grid.forEach(poster => {
            const intersects = !(
                polyMaxLat < poster.min_lat ||
                polyMinLat > poster.max_lat ||
                polyMaxLon < poster.min_lon ||
                polyMinLon > poster.max_lon
            );
            if (intersects) {
                intersectingPosters.push(poster.id);
            }
        });
    }

    const posterInfo = intersectingPosters.length > 0
        ? `🖼️ Posters: <b>${intersectingPosters.length}</b> <br>`
        : '';

    // Neighbor info
    const connectedLines = data.stats_connected_lines || 0;
    const missingLines = data.stats_missing_lines || 0;

    const neighborInfo = (connectedLines > 0 || missingLines > 0)
        ? `<div style="margin-top:4px; padding:4px; background:#fff3e6; border-radius:4px; border:1px solid #ffd591;">
            <b>🏘️ Neighbors:</b><br>
            ✅ Connected Polygons: <b>${connectedLines}</b><br>
            ⚠️ Missing Polygons: <b style="color:${missingLines > 0 ? '#ff4d4f' : '#52c41a'}">${missingLines}</b>
           </div>`
        : '';

    const statusHtml = getStatusHtml(status);

    return `
        <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
            <b>Polygon Stats:</b><br>
            ${mergeInfo}
            🔵 Blue Circles: <b>${blueCount}</b><br>
            ⚪ White Lines: <b>${whiteLinesCount}</b><br>
            🟢 Green Circles: <b>${greenCount}</b><br>
            ${posterInfo}
            --------------------------<br>
            ∑ Total Circles: <b>${totalPoints}</b>
            ${statusHtml}
        </div>
        ${neighborInfo}
    `;
}

/**
 * Builds stats HTML for White Line elements
 */
export function buildWhiteLineStats(data, status) {
    const blueEndpoints = data.endpoint_blue_circles?.length || 0;
    const greenCount = data.green_circles_count || 0;
    const totalCircles = data.total_circles || (blueEndpoints + greenCount);
    const lineLength = data.length?.toFixed(2) || '?';
    const connectedPolyCount = data.connected_polygons_count || 0;

    const notConnVal = data.stats_not_connected_polygons ?? (2 - connectedPolyCount);
    const notConnHtml = notConnVal !== undefined
        ? `Not Connected Polygons: <b>${notConnVal}</b><br>`
        : '';

    const statusHtml = getStatusHtml(status);

    return `
        <div style="margin-bottom:8px; padding:4px; background:#fff7e6; border-radius:4px; border:1px solid #ffd591;">
            <b>Line Stats:</b><br>
            📏 Length: <b>${lineLength}m</b><br>
            🔵 Blue Endpoints: <b>${blueEndpoints}</b><br>
            🟢 Green Circles: <b>${greenCount}</b><br>
            Connected Polygons: <b>${data.stats_connected_polygons || connectedPolyCount}</b><br>
            ${notConnHtml}
            --------------------------<br>
            ∑ Total Circles: <b>${totalCircles}</b>
            ${statusHtml}
        </div>
    `;
}

/**
 * Builds stats HTML for Blue Circle elements
 */
export function buildBlueCircleStats(data, status) {
    const connectedCount = data.connected_polygons_count || 0;
    const statusHtml = getStatusHtml(status);

    if (data.stats_connected_lines !== undefined) {
        const notConnPolys = data.stats_not_connected_polygons;
        const notConnPolysHtml = notConnPolys !== undefined
            ? `Not Connected Polygons: <b>${notConnPolys}</b><br>`
            : '';

        return `
            <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
                <b>Blue Circle Stats:</b><br>
                Connected lines: <b>${data.stats_connected_lines}</b><br>
                Not Connected lines: <b>${data.stats_not_connected_lines}</b><br>
                Connected Polygons: <b>${data.stats_connected_polygons}</b><br>
                ${notConnPolysHtml}
                ${statusHtml}
            </div>
        `;
    }

    // Fallback for minimal data
    return `
        <div style="margin-bottom:8px; padding:4px; background:#e6f7ff; border-radius:4px; border:1px solid #91d5ff;">
            <b>Blue Circle Stats:</b><br>
            Connections: <b>${data.connections || '?'}</b><br>
            🔗 Polygons: <b>${connectedCount}</b>
            ${statusHtml}
        </div>
    `;
}

/**
 * Builds stats HTML for Green Circle elements
 */
export function buildGreenCircleStats(data, status) {
    const connectedCount = data.connected_polygons_count || 0;
    const lineId = data.line_id || '?';
    const notConnVal = data.stats_not_connected_polygons ?? (2 - connectedCount);
    const notConnHtml = notConnVal !== undefined
        ? `Not Connected Polygons: <b>${notConnVal}</b>`
        : '';

    const statusHtml = getStatusHtml(status);

    return `
        <div style="margin-bottom:8px; padding:4px; background:#e6ffe6; border-radius:4px; border:1px solid #91ff91;">
            <b>Green Circle Stats:</b><br>
            📍 Line ID: <b style="font-size:10px;">${lineId}</b><br>
            Connected Polygons: <b>${data.stats_connected_polygons || connectedCount}</b><br>
            ${notConnHtml}
            ${statusHtml}
        </div>
    `;
}

/**
 * Gets the appropriate stats HTML based on element type
 */
export function getStatsHtml(type, data, status, posterRenderer) {
    if (type === 'Polygon Label' || type === 'Polygon') {
        return buildPolygonStats(data, status, posterRenderer);
    } else if (type === 'White Line') {
        return buildWhiteLineStats(data, status);
    } else if (type.includes('Blue Circle') || type === 'Start/End Node') {
        return buildBlueCircleStats(data, status);
    } else if (type.includes('Green Circle')) {
        return buildGreenCircleStats(data, status);
    }
    return '';
}
