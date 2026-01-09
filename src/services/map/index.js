/**
 * Map Generator - Main orchestrator
 * Coordinates all steps of map generation
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { REDIS_KEYS, PATHS } = require('../../config/constants');
const { saveToRedis, loadFromRedis } = require('../redis.service');
const { generateUid, roundCoord } = require('../../utils/geometry');

// Import step modules
const { fetchRedLines } = require('./roadFetcher');
const { identifyIntersections } = require('./intersectionFinder');
const { createGraphElements } = require('./graphBuilder');
const { findPolygons } = require('./polygonFinder');
const { createGroups } = require('./groupCreator');

// Region sizes for retry attempts (in degrees)
const REGION_SIZES = [0.0015, 0.005, 0.01];

/**
 * Filter orphaned white lines and green circles
 * @param {Array} whiteLines - White lines array
 * @param {Array} greenCircles - Green circles array
 * @param {Set} usedIds - Set of used line IDs
 * @returns {Object} { whiteLines, greenCircles }
 */
function filterOrphanedElements(whiteLines, greenCircles, usedIds) {
  const usedIdsStr = new Set(Array.from(usedIds).map(String));
  const origWlCount = whiteLines.length;
  const origGcCount = greenCircles.length;

  const filteredWL = whiteLines.filter(wl => usedIdsStr.has(String(wl.id)));
  const filteredGC = greenCircles.filter(gc => usedIdsStr.has(String(gc.line_id)));

  console.log(`Filtered White Lines: ${origWlCount} -> ${filteredWL.length}`);
  console.log(`Filtered Green Circles: ${origGcCount} -> ${filteredGC.length}`);

  return { whiteLines: filteredWL, greenCircles: filteredGC };
}

/**
 * Calculate polygon total points
 * @param {Array} polygons - Polygons array
 * @param {Array} whiteLines - White lines array
 * @param {Array} blueCircles - Blue circles array
 */
function calculatePolygonPoints(polygons, whiteLines, blueCircles) {
  const lineGreenCounts = {};
  const lineNodesMap = {};

  for (const wl of whiteLines) {
    lineGreenCounts[wl.id] = wl.green_count || 0;
    lineNodesMap[wl.id] = { start: wl.start, end: wl.end };
  }

  const blueCircleCoords = new Set();
  for (const bc of blueCircles) {
    const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
    blueCircleCoords.add(key);
  }

  for (const poly of polygons) {
    let greenTotal = 0;
    const polygonNodes = new Set();

    for (const lineId of poly.boundary_white_lines || []) {
      greenTotal += lineGreenCounts[lineId] || 0;
      const nodes = lineNodesMap[lineId];
      if (nodes) {
        const sKey = `${roundCoord(nodes.start[0])}_${roundCoord(nodes.start[1])}`;
        const eKey = `${roundCoord(nodes.end[0])}_${roundCoord(nodes.end[1])}`;
        polygonNodes.add(sKey);
        polygonNodes.add(eKey);
      }
    }

    let blueCount = 0;
    for (const node of polygonNodes) {
      if (blueCircleCoords.has(node)) blueCount++;
    }

    poly.total_points = greenTotal + blueCount;
  }
}

/**
 * Calculate connections for all elements
 * @param {Array} whiteLines - White lines
 * @param {Array} greenCircles - Green circles
 * @param {Array} blueCircles - Blue circles
 * @param {Array} polygons - Polygons
 * @returns {Array} Filtered blue circles with connections
 */
function calculateConnections(whiteLines, greenCircles, blueCircles, polygons) {
  // White line node data
  const wlNodeData = {};
  for (const wl of whiteLines) {
    const sKey = `${wl.start[0]}_${wl.start[1]}`;
    const eKey = `${wl.end[0]}_${wl.end[1]}`;

    if (!wlNodeData[sKey]) wlNodeData[sKey] = { count: 0, line_ids: [] };
    if (!wlNodeData[eKey]) wlNodeData[eKey] = { count: 0, line_ids: [] };

    wlNodeData[sKey].count++;
    wlNodeData[sKey].line_ids.push(wl.id);
    wlNodeData[eKey].count++;
    wlNodeData[eKey].line_ids.push(wl.id);
  }

  // Filter and enrich blue circles
  let filteredBlueCircles = blueCircles.map(bc => {
    const nodeKey = `${bc.lat}_${bc.lon}`;
    const nodeData = wlNodeData[nodeKey];
    return {
      ...bc,
      active_connections: nodeData ? nodeData.count : 0,
      connected_white_lines: nodeData ? nodeData.line_ids : []
    };
  }).filter(bc => bc.active_connections > 0);

  // White line to polygon mapping
  const wlPolyMap = {};
  for (const wl of whiteLines) {
    wlPolyMap[wl.id] = new Set();
  }

  for (const poly of polygons) {
    for (const lineId of poly.boundary_white_lines || []) {
      if (wlPolyMap[lineId]) {
        wlPolyMap[lineId].add(poly.id);
      }
    }
  }

  // Update white lines with polygon connections
  for (const wl of whiteLines) {
    const connectedPolys = Array.from(wlPolyMap[wl.id] || []);
    wl.connected_polygon_ids = connectedPolys;
    wl.connected_polygons_count = connectedPolys.length;
  }

  // Update green circles with polygon connections
  for (const gc of greenCircles) {
    const connectedPolys = Array.from(wlPolyMap[gc.line_id] || []);
    gc.connected_polygon_ids = connectedPolys;
    gc.connected_polygons_count = connectedPolys.length;
  }

  // Blue circle polygon connections
  const coordToBcId = {};
  for (const bc of filteredBlueCircles) {
    const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
    coordToBcId[key] = bc.id;
  }

  const bcPolyMap = {};
  for (const bc of filteredBlueCircles) {
    bcPolyMap[bc.id] = new Set();
  }

  const lineMap = {};
  for (const wl of whiteLines) {
    lineMap[wl.id] = wl;
  }

  for (const poly of polygons) {
    for (const lineId of poly.boundary_white_lines || []) {
      const wl = lineMap[lineId];
      if (!wl) continue;

      const sKey = `${roundCoord(wl.start[0])}_${roundCoord(wl.start[1])}`;
      const eKey = `${roundCoord(wl.end[0])}_${roundCoord(wl.end[1])}`;

      if (coordToBcId[sKey] && bcPolyMap[coordToBcId[sKey]]) {
        bcPolyMap[coordToBcId[sKey]].add(poly.id);
      }
      if (coordToBcId[eKey] && bcPolyMap[coordToBcId[eKey]]) {
        bcPolyMap[coordToBcId[eKey]].add(poly.id);
      }
    }
  }

  for (const bc of filteredBlueCircles) {
    const connectedPolys = Array.from(bcPolyMap[bc.id] || []);
    bc.connected_polygon_ids = connectedPolys;
    bc.connected_polygons_count = connectedPolys.length;
    bc.is_saturated = bc.active_connections === connectedPolys.length && bc.active_connections > 0;
  }

  // Polygon neighbors
  for (const poly of polygons) {
    const neighborIds = new Set();
    for (const lineId of poly.boundary_white_lines || []) {
      const wl = lineMap[lineId];
      if (!wl) continue;
      for (const pid of wl.connected_polygon_ids || []) {
        if (pid !== poly.id) neighborIds.add(pid);
      }
    }
    poly.neighbor_polygon_ids = Array.from(neighborIds);
    poly.neighbor_polygons_count = neighborIds.size;
  }

  return filteredBlueCircles;
}

/**
 * Create poster grid overlay
 * @param {Array} polygons - Polygons array
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @returns {Promise<Array|null>} Poster grid or null
 */
async function createPosterGrid(polygons, lat, lon) {
  if (polygons.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const poly of polygons) {
    for (const coord of poly.coords || []) {
      minLat = Math.min(minLat, coord[0]);
      maxLat = Math.max(maxLat, coord[0]);
      minLon = Math.min(minLon, coord[1]);
      maxLon = Math.max(maxLon, coord[1]);
    }
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const POSTER_LAT_SIZE = 0.003;
  const POSTER_LON_SIZE = 0.004;

  const startLat = centerLat - (1.5 * POSTER_LAT_SIZE);
  const startLon = centerLon - (1.5 * POSTER_LON_SIZE);

  let availableImages = [];
  if (fs.existsSync(PATHS.POSTERS_DIR)) {
    availableImages = fs.readdirSync(PATHS.POSTERS_DIR).filter(f =>
      ['.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase())
    );
  }

  if (!availableImages.length) {
    availableImages = Array.from({ length: 9 }, (_, i) => `${i + 1}.jpg`);
  }

  // Check cache
  const posterCacheKey = `game:posters:${Math.round(lat * 1000000) / 1000000}_${Math.round(lon * 1000000) / 1000000}`;
  let selectedImages = await loadFromRedis(posterCacheKey);

  if (!selectedImages) {
    if (availableImages.length >= 9) {
      const shuffled = [...availableImages].sort(() => Math.random() - 0.5);
      selectedImages = shuffled.slice(0, 9);
    } else {
      selectedImages = Array.from({ length: 9 }, (_, i) => availableImages[i % availableImages.length]);
    }
    await saveToRedis(posterCacheKey, selectedImages, null);
  }

  const posterGrid = [];
  let imgIdx = 0;

  for (let row = 2; row >= 0; row--) {
    for (let col = 0; col < 3; col++) {
      const posterId = generateUid('POSTER');
      const posterPosition = row * 3 + col + 1;

      posterGrid.push({
        id: posterId,
        position: posterPosition,
        min_lat: startLat + row * POSTER_LAT_SIZE,
        max_lat: startLat + (row + 1) * POSTER_LAT_SIZE,
        min_lon: startLon + col * POSTER_LON_SIZE,
        max_lon: startLon + (col + 1) * POSTER_LON_SIZE,
        image_url: `/GAME_POSTERS/${selectedImages[imgIdx++]}`
      });
    }
  }

  // Assign posters to polygons
  for (const poly of polygons) {
    const polyCoords = poly.coords || [];
    if (!polyCoords.length) {
      poly.poster_ids = [];
      continue;
    }

    const polyMinLat = Math.min(...polyCoords.map(c => c[0]));
    const polyMaxLat = Math.max(...polyCoords.map(c => c[0]));
    const polyMinLon = Math.min(...polyCoords.map(c => c[1]));
    const polyMaxLon = Math.max(...polyCoords.map(c => c[1]));

    const intersecting = [];
    for (const poster of posterGrid) {
      const intersects = !(polyMaxLat < poster.min_lat ||
        polyMinLat > poster.max_lat ||
        polyMaxLon < poster.min_lon ||
        polyMinLon > poster.max_lon);
      if (intersects) intersecting.push(poster.id);
    }
    poly.poster_ids = intersecting;
  }

  return posterGrid;
}

/**
 * Apply mode filtering (initial/expand)
 * @param {string} mode - Mode ('initial' or 'expand')
 * @param {Array} polygons - Polygons
 * @param {Array} whiteLines - White lines
 * @param {Array} greenCircles - Green circles
 * @param {Array} blueCircles - Blue circles
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {Array|null} restoredPolygonIds - Previously visible polygon IDs
 * @returns {Object} Filtered elements
 */
function applyModeFiltering(mode, polygons, whiteLines, greenCircles, blueCircles, lat, lon, restoredPolygonIds) {
  if ((mode !== 'initial' && mode !== 'expand') || polygons.length === 0) {
    return { polygons, whiteLines, greenCircles, blueCircles };
  }

  let connectedPolyIds = null;

  if (mode === 'initial') {
    if (restoredPolygonIds && restoredPolygonIds.length > 0) {
      connectedPolyIds = new Set(restoredPolygonIds);
      console.log(`Initial mode (RESTORE): Restoring ${restoredPolygonIds.length} previously visible polygons`);
    } else {
      // Find nearest green circle
      let minDist = Infinity;
      let nearestGc = null;

      for (const gc of greenCircles) {
        const dist = Math.sqrt((gc.lat - lat) ** 2 + (gc.lon - lon) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearestGc = gc;
        }
      }

      if (nearestGc && nearestGc.connected_polygon_ids) {
        connectedPolyIds = new Set(nearestGc.connected_polygon_ids);
        console.log(`Initial mode: Starting green circle ${nearestGc.id}, connected polygons: ${nearestGc.connected_polygon_ids}`);
      }
    }
  } else if (mode === 'expand') {
    // Find nearest blue circle
    let minDist = Infinity;
    let nearestBc = null;

    for (const bc of blueCircles) {
      const dist = Math.sqrt((bc.lat - lat) ** 2 + (bc.lon - lon) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearestBc = bc;
      }
    }

    if (nearestBc && nearestBc.connected_polygon_ids) {
      connectedPolyIds = new Set(nearestBc.connected_polygon_ids);
      console.log(`Expand mode: Clicked blue circle ${nearestBc.id}, connected polygons: ${nearestBc.connected_polygon_ids}`);
    }
  }

  if (!connectedPolyIds) {
    return { polygons, whiteLines, greenCircles, blueCircles };
  }

  const filteredPolygons = polygons.filter(p => connectedPolyIds.has(p.id));

  const visibleLineIds = new Set();
  for (const poly of filteredPolygons) {
    for (const lineId of poly.boundary_white_lines || []) {
      visibleLineIds.add(lineId);
    }
  }

  const filteredWhiteLines = whiteLines.filter(wl => visibleLineIds.has(wl.id));
  const filteredGreenCircles = greenCircles.filter(gc => visibleLineIds.has(gc.line_id));

  // Collect visible blue circle coords
  const visibleBlueCoords = new Set();
  for (const wl of filteredWhiteLines) {
    const sKey = `${roundCoord(wl.start[0])}_${roundCoord(wl.start[1])}`;
    const eKey = `${roundCoord(wl.end[0])}_${roundCoord(wl.end[1])}`;
    visibleBlueCoords.add(sKey);
    visibleBlueCoords.add(eKey);
  }

  const filteredBlueCircles = blueCircles.filter(bc => {
    const key = `${roundCoord(bc.lat)}_${roundCoord(bc.lon)}`;
    return visibleBlueCoords.has(key);
  });

  console.log(`${mode.toUpperCase()} MODE FILTER: ${polygons.length} -> ${filteredPolygons.length} polygons`);

  return {
    polygons: filteredPolygons,
    whiteLines: filteredWhiteLines,
    greenCircles: filteredGreenCircles,
    blueCircles: filteredBlueCircles
  };
}

/**
 * Main map generation function
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {boolean} forceRebuild - Force regeneration
 * @param {string} mode - 'initial' or 'expand'
 * @param {Array|null} restoredPolygonIds - Previously visible polygon IDs
 * @returns {Promise<Object>} Map data
 */
async function generateMap(lat, lon, forceRebuild = false, mode = 'initial', restoredPolygonIds = null) {
  console.log(`>>> generateMap: lat=${lat}, lon=${lon}, force_rebuild=${forceRebuild}, mode=${mode}, restored_ids=${restoredPolygonIds ? restoredPolygonIds.length : 0}`);

  // Cache check
  const cacheLat = Math.round(lat * 1000) / 1000;
  const cacheLon = Math.round(lon * 1000) / 1000;
  const cacheKey = `map_cache:${cacheLat}_${cacheLon}`;

  if (mode === 'initial' && !forceRebuild) {
    const cachedData = await loadFromRedis(cacheKey);
    if (cachedData) {
      console.log(`CACHE HIT: Returning cached map data for ${cacheKey}`);
      return cachedData;
    }
    console.log(`CACHE MISS: No cached data for ${cacheKey}, generating...`);
  }

  const tStart = Date.now();

  for (let attempt = 0; attempt < REGION_SIZES.length; attempt++) {
    const size = REGION_SIZES[attempt];
    const meters = Math.round(size * 111000);

    console.log('========================================');
    console.log(`GPS POLYGON ATTEMPT ${attempt + 1}/3: region_size=${size} (~${meters}m)`);
    console.log('========================================');

    // Step 1: Fetch roads
    const t0 = Date.now();
    const { segments: redSegments, visual: redVisual } = await fetchRedLines(lat, lon, size, mode);
    console.log(`PERF: Fetch Red Lines took ${((Date.now() - t0) / 1000).toFixed(4)}s`);

    if (!redVisual.length && !redSegments.length) {
      console.warn(`ATTEMPT ${attempt + 1}/3: No roads found for region_size=${size}`);
      if (attempt < REGION_SIZES.length - 1) {
        console.log('Retrying with larger region...');
        continue;
      }
      return { error: 'NO_ROADS', message: `No roads found at (${lat}, ${lon})` };
    }

    console.log(`ATTEMPT ${attempt + 1}/3: Found ${redVisual.length} road segments`);

    // Step 2: Find intersections
    const t1 = Date.now();
    const { blueCircles } = await identifyIntersections();
    console.log(`PERF: Identify Intersections took ${((Date.now() - t1) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attempt + 1}/3: Identified ${blueCircles.length} intersections`);

    // Step 3: Create graph elements
    const t2 = Date.now();
    let { whiteLines, greenCircles } = await createGraphElements();
    console.log(`PERF: Create Graph Elements took ${((Date.now() - t2) / 1000).toFixed(4)}s`);
    console.log(`ATTEMPT ${attempt + 1}/3: Created ${whiteLines.length} white lines, ${greenCircles.length} green circles`);

    // Step 4: Find polygons
    const t3 = Date.now();
    let { polygons, usedIds } = await findPolygons();
    console.log(`PERF: Find Polygons took ${((Date.now() - t3) / 1000).toFixed(4)}s`);

    if (!polygons.length) {
      console.warn(`ATTEMPT ${attempt + 1}/3: No polygons created from roads`);
      if (attempt < REGION_SIZES.length - 1) {
        console.log('Retrying with larger region...');
        continue;
      }
      return { error: 'NO_POLYGONS', message: `No polygons created at (${lat}, ${lon})` };
    }

    console.log(`ATTEMPT ${attempt + 1}/3: Created ${polygons.length} polygons - SUCCESS!`);

    // Filter orphaned elements
    const filtered = filterOrphanedElements(whiteLines, greenCircles, usedIds);
    whiteLines = filtered.whiteLines;
    greenCircles = filtered.greenCircles;

    // Calculate polygon points
    calculatePolygonPoints(polygons, whiteLines, blueCircles);

    // Step 5: Create groups
    const groups = await createGroups();

    // Calculate all connections
    let filteredBlueCircles = calculateConnections(whiteLines, greenCircles, blueCircles, polygons);

    // Create poster grid
    const posterGrid = await createPosterGrid(polygons, lat, lon);

    // Apply mode filtering
    const modeFiltered = applyModeFiltering(
      mode, polygons, whiteLines, greenCircles, filteredBlueCircles, lat, lon, restoredPolygonIds
    );

    polygons = modeFiltered.polygons;
    whiteLines = modeFiltered.whiteLines;
    greenCircles = modeFiltered.greenCircles;
    filteredBlueCircles = modeFiltered.blueCircles;

    console.log('========================================');
    console.log(`SUCCESS on attempt ${attempt + 1}: ${polygons.length} polygons, ${filteredBlueCircles.length} circles, ${whiteLines.length} lines`);
    console.log('========================================');

    const resultData = {
      red_lines: [],
      blue_circles: filteredBlueCircles,
      white_lines: whiteLines,
      green_circles: greenCircles,
      polygons,
      groups,
      poster_grid: posterGrid
    };

    // Save to cache
    if (mode === 'initial') {
      await saveToRedis(cacheKey, resultData, config.cache.mapData);
      console.log(`CACHE SAVED: Stored map data in ${cacheKey}`);
    }

    console.log(`PERF: Total generation took ${((Date.now() - tStart) / 1000).toFixed(4)}s`);

    return resultData;
  }

  return { error: 'UNKNOWN', message: 'Generation failed unexpectedly' };
}

module.exports = {
  generateMap
};
