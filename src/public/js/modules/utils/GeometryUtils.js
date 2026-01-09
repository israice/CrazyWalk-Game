/**
 * GeometryUtils.js
 * 
 * Geometry and intersection utilities for map elements.
 * Extracted from map-logic.js (lines 3316-3367)
 */

/**
 * Check if a line segment intersects with a rectangle
 * Used for debug box intersection detection
 * 
 * @param {Array} lineStart - [lat, lng] coordinates of line start
 * @param {Array} lineEnd - [lat, lng] coordinates of line end
 * @param {Object} rectBounds - Rectangle bounds {north, south, east, west}
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
        return true;
    }

    // Check line-line intersection for each rectangle edge
    const doSegmentsIntersect = (p1, p2, p3, p4) => {
        // p1,p2 = line segment, p3,p4 = rectangle edge
        // Using CCW algorithm
        const ccw = (A, B, C) => {
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
        };
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    };

    for (let i = 0; i < rectEdges.length; i++) {
        const edge = rectEdges[i];
        if (doSegmentsIntersect(lineStart, lineEnd, edge[0], edge[1])) {
            return true;
        }
    }

    return false;
}

/**
 * Calculate distance between two points using Euclidean distance
 * Note: This is an approximation and doesn't account for Earth's curvature
 * For more accurate distance, consider using Haversine formula
 * 
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Euclidean distance in degrees
 */
export function euclideanDistance(lat1, lon1, lat2, lon2) {
    return Math.sqrt(
        Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2)
    );
}

/**
 * Check if a point is within a certain distance of another point
 * 
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @param {number} threshold - Distance threshold in degrees
 * @returns {boolean} True if points are within threshold distance
 */
export function isWithinDistance(lat1, lon1, lat2, lon2, threshold) {
    return euclideanDistance(lat1, lon1, lat2, lon2) < threshold;
}
