/**
 * SnapLogic.js
 * Handles snapping marker position to white lines
 */

/**
 * Calculate squared distance between two points
 * @param {Array} p1 - [lat, lon]
 * @param {Array} p2 - [lat, lon]
 * @returns {number} Squared distance
 */
function distSq(p1, p2) {
    return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;
}

/**
 * Get the closest point on white lines, snapping only if within threshold
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Array} snapLines - Array of paths [[lat,lon], ...]
 * @param {number} thresholdSq - Snap threshold squared (default ~50m)
 * @returns {Array} [lat, lon] - Snapped or original position
 */
function getSnappedPosition(lat, lon, snapLines, thresholdSq = 0.0000002) {
    if (!snapLines || snapLines.length === 0) {
        return [lat, lon];
    }

    let bestPoint = [lat, lon];
    let minDistSq = Infinity;

    snapLines.forEach(path => {
        for (let i = 0; i < path.length - 1; i++) {
            const A = path[i];     // Segment Start
            const B = path[i + 1]; // Segment End
            const P = [lat, lon];  // Point

            // Project point P onto segment AB
            const AP = [P[0] - A[0], P[1] - A[1]];
            const AB = [B[0] - A[0], B[1] - A[1]];
            const abSq = distSq(A, B);

            if (abSq === 0) continue;

            let t = (AP[0] * AB[0] + AP[1] * AB[1]) / abSq;
            t = Math.max(0, Math.min(1, t)); // Clamp

            const closestPoint = [
                A[0] + t * AB[0],
                A[1] + t * AB[1]
            ];

            const d = distSq(P, closestPoint);
            if (d < minDistSq) {
                minDistSq = d;
                bestPoint = closestPoint;
            }
        }
    });

    // Only snap if within threshold
    if (minDistSq < thresholdSq) {
        return bestPoint;
    } else {
        return [lat, lon];
    }
}

// Export for browser global usage
if (typeof window !== 'undefined') {
    window.SnapLogic = { getSnappedPosition };
}
