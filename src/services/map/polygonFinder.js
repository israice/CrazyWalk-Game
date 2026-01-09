/**
 * Polygon Finder - Step 4 of Map Generation
 * Finds minimal cycles (polygons) in the road graph
 */

const path = require('path');
const fs = require('fs');
const turf = require('@turf/turf');
const { REDIS_KEYS, PATHS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');
const { calculatePolygonCentroid, calculateLabelPosition, coordKey, parseCoordKey } = require('../../utils/geometry');

/**
 * Build node adjacency with angle information for planar face detection
 * @param {Array} whiteLines - White lines array
 * @returns {Object} { nodes, edgeData }
 */
function buildPlanarGraph(whiteLines) {
  const nodes = new Map(); // nodeKey -> { lat, lon, neighbors: [{key, angle, lineId}] }
  const edgeData = new Map();

  for (const wl of whiteLines) {
    const uKey = coordKey(wl.start[0], wl.start[1]);
    const vKey = coordKey(wl.end[0], wl.end[1]);
    const edgeKey = [uKey, vKey].sort().join('|');

    if (!nodes.has(uKey)) {
      nodes.set(uKey, { lat: wl.start[0], lon: wl.start[1], neighbors: [] });
    }
    if (!nodes.has(vKey)) {
      nodes.set(vKey, { lat: wl.end[0], lon: wl.end[1], neighbors: [] });
    }

    const uNode = nodes.get(uKey);
    const vNode = nodes.get(vKey);

    const angleUtoV = Math.atan2(vNode.lon - uNode.lon, vNode.lat - uNode.lat);
    const angleVtoU = Math.atan2(uNode.lon - vNode.lon, uNode.lat - vNode.lat);

    uNode.neighbors.push({ key: vKey, angle: angleUtoV, lineId: wl.id });
    vNode.neighbors.push({ key: uKey, angle: angleVtoU, lineId: wl.id });

    edgeData.set(edgeKey, {
      path: wl.path,
      green_count: wl.green_count || 0,
      line_id: wl.id
    });
  }

  // Sort neighbors by angle at each node
  for (const [key, node] of nodes) {
    node.neighbors.sort((a, b) => a.angle - b.angle);
  }

  return { nodes, edgeData };
}

/**
 * Find all minimal faces using "next edge" traversal
 * @param {Map} nodes - Nodes map with angle-sorted neighbors
 * @returns {Array} Array of cycles (each cycle is array of node keys)
 */
function findMinimalCycles(nodes) {
  const usedDirectedEdges = new Set();
  const cycles = [];

  for (const [startKey, startNode] of nodes) {
    for (const neighbor of startNode.neighbors) {
      const directedEdge = `${startKey}->${neighbor.key}`;
      if (usedDirectedEdges.has(directedEdge)) continue;

      // Trace a face starting from this directed edge
      const face = [];
      let currentKey = startKey;
      let nextKey = neighbor.key;
      let maxSteps = 50; // Safety limit

      while (maxSteps-- > 0) {
        const de = `${currentKey}->${nextKey}`;
        if (usedDirectedEdges.has(de)) break;
        usedDirectedEdges.add(de);

        face.push(currentKey);

        if (nextKey === startKey && face.length >= 3) {
          cycles.push([...face]);
          break;
        }

        const nextNode = nodes.get(nextKey);
        if (!nextNode) break;

        // Find incoming angle
        const incomingAngle = Math.atan2(
          nodes.get(currentKey).lon - nextNode.lon,
          nodes.get(currentKey).lat - nextNode.lat
        );

        // Find next neighbor (turning right = smallest angle diff)
        let bestIdx = -1;
        let bestAngleDiff = Infinity;

        for (let i = 0; i < nextNode.neighbors.length; i++) {
          const n = nextNode.neighbors[i];
          if (n.key === currentKey) continue;

          let angleDiff = n.angle - incomingAngle;
          if (angleDiff <= 0) angleDiff += 2 * Math.PI;

          if (angleDiff < bestAngleDiff) {
            bestAngleDiff = angleDiff;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) break;

        currentKey = nextKey;
        nextKey = nextNode.neighbors[bestIdx].key;
      }
    }
  }

  return cycles;
}

/**
 * Convert a cycle to polygon coordinates
 * @param {Array} cycle - Array of node keys
 * @param {Map} edgeData - Edge data map
 * @returns {Object} { coords, boundaryIds, totalPoints }
 */
function cycleToPolygonCoords(cycle, edgeData) {
  const coords = [];
  const bIds = new Set();
  let totalPts = cycle.length;

  const cycleClosed = [...cycle, cycle[0]];

  for (let i = 0; i < cycleClosed.length - 1; i++) {
    const uKey = cycleClosed[i];
    const vKey = cycleClosed[i + 1];
    const edgeKey = [uKey, vKey].sort().join('|');
    const ed = edgeData.get(edgeKey);

    if (!ed) {
      const [uLat, uLon] = parseCoordKey(uKey);
      coords.push([uLat, uLon]);
    } else {
      const pathData = ed.path;
      totalPts += ed.green_count || 0;
      if (ed.line_id !== undefined) bIds.add(ed.line_id);

      const [uLat, uLon] = parseCoordKey(uKey);

      // Determine direction
      let current;
      if (pathData[0][0] === uLat && pathData[0][1] === uLon) {
        current = pathData.slice(0, -1);
      } else {
        current = [...pathData].reverse().slice(0, -1);
      }
      coords.push(...current);
    }
  }

  if (coords.length > 0) {
    coords.push(coords[0]);
  }

  return { coords, boundaryIds: Array.from(bIds), totalPoints: totalPts };
}

/**
 * Validate and filter polygon by area
 * @param {Array} coords - Polygon coordinates
 * @returns {Object|null} { area, turfPolygon } or null if invalid
 */
function validatePolygonArea(coords) {
  try {
    const turfCoords = coords.map(c => [c[1], c[0]]);
    if (turfCoords.length < 4) return null;

    const polygon = turf.polygon([turfCoords]);
    const area = turf.area(polygon);
    const areaInDeg = area / (111000 * 111000);

    // Filter slivers
    if (areaInDeg < 2e-9) return null;

    // Warn about ghosts
    if (areaInDeg > 1e-4) {
      console.warn(`GHOST DETECTED? Massive Polygon: Area=${areaInDeg.toExponential(2)}`);
    }

    return { area, areaInDeg, turfPolygon: polygon };
  } catch (e) {
    return null;
  }
}

/**
 * Create polygon data object
 * @param {Array} coords - Polygon coordinates
 * @param {Array} boundaryIds - Boundary white line IDs
 * @param {number} totalPoints - Total points count
 * @returns {Object} Polygon data
 */
function createPolygonData(coords, boundaryIds, totalPoints) {
  const centroidResult = calculatePolygonCentroid(coords);
  const centerLat = centroidResult[0];
  const centerLon = centroidResult[1];

  const clat = Math.round(centerLat * 100000) / 100000;
  const clon = Math.round(centerLon * 100000) / 100000;
  const stableId = `poly_${clat}_${clon}`.replace(/\./g, '');

  const centerTuple = [centerLat, centerLon];
  const labelDirection = calculateLabelPosition(coords, centerTuple);

  console.log(`Polygon ${stableId}: center=[${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}], angle=${(labelDirection.angle * 180 / Math.PI).toFixed(1)}°`);

  return {
    id: stableId,
    coords,
    center: centerTuple,
    label_direction: labelDirection,
    total_points: totalPoints,
    boundary_white_lines: boundaryIds,
    merge_count: 1
  };
}

/**
 * Assign promo GIFs to polygons
 * @param {Array} polygonsData - Polygons array
 * @returns {Promise<void>}
 */
async function assignPromoGifs(polygonsData) {
  let promoGifs = [];
  if (fs.existsSync(PATHS.PROMOS_DIR)) {
    promoGifs = fs.readdirSync(PATHS.PROMOS_DIR).filter(f => f.toLowerCase().endsWith('.gif'));
  }

  if (promoGifs.length === 0) return;

  for (const poly of polygonsData) {
    const redisKey = `game:promo_assignment:${poly.id}`;
    let assignedGif = await loadFromRedis(redisKey);

    if (!assignedGif) {
      assignedGif = promoGifs[Math.floor(Math.random() * promoGifs.length)];
      await saveToRedis(redisKey, assignedGif, null);
    }

    poly.promo_gif = assignedGif;
  }
}

/**
 * Find polygons from white lines
 * @returns {Promise<Object>} { polygons, usedIds }
 */
async function findPolygons() {
  console.log('Step 4 - Finding Polygons');

  const whiteLines = await loadFromRedis(REDIS_KEYS.WHITE_LINES);

  if (!whiteLines || whiteLines.length === 0) {
    console.log('No white lines found');
    return { polygons: [], usedIds: new Set() };
  }

  const { nodes, edgeData } = buildPlanarGraph(whiteLines);
  const cycles = findMinimalCycles(nodes);

  console.log(`Found ${cycles.length} potential cycles`);

  // Convert cycles to polygons
  const polygonsData = [];
  const processedCycles = new Set();

  for (const cycle of cycles) {
    if (cycle.length < 3) continue;

    // Normalize cycle for deduplication
    const normalized = [...cycle].sort().join('|');
    if (processedCycles.has(normalized)) continue;
    processedCycles.add(normalized);

    const { coords, boundaryIds, totalPoints } = cycleToPolygonCoords(cycle, edgeData);

    if (!coords.length) continue;

    const validation = validatePolygonArea(coords);
    if (!validation) continue;

    const polyData = createPolygonData(coords, boundaryIds, totalPoints);
    polygonsData.push(polyData);
  }

  // Assign promo GIFs
  await assignPromoGifs(polygonsData);

  await saveToRedis(REDIS_KEYS.POLYGONS, polygonsData);

  // Collect used line IDs
  const usedIds = new Set();
  for (const p of polygonsData) {
    for (const lineId of p.boundary_white_lines) {
      usedIds.add(lineId);
    }
  }

  console.log(`Created ${polygonsData.length} polygons`);

  return { polygons: polygonsData, usedIds };
}

module.exports = {
  findPolygons,
  buildPlanarGraph,
  findMinimalCycles,
  cycleToPolygonCoords,
  validatePolygonArea,
  createPolygonData,
  assignPromoGifs
};
