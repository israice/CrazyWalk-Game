/**
 * Geometric utility functions for CrazyWalk Game
 * Extracted from mapGenerator.js
 */

const crypto = require('crypto');

/**
 * Calculate haversine distance between two coordinates in meters
 * @param {Array} coord1 - [lat, lon]
 * @param {Array} coord2 - [lat, lon]
 * @returns {number} Distance in meters
 */
function haversineDistance(coord1, coord2) {
  const R = 6371000; // Earth radius in meters
  const lat1 = coord1[0] * Math.PI / 180;
  const lon1 = coord1[1] * Math.PI / 180;
  const lat2 = coord2[0] * Math.PI / 180;
  const lon2 = coord2[1] * Math.PI / 180;

  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;

  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate intersection point of two line segments
 * @param {Array} p1 - First point of first segment [x, y]
 * @param {Array} p2 - Second point of first segment [x, y]
 * @param {Array} p3 - First point of second segment [x, y]
 * @param {Array} p4 - Second point of second segment [x, y]
 * @returns {Array|null} [x, y] intersection point or null if no intersection
 */
function lineSegmentIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Parallel lines

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // t must be > 0 (ray from center outward), u must be in [0, 1] (on segment)
  if (t > 0 && u >= 0 && u <= 1) {
    return [
      x1 + t * (x2 - x1),
      y1 + t * (y2 - y1)
    ];
  }
  return null;
}

/**
 * Calculate optimal label direction for polygon
 * Finds the direction from center towards the widest part of the polygon.
 * @param {Array} coords - Polygon coordinates [[lat, lon], ...]
 * @param {Array} center - Center point [lat, lon]
 * @returns {Object} { angle, max_distance }
 */
function calculateLabelPosition(coords, center) {
  try {
    if (!coords || coords.length < 3) {
      return { angle: 0, max_distance: 0 };
    }

    // Convert to [lon, lat] for geometric calculations (like Shapely)
    const centerPoint = [center[1], center[0]]; // (lon, lat)

    // Build polygon boundary segments for intersection
    const boundaryCoords = coords.map(c => [c[1], c[0]]); // [lon, lat]
    if (boundaryCoords[0][0] !== boundaryCoords[boundaryCoords.length - 1][0] ||
        boundaryCoords[0][1] !== boundaryCoords[boundaryCoords.length - 1][1]) {
      boundaryCoords.push(boundaryCoords[0]);
    }

    // Sample 8 directions around the center (every 45 degrees)
    const numSamples = 8;
    let maxDistance = 0;
    let bestAngle = 0;

    for (let i = 0; i < numSamples; i++) {
      const angle = (i * 2 * Math.PI) / numSamples;

      // Create a ray from center in this direction
      const farDistance = 0.01; // ~1km in degrees
      const farPoint = [
        centerPoint[0] + Math.cos(angle) * farDistance,
        centerPoint[1] + Math.sin(angle) * farDistance
      ];

      // Find intersection with polygon boundary
      let closestDist = Infinity;
      let closestIntersection = null;

      for (let j = 0; j < boundaryCoords.length - 1; j++) {
        const p1 = boundaryCoords[j];
        const p2 = boundaryCoords[j + 1];

        const intersection = lineSegmentIntersection(centerPoint, farPoint, p1, p2);

        if (intersection) {
          const dist = Math.sqrt(
            (intersection[0] - centerPoint[0]) ** 2 +
            (intersection[1] - centerPoint[1]) ** 2
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestIntersection = intersection;
          }
        }
      }

      // We want the direction with MAXIMUM distance to boundary
      if (closestIntersection && closestDist > maxDistance) {
        maxDistance = closestDist;
        bestAngle = angle;
      }
    }

    return { angle: bestAngle, max_distance: maxDistance };
  } catch (e) {
    console.warn(`calculateLabelPosition error: ${e.message}`);
    return { angle: 0, max_distance: 0 };
  }
}

/**
 * Calculate polygon centroid geometrically (like Shapely does)
 * Uses the formula for centroid of a simple polygon
 * @param {Array} coords - Polygon coordinates [[lat, lon], ...]
 * @returns {Array} [lat, lon] centroid
 */
function calculatePolygonCentroid(coords) {
  if (!coords || coords.length < 3) {
    return [0, 0];
  }

  // Ensure polygon is closed
  let ring = coords;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring = [...ring, ring[0]];
  }

  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0];     // lat as x
    const y0 = ring[i][1];     // lon as y
    const x1 = ring[i + 1][0];
    const y1 = ring[i + 1][1];

    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea *= 0.5;

  if (Math.abs(signedArea) < 1e-10) {
    // Degenerate polygon, return simple average
    let sumLat = 0, sumLon = 0;
    for (let i = 0; i < coords.length; i++) {
      sumLat += coords[i][0];
      sumLon += coords[i][1];
    }
    return [sumLat / coords.length, sumLon / coords.length];
  }

  cx /= (6 * signedArea);
  cy /= (6 * signedArea);

  return [cx, cy]; // [lat, lon]
}

/**
 * Generate unique ID with prefix
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
function generateUid(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Create a coordinate key from lat/lon
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} Coordinate key
 */
function coordKey(lat, lon) {
  return `${lat}_${lon}`;
}

/**
 * Parse coordinate key back to [lat, lon]
 * @param {string} key - Coordinate key
 * @returns {Array} [lat, lon]
 */
function parseCoordKey(key) {
  return key.split('_').map(parseFloat);
}

/**
 * Round coordinate for comparison (7 decimal places)
 * @param {number} coord - Coordinate value
 * @returns {number} Rounded coordinate
 */
function roundCoord(coord) {
  return Math.round(coord * 10000000) / 10000000;
}

module.exports = {
  haversineDistance,
  lineSegmentIntersection,
  calculateLabelPosition,
  calculatePolygonCentroid,
  generateUid,
  coordKey,
  parseCoordKey,
  roundCoord
};
