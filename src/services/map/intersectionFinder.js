/**
 * Intersection Finder - Step 2 of Map Generation
 * Identifies road intersections (blue circles)
 */

const { REDIS_KEYS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');
const { coordKey, parseCoordKey } = require('../../utils/geometry');

/**
 * Build adjacency data from road segments
 * @param {Array} redLines - Array of road visual data
 * @returns {Object} { nodeCounts, adjacency }
 */
function buildAdjacencyFromRoads(redLines) {
  const segments = [];

  for (const visual of redLines) {
    const coords = visual.path || visual;
    if (!Array.isArray(coords)) continue;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = [parseFloat(coords[i][0]), parseFloat(coords[i][1])];
      const p2 = [parseFloat(coords[i + 1][0]), parseFloat(coords[i + 1][1])];
      segments.push([p1, p2]);
    }
  }

  const nodeCounts = new Map();
  const adjacency = new Map();

  for (const [start, end] of segments) {
    const startKey = coordKey(start[0], start[1]);
    const endKey = coordKey(end[0], end[1]);

    nodeCounts.set(startKey, (nodeCounts.get(startKey) || 0) + 1);
    nodeCounts.set(endKey, (nodeCounts.get(endKey) || 0) + 1);

    if (!adjacency.has(startKey)) adjacency.set(startKey, new Set());
    if (!adjacency.has(endKey)) adjacency.set(endKey, new Set());
    adjacency.get(startKey).add(endKey);
    adjacency.get(endKey).add(startKey);
  }

  return { nodeCounts, adjacency };
}

/**
 * Find intersection nodes (nodes with count != 2)
 * @param {Map} nodeCounts - Map of node key to connection count
 * @returns {Object} { blueCircles, relevantNodes }
 */
function findIntersectionNodes(nodeCounts) {
  const blueCircles = [];
  const relevantNodes = new Set();

  for (const [nodeKey, count] of nodeCounts) {
    if (count !== 2) {
      const [lat, lon] = parseCoordKey(nodeKey);
      blueCircles.push({
        id: nodeKey,
        lat,
        lon,
        connections: count
      });
      relevantNodes.add(nodeKey);
    }
  }

  return { blueCircles, relevantNodes };
}

/**
 * Serialize adjacency map for Redis storage
 * @param {Map} adjacency - Adjacency map
 * @returns {Array} Serialized adjacency list
 */
function serializeAdjacency(adjacency) {
  const adjList = [];
  const visitedEdges = new Set();

  for (const [u, neighbors] of adjacency) {
    for (const v of neighbors) {
      const edge = [u, v].sort().join('|');
      if (!visitedEdges.has(edge)) {
        visitedEdges.add(edge);
        const [uLat, uLon] = parseCoordKey(u);
        const [vLat, vLon] = parseCoordKey(v);
        adjList.push([[uLat, uLon], [vLat, vLon]]);
      }
    }
  }

  return adjList;
}

/**
 * Identify intersections from cached red lines
 * @returns {Promise<Object>} { blueCircles, adjacency, relevantNodes }
 */
async function identifyIntersections() {
  console.log('Step 2 - Identifying Intersections');

  const cached = await loadFromRedis(REDIS_KEYS.RED_LINES);
  if (!cached || !cached.length) {
    console.warn('No red lines found in cache');
    return { blueCircles: [], adjacency: new Map(), relevantNodes: new Set() };
  }

  const { nodeCounts, adjacency } = buildAdjacencyFromRoads(cached);
  const { blueCircles, relevantNodes } = findIntersectionNodes(nodeCounts);

  // Save to Redis
  await saveToRedis(REDIS_KEYS.BLUE_CIRCLES, blueCircles);
  await saveToRedis(REDIS_KEYS.ADJACENCY, serializeAdjacency(adjacency));

  console.log(`Found ${blueCircles.length} intersections`);

  return { blueCircles, adjacency, relevantNodes };
}

module.exports = {
  identifyIntersections,
  buildAdjacencyFromRoads,
  findIntersectionNodes,
  serializeAdjacency
};
