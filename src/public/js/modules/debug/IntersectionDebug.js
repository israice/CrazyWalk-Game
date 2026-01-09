/**
 * IntersectionDebug.js
 * 
 * Debug tools for checking line intersections with debug boxes.
 * Extracted from map-logic.js for better code organization.
 */

/**
 * Check if a line segment intersects with a rectangle (debug box)
 * @param {Array<number>} lineStart - Line start [lat, lng]
 * @param {Array<number>} lineEnd - Line end [lat, lng]
 * @param {Object} rectBounds - Rectangle bounds { north, south, east, west }
 * @returns {boolean} True if line intersects rectangle
 */
export function lineIntersectsRect(lineStart, lineEnd, rectBounds) {
    // Rectangle corners
    const rectCorners = [
        [rectBounds.north, rectBounds.west],  // Top-left
        [rectBounds.north, rectBounds.east],  // Top-right
        [rectBounds.south, rectBounds.east],  // Bottom-right
        [rectBounds.south, rectBounds.west]   // Bottom-left
    ];

    const rectEdges = [
        [rectCorners[0], rectCorners[1]], // Top edge
        [rectCorners[1], rectCorners[2]], // Right edge
        [rectCorners[2], rectCorners[3]], // Bottom edge
        [rectCorners[3], rectCorners[0]]  // Left edge
    ];

    // Check if line endpoints are inside rectangle
    const p1Inside = lineStart[0] >= rectBounds.south && lineStart[0] <= rectBounds.north &&
        lineStart[1] >= rectBounds.west && lineStart[1] <= rectBounds.east;
    const p2Inside = lineEnd[0] >= rectBounds.south && lineEnd[0] <= rectBounds.north &&
        lineEnd[1] >= rectBounds.west && lineEnd[1] <= rectBounds.east;

    if (p1Inside || p2Inside) {
        console.log(`  Point inside: p1=${p1Inside}, p2=${p2Inside}`);
        return true;
    }

    // Check line-line intersection for each rectangle edge
    const doSegmentsIntersect = (p1, p2, p3, p4) => {
        // p1,p2 = line segment, p3,p4 = rectangle edge
        // Using CCW algorithm
        const ccw = (A, B, C) => {
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
        };
        const result = ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
        return result;
    };

    for (let i = 0; i < rectEdges.length; i++) {
        const edge = rectEdges[i];
        if (doSegmentsIntersect(lineStart, lineEnd, edge[0], edge[1])) {
            console.log(`  Intersects edge ${i}: ${edge[0]} -> ${edge[1]}`);
            return true;
        }
    }

    return false;
}

/**
 * Update white line colors based on debug box intersections
 * @param {Map} polygonState - Polygon state map
 * @param {Map} lineLayerMap - Line layer map
 */
export function updateDebugBoxIntersections(polygonState, lineLayerMap) {
    if (!polygonState || !lineLayerMap) return;

    console.log('DEBUG: Checking debug box intersections...');

    polygonState.forEach(state => {
        if (!state.debugBox || !state.lines) return;

        const map = state.debugBox._map;
        if (!map) return;

        // Get debug box center (polygon center) and icon properties
        const boxCenter = state.debugBox.getLatLng();
        const icon = state.debugBox.options.icon;
        const iconSize = icon.options.iconSize; // [width, height]
        const iconAnchor = icon.options.iconAnchor; // [x, y] from top-left to center point

        // Calculate the four corners of the debug box in lat/lng
        // iconAnchor tells us where the center point is within the icon
        // So the box extends from center - anchor to center + (size - anchor)

        const centerPoint = map.latLngToLayerPoint(boxCenter);

        // Calculate pixel bounds
        const topLeftPx = {
            x: centerPoint.x - iconAnchor[0],
            y: centerPoint.y - iconAnchor[1]
        };
        const bottomRightPx = {
            x: topLeftPx.x + iconSize[0],
            y: topLeftPx.y + iconSize[1]
        };

        // Convert to lat/lng
        const topLeft = map.layerPointToLatLng([topLeftPx.x, topLeftPx.y]);
        const bottomRight = map.layerPointToLatLng([bottomRightPx.x, bottomRightPx.y]);
        const topRight = map.layerPointToLatLng([bottomRightPx.x, topLeftPx.y]);
        const bottomLeft = map.layerPointToLatLng([topLeftPx.x, bottomRightPx.y]);

        const rectBounds = {
            north: Math.max(topLeft.lat, topRight.lat, bottomLeft.lat, bottomRight.lat),
            south: Math.min(topLeft.lat, topRight.lat, bottomLeft.lat, bottomRight.lat),
            east: Math.max(topLeft.lng, topRight.lng, bottomLeft.lng, bottomRight.lng),
            west: Math.min(topLeft.lng, topRight.lng, bottomLeft.lng, bottomRight.lng)
        };

        console.log(`DEBUG: Box bounds for polygon at (${boxCenter.lat}, ${boxCenter.lng}):`, rectBounds);

        // Check each boundary line
        state.lines.forEach(lineId => {
            const lineComposite = lineLayerMap.get(String(lineId));
            if (!lineComposite || !lineComposite.visual) return;

            const lineLatLngs = lineComposite.visual.getLatLngs();

            // Check each segment of the polyline
            let intersects = false;
            for (let i = 0; i < lineLatLngs.length - 1; i++) {
                const start = [lineLatLngs[i].lat, lineLatLngs[i].lng];
                const end = [lineLatLngs[i + 1].lat, lineLatLngs[i + 1].lng];

                if (lineIntersectsRect(start, end, rectBounds)) {
                    intersects = true;
                    console.log(`DEBUG: Line segment [${start}] -> [${end}] intersects box`);
                    break;
                }
            }

            // Change color if intersects
            if (intersects) {
                lineComposite.visual.setStyle({ color: 'blue' });
                console.log(`DEBUG: Line ${lineId} intersects with debug box - colored blue`);
            }
        });
    });
}

/**
 * Reset all white lines to original color
 * @param {Map} lineLayerMap - Line layer map
 */
export function resetWhiteLineColors(lineLayerMap) {
    if (!lineLayerMap) return;

    console.log('DEBUG: Resetting white line colors...');

    lineLayerMap.forEach((lineComposite, lineId) => {
        if (lineComposite && lineComposite.visual) {
            lineComposite.visual.setStyle({ color: 'white' });
        }
    });
}
