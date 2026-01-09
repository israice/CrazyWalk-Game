/**
 * Graph Builder - Step 3 of Map Generation
 * Creates white lines and green circles
 */

const config = require('../../config');
const { REDIS_KEYS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');
const { haversineDistance, coordKey, parseCoordKey } = require('../../utils/geometry');

const GREEN_CIRCLE_SPACING = config.game.greenCircleSpacing;

/**
 * Rebuild adjacency map from serialized data
 * @param {Array} adjRaw - Serialized adjacency list
 * @returns {Map} Adjacency map
 */
function rebuildAdjacencyMap(adjRaw) {
  const adjacency = new Map();

  if (!adjRaw) return adjacency;

  for (const pair of adjRaw) {
    const uKey = coordKey(pair[0][0], pair[0][1]);
    const vKey = coordKey(pair[1][0], pair[1][1]);

    if (!adjacency.has(uKey)) adjacency.set(uKey, new Set());
    if (!adjacency.has(vKey)) adjacency.set(vKey, new Set());
    adjacency.get(uKey).add(vKey);
    adjacency.get(vKey).add(uKey);
  }

  return adjacency;
}

/**
 * Get relevant nodes set from blue circles
 * @param {Array} blueCirclesData - Blue circles data
 * @returns {Set} Set of relevant node keys
 */
function getRelevantNodes(blueCirclesData) {
  const relevantNodes = new Set();

  if (!blueCirclesData) return relevantNodes;

  for (const bc of blueCirclesData) {
    relevantNodes.add(coordKey(bc.lat, bc.lon));
  }

  return relevantNodes;
}

/**
 * Trace a path between two intersection nodes
 * @param {string} startNodeKey - Starting node key
 * @param {string} neighborKey - Neighbor node key
 * @param {Map} adjacency - Adjacency map
 * @param {Set} relevantNodes - Set of intersection nodes
 * @param {Set} visited - Set of visited edges
 * @returns {Object|null} { pathCoords, endKey, distance } or null
 */
function tracePath(startNodeKey, neighborKey, adjacency, relevantNodes, visited) {
  const [startLat, startLon] = parseCoordKey(startNodeKey);
  const startNode = [startLat, startLon];

  const [neighborLat, neighborLon] = parseCoordKey(neighborKey);
  const pathCoords = [startNode, [neighborLat, neighborLon]];

  let curr = [neighborLat, neighborLon];
  let currKey = neighborKey;
  let prevKey = startNodeKey;
  let dist = haversineDistance(startNode, curr);

  // Follow chain until we hit another intersection
  while (!relevantNodes.has(currKey) && adjacency.has(currKey) && adjacency.get(currKey).size === 2) {
    const neighborKeys = Array.from(adjacency.get(currKey));
    const nextKey = neighborKeys.find(n => n !== prevKey);
    if (!nextKey) break;

    visited.add([currKey, nextKey].sort().join('|'));

    const [nextLat, nextLon] = parseCoordKey(nextKey);
    const nextNode = [nextLat, nextLon];
    pathCoords.push(nextNode);
    dist += haversineDistance(curr, nextNode);

    prevKey = currKey;
    curr = nextNode;
    currKey = nextKey;
  }

  // Only return if we reached another intersection
  if (relevantNodes.has(currKey) && currKey !== startNodeKey) {
    return { pathCoords, endKey: currKey, endNode: curr, distance: dist };
  }

  return null;
}

/**
 * Create green circles along a white line path
 * @param {Array} pathCoords - Path coordinates
 * @param {number} distance - Total path distance
 * @param {number} lineId - White line ID
 * @returns {Array} Green circles array
 */
function createGreenCirclesForPath(pathCoords, distance, lineId) {
  const greenCircles = [];
  const num = Math.max(1, Math.round(distance / GREEN_CIRCLE_SPACING));

  if (num <= 1) return greenCircles;

  const step = distance / num;
  const targets = [];
  for (let k = 1; k < num; k++) {
    targets.push(step * k);
  }

  let tIdx = 0;
  let currDist = 0;
  let count = 0;

  for (let i = 0; i < pathCoords.length - 1 && tIdx < targets.length; i++) {
    const p1 = pathCoords[i];
    const p2 = pathCoords[i + 1];
    const seg = haversineDistance(p1, p2);

    while (tIdx < targets.length && (currDist + seg) >= targets[tIdx]) {
      const rem = targets[tIdx] - currDist;
      const ratio = seg > 0 ? rem / seg : 0;
      const nlat = p1[0] + (p2[0] - p1[0]) * ratio;
      const nlon = p1[1] + (p2[1] - p1[1]) * ratio;

      greenCircles.push({
        id: `gc_${lineId}_${count}`,
        lat: nlat,
        lon: nlon,
        line_id: lineId
      });

      count++;
      tIdx++;
    }
    currDist += seg;
  }

  return greenCircles;
}

/**
 * Create graph elements (white lines and green circles)
 * @returns {Promise<Object>} { whiteLines, greenCircles }
 */
async function createGraphElements() {
  console.log('Step 3 - Creating Graph Elements');

  const blueCirclesData = await loadFromRedis(REDIS_KEYS.BLUE_CIRCLES);
  const adjRaw = await loadFromRedis(REDIS_KEYS.ADJACENCY);

  const relevantNodes = getRelevantNodes(blueCirclesData);
  const adjacency = rebuildAdjacencyMap(adjRaw);

  const whiteLines = [];
  const greenCircles = [];
  const visited = new Set();

  const sortedNodes = Array.from(relevantNodes).sort();

  for (const startNodeKey of sortedNodes) {
    if (!adjacency.has(startNodeKey)) continue;

    const [startLat, startLon] = parseCoordKey(startNodeKey);
    const startNode = [startLat, startLon];
    const neighbors = Array.from(adjacency.get(startNodeKey)).sort();

    for (const neighborKey of neighbors) {
      const edgeKey = [startNodeKey, neighborKey].sort().join('|');
      if (visited.has(edgeKey)) continue;
      visited.add(edgeKey);

      const pathResult = tracePath(startNodeKey, neighborKey, adjacency, relevantNodes, visited);

      if (pathResult) {
        const lineId = whiteLines.length;

        const wl = {
          id: lineId,
          start: startNode,
          end: pathResult.endNode,
          path: pathResult.pathCoords,
          length: pathResult.distance,
          green_count: 0
        };

        const lineGreenCircles = createGreenCirclesForPath(
          pathResult.pathCoords,
          pathResult.distance,
          lineId
        );

        wl.green_count = lineGreenCircles.length;
        greenCircles.push(...lineGreenCircles);
        whiteLines.push(wl);
      }
    }
  }

  await saveToRedis(REDIS_KEYS.WHITE_LINES, whiteLines);
  await saveToRedis(REDIS_KEYS.GREEN_CIRCLES, greenCircles);

  console.log(`Created ${whiteLines.length} white lines, ${greenCircles.length} green circles`);

  return { whiteLines, greenCircles };
}

module.exports = {
  createGraphElements,
  rebuildAdjacencyMap,
  getRelevantNodes,
  tracePath,
  createGreenCirclesForPath
};
