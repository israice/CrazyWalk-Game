/**
 * Map Generator for CrazyWalk Game
 * Ported from Python LocationPolygonsGenerator.py
 * Uses Turf.js for geometric operations
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const turf = require('@turf/turf');

const {
    saveToRedis,
    loadFromRedis,
    KEY_META,
    KEY_RED_LINES,
    KEY_BLUE_CIRCLES,
    KEY_ADJACENCY,
    KEY_WHITE_LINES,
    KEY_GREEN_CIRCLES,
    KEY_POLYGONS,
    KEY_GROUPS
} = require('./redis');

const DATA_DIR = path.join(__dirname, '../../CORE/DATA');

/**
 * Calculate haversine distance between two coordinates in meters
 * @param {Array} coord1 - [lat, lon]
 * @param {Array} coord2 - [lat, lon]
 * @returns {number} Distance in meters
 */
function haversineDistance(coord1, coord2) {
    const R = 6371000; // meters
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
 * Calculate optimal label direction for polygon
 * Finds the direction from center towards the widest part of the polygon.
 *
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
            // Check each boundary segment
            let closestIntersection = null;
            let closestDist = Infinity;

            for (let j = 0; j < boundaryCoords.length - 1; j++) {
                const p1 = boundaryCoords[j];
                const p2 = boundaryCoords[j + 1];

                const intersection = lineSegmentIntersection(
                    centerPoint, farPoint,
                    p1, p2
                );

                if (intersection) {
                    // Calculate euclidean distance in degrees (like Python/Shapely)
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
        console.warn(`_calculate_label_position error: ${e.message}`);
        return { angle: 0, max_distance: 0 };
    }
}

/**
 * Calculate intersection point of two line segments
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
 * Calculate polygon centroid geometrically (like Shapely does)
 * Uses the formula for centroid of a simple polygon
 * Coords are in [lat, lon] format, treated as plain (x, y) = (lat, lon)
 *
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
 * Generate UID
 */
function generateUid(prefix) {
    return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Fetch red lines from Overpass API
 */
async function fetchRedLines(lat, lon, regionSize, mode = 'initial') {
    console.log(`LocationPolygonsGenerator: Step 1 - Fetching Red Lines for ${lat}, ${lon} (mode=${mode})`);

    const minLat = lat - regionSize;
    const maxLat = lat + regionSize;
    const minLon = lon - regionSize;
    const maxLon = lon + regionSize;

    const query = `
    [out:json][timeout:25];
    (
      way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out body;
    >;
    out skel qt;
    `;

    const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
    ];

    console.log(`Racing ${servers.length} Overpass servers simultaneously...`);

    // Race servers
    const fetchPromises = servers.map(async (url) => {
        const response = await axios.post(url, query, {
            headers: { 'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)' },
            timeout: 15000
        });
        return { data: response.data, url };
    });

    let data = null;
    try {
        const result = await Promise.any(fetchPromises);
        console.log(`🏆 WINNER: ${result.url} returned data first!`);
        data = result.data;
    } catch (e) {
        console.error('LocationPolygonsGenerator: All Overpass servers failed.');
        return { segments: [], visual: [] };
    }

    // Process data
    const nodes = {};
    for (const el of data.elements) {
        if (el.type === 'node') {
            nodes[el.id] = [el.lat, el.lon];
        }
    }

    const newRedVisual = [];
    const newRedSegments = [];

    for (const el of data.elements) {
        if (el.type === 'way') {
            const wayNodes = el.nodes || [];
            const coords = wayNodes.filter(nid => nodes[nid]).map(nid => nodes[nid]);

            if (coords.length > 1) {
                newRedVisual.push(coords);
                for (let i = 0; i < coords.length - 1; i++) {
                    newRedSegments.push([coords[i], coords[i + 1]]);
                }
            }
        }
    }

    // Handle expansion mode
    let finalRedVisual = newRedVisual;
    if (mode === 'expand') {
        const existingLines = await loadFromRedis(KEY_RED_LINES) || [];
        console.log(`Expansion: Merging ${newRedVisual.length} new lines with ${existingLines.length} existing lines.`);

        const seenPaths = new Set();
        const combinedVisual = [];

        const normalizePath = (pathData) => {
            const p = Array.isArray(pathData) ? pathData : (pathData.path || pathData);
            return JSON.stringify(p.map(pt => [pt[0], pt[1]]));
        };

        // Add existing
        for (const line of existingLines) {
            try {
                const norm = normalizePath(line);
                if (!seenPaths.has(norm)) {
                    seenPaths.add(norm);
                    combinedVisual.push(line);
                }
            } catch (e) { }
        }

        // Add new
        let newAddedCount = 0;
        for (const line of newRedVisual) {
            try {
                const norm = normalizePath(line);
                if (!seenPaths.has(norm)) {
                    seenPaths.add(norm);
                    combinedVisual.push(line);
                    newAddedCount++;
                }
            } catch (e) { }
        }

        console.log(`Expansion Result: ${combinedVisual.length} total lines (added ${newAddedCount} unique new lines).`);
        finalRedVisual = combinedVisual;
    }

    await saveToRedis(KEY_META, { lat, lon });
    await saveToRedis(KEY_RED_LINES, finalRedVisual);

    return { segments: newRedSegments, visual: finalRedVisual };
}

/**
 * Identify intersections (blue circles)
 */
async function identifyIntersections() {
    console.log('LocationPolygonsGenerator: Step 2 - Identifying Intersections');

    const redLines = [];
    const cached = await loadFromRedis(KEY_RED_LINES);

    if (cached) {
        for (const visual of cached) {
            const coords = visual.path || visual;
            if (!Array.isArray(coords)) continue;

            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = [parseFloat(coords[i][0]), parseFloat(coords[i][1])];
                const p2 = [parseFloat(coords[i + 1][0]), parseFloat(coords[i + 1][1])];
                redLines.push([p1, p2]);
            }
        }
    }

    const nodeCounts = new Map();
    const adjacency = new Map();

    for (const [start, end] of redLines) {
        const startKey = `${start[0]}_${start[1]}`;
        const endKey = `${end[0]}_${end[1]}`;

        nodeCounts.set(startKey, (nodeCounts.get(startKey) || 0) + 1);
        nodeCounts.set(endKey, (nodeCounts.get(endKey) || 0) + 1);

        if (!adjacency.has(startKey)) adjacency.set(startKey, new Set());
        if (!adjacency.has(endKey)) adjacency.set(endKey, new Set());
        adjacency.get(startKey).add(endKey);
        adjacency.get(endKey).add(startKey);
    }

    const blueCircles = [];
    const relevantNodes = new Set();

    for (const [nodeKey, count] of nodeCounts) {
        if (count !== 2) {
            const [lat, lon] = nodeKey.split('_').map(parseFloat);
            blueCircles.push({
                id: nodeKey,
                lat,
                lon,
                connections: count
            });
            relevantNodes.add(nodeKey);
        }
    }

    await saveToRedis(KEY_BLUE_CIRCLES, blueCircles);

    // Serialize adjacency
    const adjList = [];
    const visitedEdges = new Set();
    for (const [u, neighbors] of adjacency) {
        for (const v of neighbors) {
            const edge = [u, v].sort().join('|');
            if (!visitedEdges.has(edge)) {
                visitedEdges.add(edge);
                const [uLat, uLon] = u.split('_').map(parseFloat);
                const [vLat, vLon] = v.split('_').map(parseFloat);
                adjList.push([[uLat, uLon], [vLat, vLon]]);
            }
        }
    }
    await saveToRedis(KEY_ADJACENCY, adjList);

    return { blueCircles, adjacency, relevantNodes };
}

/**
 * Create graph elements (white lines & green circles)
 */
async function createGraphElements() {
    console.log('LocationPolygonsGenerator: Step 3 - Creating Graph Elements');

    const blueCirclesData = await loadFromRedis(KEY_BLUE_CIRCLES);
    const adjRaw = await loadFromRedis(KEY_ADJACENCY);

    const relevantNodes = new Set();
    if (blueCirclesData) {
        for (const bc of blueCirclesData) {
            relevantNodes.add(`${bc.lat}_${bc.lon}`);
        }
    }

    const adjacency = new Map();
    if (adjRaw) {
        for (const pair of adjRaw) {
            const uKey = `${pair[0][0]}_${pair[0][1]}`;
            const vKey = `${pair[1][0]}_${pair[1][1]}`;
            if (!adjacency.has(uKey)) adjacency.set(uKey, new Set());
            if (!adjacency.has(vKey)) adjacency.set(vKey, new Set());
            adjacency.get(uKey).add(vKey);
            adjacency.get(vKey).add(uKey);
        }
    }

    const whiteLines = [];
    const greenCircles = [];
    const visited = new Set();

    const sortedNodes = Array.from(relevantNodes).sort();

    for (const startNodeKey of sortedNodes) {
        if (!adjacency.has(startNodeKey)) continue;
        const [startLat, startLon] = startNodeKey.split('_').map(parseFloat);
        const startNode = [startLat, startLon];

        const neighbors = Array.from(adjacency.get(startNodeKey)).sort();

        for (const neighborKey of neighbors) {
            const edgeKey = [startNodeKey, neighborKey].sort().join('|');
            if (visited.has(edgeKey)) continue;

            const [neighborLat, neighborLon] = neighborKey.split('_').map(parseFloat);
            const pathCoords = [startNode, [neighborLat, neighborLon]];
            let curr = [neighborLat, neighborLon];
            let currKey = neighborKey;
            let prev = startNode;
            let prevKey = startNodeKey;
            let dist = haversineDistance(startNode, curr);

            // Follow chain
            while (!relevantNodes.has(currKey) && adjacency.has(currKey) && adjacency.get(currKey).size === 2) {
                const neighborKeys = Array.from(adjacency.get(currKey));
                const nextKey = neighborKeys.find(n => n !== prevKey);
                if (!nextKey) break;

                visited.add([currKey, nextKey].sort().join('|'));
                const [nextLat, nextLon] = nextKey.split('_').map(parseFloat);
                const nextNode = [nextLat, nextLon];
                pathCoords.push(nextNode);
                dist += haversineDistance(curr, nextNode);
                prevKey = currKey;
                prev = curr;
                currKey = nextKey;
                curr = nextNode;
            }

            visited.add(edgeKey);

            if (relevantNodes.has(currKey) && currKey !== startNodeKey) {
                const wl = {
                    id: whiteLines.length,
                    start: startNode,
                    end: curr,
                    path: pathCoords,
                    length: dist,
                    green_count: 0
                };

                // Green circles
                const targetSpacing = 15.0;
                const num = Math.max(1, Math.round(dist / targetSpacing));
                if (num > 1) {
                    const step = dist / num;
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
                                id: `gc_${wl.id}_${count}`,
                                lat: nlat,
                                lon: nlon,
                                line_id: wl.id
                            });
                            count++;
                            tIdx++;
                        }
                        currDist += seg;
                    }
                    wl.green_count = count;
                }

                whiteLines.push(wl);
            }
        }
    }

    await saveToRedis(KEY_WHITE_LINES, whiteLines);
    await saveToRedis(KEY_GREEN_CIRCLES, greenCircles);

    return { whiteLines, greenCircles };
}

/**
 * Find polygons using minimum cycle basis algorithm
 * This implements a planar graph face detection similar to NetworkX minimum_cycle_basis
 */
async function findPolygons() {
    console.log('LocationPolygonsGenerator: Step 4 - Finding Polygons');

    const whiteLines = await loadFromRedis(KEY_WHITE_LINES);

    if (!whiteLines || whiteLines.length === 0) {
        console.log('No white lines found');
        return { polygons: [], usedIds: new Set() };
    }

    // Build adjacency with angle information for planar face detection
    const nodes = new Map(); // nodeKey -> { lat, lon, neighbors: [{key, angle, lineId}] }
    const edgeData = new Map();

    for (const wl of whiteLines) {
        const uKey = `${wl.start[0]}_${wl.start[1]}`;
        const vKey = `${wl.end[0]}_${wl.end[1]}`;
        const edgeKey = [uKey, vKey].sort().join('|');

        if (!nodes.has(uKey)) {
            nodes.set(uKey, { lat: wl.start[0], lon: wl.start[1], neighbors: [] });
        }
        if (!nodes.has(vKey)) {
            nodes.set(vKey, { lat: wl.end[0], lon: wl.end[1], neighbors: [] });
        }

        // Calculate angles from each node to the other
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

    // Sort neighbors by angle at each node (for planar face traversal)
    for (const [key, node] of nodes) {
        node.neighbors.sort((a, b) => a.angle - b.angle);
    }

    // Find all minimal faces using "next edge" traversal
    // For each directed edge (u->v), find the next edge by turning right (smallest angle change)
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
                    // Completed a cycle
                    cycles.push([...face]);
                    break;
                }

                // Find next edge: from nextKey, find the edge that comes after (currentKey->nextKey) when sorted by angle
                const nextNode = nodes.get(nextKey);
                if (!nextNode) break;

                // Find index of edge coming FROM currentKey
                const incomingAngle = Math.atan2(
                    nodes.get(currentKey).lon - nextNode.lon,
                    nodes.get(currentKey).lat - nextNode.lat
                );

                // Find the next neighbor in sorted order (turning right = next angle)
                let bestIdx = -1;
                let bestAngleDiff = Infinity;

                for (let i = 0; i < nextNode.neighbors.length; i++) {
                    const n = nextNode.neighbors[i];
                    if (n.key === currentKey) continue; // Don't go back

                    // Calculate angle difference (we want the next one counter-clockwise)
                    let angleDiff = n.angle - incomingAngle;
                    if (angleDiff <= 0) angleDiff += 2 * Math.PI;

                    if (angleDiff < bestAngleDiff) {
                        bestAngleDiff = angleDiff;
                        bestIdx = i;
                    }
                }

                if (bestIdx === -1) break; // Dead end

                currentKey = nextKey;
                nextKey = nextNode.neighbors[bestIdx].key;
            }
        }
    }

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
                const [uLat, uLon] = uKey.split('_').map(parseFloat);
                coords.push([uLat, uLon]);
            } else {
                const pathData = ed.path;
                totalPts += ed.green_count || 0;
                if (ed.line_id !== undefined) bIds.add(ed.line_id);

                const [uLat, uLon] = uKey.split('_').map(parseFloat);

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

        // Calculate area using Turf
        try {
            const turfCoords = coords.map(c => [c[1], c[0]]);
            if (turfCoords.length < 4) continue;

            const polygon = turf.polygon([turfCoords]);
            const area = turf.area(polygon);
            const areaInDeg = area / (111000 * 111000); // Approximate conversion

            // Filter slivers and ghosts
            if (areaInDeg < 2e-9) continue;
            if (areaInDeg > 1e-4) {
                console.warn(`GHOST DETECTED? Massive Polygon: Area=${areaInDeg.toExponential(2)}`);
            }

            // Calculate centroid geometrically (like Python/Shapely does)
            // Shapely treats coords as plain (x, y), not geographic, so we do the same
            const centroidResult = calculatePolygonCentroid(coords);
            const centerLat = centroidResult[0];
            const centerLon = centroidResult[1];

            const clat = Math.round(centerLat * 100000) / 100000;
            const clon = Math.round(centerLon * 100000) / 100000;
            const stableId = `poly_${clat}_${clon}`.replace(/\./g, '');

            const centerTuple = [centerLat, centerLon];
            const labelDirection = calculateLabelPosition(coords, centerTuple);

            // Debug logging
            console.log(`Polygon ${stableId}: center=[${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}], angle=${(labelDirection.angle * 180 / Math.PI).toFixed(1)}°`);

            polygonsData.push({
                id: stableId,
                coords,
                center: centerTuple,
                label_direction: labelDirection,
                total_points: totalPts,
                boundary_white_lines: Array.from(bIds),
                merge_count: 1
            });
        } catch (e) {
            console.warn(`Polygon creation error: ${e.message}`);
        }
    }

    // Assign promo GIFs
    const promosDir = path.join(DATA_DIR, 'GAME_PROMOS');
    let promoGifs = [];
    if (fs.existsSync(promosDir)) {
        promoGifs = fs.readdirSync(promosDir).filter(f => f.toLowerCase().endsWith('.gif'));
    }

    if (promoGifs.length > 0) {
        for (const poly of polygonsData) {
            const polyId = poly.id;
            const redisKey = `game:promo_assignment:${polyId}`;

            let assignedGif = await loadFromRedis(redisKey);
            if (!assignedGif) {
                assignedGif = promoGifs[Math.floor(Math.random() * promoGifs.length)];
                await saveToRedis(redisKey, assignedGif, null);
            }
            poly.promo_gif = assignedGif;
        }
    }

    await saveToRedis(KEY_POLYGONS, polygonsData);

    const usedIds = new Set();
    for (const p of polygonsData) {
        for (const lineId of p.boundary_white_lines) {
            usedIds.add(lineId);
        }
    }

    return { polygons: polygonsData, usedIds };
}

/**
 * Create groups
 */
async function createGroups() {
    console.log('LocationPolygonsGenerator: Step 5 - Grouping');

    const polygons = await loadFromRedis(KEY_POLYGONS);
    const groups = [];

    if (polygons && polygons.length > 0) {
        try {
            const turfPolygons = [];
            const sources = [];

            for (const p of polygons) {
                const coords = p.coords.map(c => [c[1], c[0]]);
                if (coords.length >= 4) {
                    try {
                        const poly = turf.polygon([coords]);
                        turfPolygons.push(poly);
                        sources.push({ id: p.id, geom: poly });
                    } catch (e) { }
                }
            }

            if (turfPolygons.length > 0) {
                // Group touching polygons
                const fc = turf.featureCollection(turfPolygons);
                const dissolved = turf.dissolve(fc);

                let geoms = [];
                if (dissolved.type === 'FeatureCollection') {
                    geoms = dissolved.features;
                } else if (dissolved.type === 'Feature') {
                    geoms = [dissolved];
                }

                for (let idx = 0; idx < geoms.length; idx++) {
                    const g = geoms[idx];
                    const boundary = g.geometry.coordinates[0].map(c => [c[1], c[0]]);

                    const mIds = [];
                    for (const s of sources) {
                        try {
                            if (turf.booleanIntersects(g, s.geom)) {
                                mIds.push(s.id);
                            }
                        } catch (e) { }
                    }

                    groups.push({
                        id: `area_${idx}`,
                        coords: boundary,
                        type: 'monolith',
                        polygon_ids: mIds
                    });
                }
            }
        } catch (e) {
            console.error(`LocationPolygonsGenerator: Grouping error: ${e.message}`);
        }
    }

    await saveToRedis(KEY_GROUPS, groups);
    return groups;
}

/**
 * Main map generation function
 */
async function generateMap(lat, lon, forceRebuild = false, mode = 'initial', restoredPolygonIds = null) {
    console.log(`>>> generate_map CALLED: lat=${lat}, lon=${lon}, force_rebuild=${forceRebuild}, mode=${mode}, restored_ids=${restoredPolygonIds ? restoredPolygonIds.length : 0}`);

    // Cache check
    const cacheLat = Math.round(lat * 1000) / 1000;
    const cacheLon = Math.round(lon * 1000) / 1000;
    const cacheKey = `map_cache:${cacheLat}_${cacheLon}`;

    if (mode === 'initial' && !forceRebuild) {
        const cachedData = await loadFromRedis(cacheKey);
        if (cachedData) {
            console.log(`✅ CACHE HIT: Returning cached map data for ${cacheKey}`);
            return cachedData;
        }
        console.log(`❌ CACHE MISS: No cached data for ${cacheKey}, generating...`);
    }

    const REGION_SIZES = [0.0015, 0.005, 0.01];
    const tStart = Date.now();

    for (let attempt = 0; attempt < REGION_SIZES.length; attempt++) {
        const size = REGION_SIZES[attempt];
        const meters = Math.round(size * 111000);

        console.log('========================================');
        console.log(`GPS POLYGON ATTEMPT ${attempt + 1}/3: region_size=${size} (~${meters}m)`);
        console.log('========================================');

        // Step 1: Red Lines
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

        // Step 2: Blue Circles
        const t1 = Date.now();
        const { blueCircles, adjacency, relevantNodes } = await identifyIntersections();
        console.log(`PERF: Identify Intersections took ${((Date.now() - t1) / 1000).toFixed(4)}s`);
        console.log(`ATTEMPT ${attempt + 1}/3: Identified ${blueCircles.length} intersections`);

        // Step 3: White Lines + Green Circles
        const t2 = Date.now();
        let { whiteLines, greenCircles } = await createGraphElements();
        console.log(`PERF: Create Graph Elements took ${((Date.now() - t2) / 1000).toFixed(4)}s`);
        console.log(`ATTEMPT ${attempt + 1}/3: Created ${whiteLines.length} white lines, ${greenCircles.length} green circles`);

        // Step 4: Polygons
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
        const usedIdsStr = new Set(Array.from(usedIds).map(String));
        const origWlCount = whiteLines.length;
        const origGcCount = greenCircles.length;

        whiteLines = whiteLines.filter(wl => usedIdsStr.has(String(wl.id)));
        greenCircles = greenCircles.filter(gc => usedIdsStr.has(String(gc.line_id)));

        console.log(`Filtered White Lines: ${origWlCount} -> ${whiteLines.length}`);
        console.log(`Filtered Green Circles: ${origGcCount} -> ${greenCircles.length}`);

        // Recalculate total_points for polygons
        const lineGreenCounts = {};
        const lineNodesMap = {};
        for (const wl of whiteLines) {
            lineGreenCounts[wl.id] = wl.green_count || 0;
            lineNodesMap[wl.id] = { start: wl.start, end: wl.end };
        }

        const blueCircleCoords = new Set();
        for (const bc of blueCircles) {
            const key = `${Math.round(bc.lat * 10000000) / 10000000}_${Math.round(bc.lon * 10000000) / 10000000}`;
            blueCircleCoords.add(key);
        }

        for (const poly of polygons) {
            let greenTotal = 0;
            const polygonNodes = new Set();

            for (const lineId of poly.boundary_white_lines || []) {
                greenTotal += lineGreenCounts[lineId] || 0;
                const nodes = lineNodesMap[lineId];
                if (nodes) {
                    const sKey = `${Math.round(nodes.start[0] * 10000000) / 10000000}_${Math.round(nodes.start[1] * 10000000) / 10000000}`;
                    const eKey = `${Math.round(nodes.end[0] * 10000000) / 10000000}_${Math.round(nodes.end[1] * 10000000) / 10000000}`;
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

        // Step 5: Groups
        const groups = await createGroups();

        // Calculate connections
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

        let filteredBlueCircles = blueCircles.map(bc => {
            const nodeKey = `${bc.lat}_${bc.lon}`;
            const nodeData = wlNodeData[nodeKey];
            return {
                ...bc,
                active_connections: nodeData ? nodeData.count : 0,
                connected_white_lines: nodeData ? nodeData.line_ids : []
            };
        }).filter(bc => bc.active_connections > 0);

        // Calculate polygon connections
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

        // Update white lines with connections
        for (const wl of whiteLines) {
            const connectedPolys = Array.from(wlPolyMap[wl.id] || []);
            wl.connected_polygon_ids = connectedPolys;
            wl.connected_polygons_count = connectedPolys.length;
        }

        // Update green circles
        for (const gc of greenCircles) {
            const parentLineId = gc.line_id;
            const connectedPolys = Array.from(wlPolyMap[parentLineId] || []);
            gc.connected_polygon_ids = connectedPolys;
            gc.connected_polygons_count = connectedPolys.length;
        }

        // Blue circle polygon connections
        const coordToBcId = {};
        for (const bc of filteredBlueCircles) {
            const key = `${Math.round(bc.lat * 10000000) / 10000000}_${Math.round(bc.lon * 10000000) / 10000000}`;
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

                const sKey = `${Math.round(wl.start[0] * 10000000) / 10000000}_${Math.round(wl.start[1] * 10000000) / 10000000}`;
                const eKey = `${Math.round(wl.end[0] * 10000000) / 10000000}_${Math.round(wl.end[1] * 10000000) / 10000000}`;

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

        // Create poster grid
        let posterGrid = null;
        if (polygons.length > 0) {
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

            const postersDir = path.join(DATA_DIR, 'GAME_POSTERS');
            let availableImages = [];
            if (fs.existsSync(postersDir)) {
                availableImages = fs.readdirSync(postersDir).filter(f =>
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
                    selectedImages = [];
                    const shuffled = [...availableImages].sort(() => Math.random() - 0.5);
                    for (let i = 0; i < 9; i++) {
                        selectedImages.push(shuffled[i]);
                    }
                } else {
                    selectedImages = Array.from({ length: 9 }, (_, i) => availableImages[i % availableImages.length]);
                }
                await saveToRedis(posterCacheKey, selectedImages, null);
            }

            posterGrid = [];
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
        }

        // Apply initial/expand mode filtering
        if ((mode === 'initial' || mode === 'expand') && polygons.length > 0) {
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
                let minDist = Infinity;
                let nearestBc = null;

                for (const bc of filteredBlueCircles) {
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

            if (connectedPolyIds) {
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
                    const sKey = `${Math.round(wl.start[0] * 10000000) / 10000000}_${Math.round(wl.start[1] * 10000000) / 10000000}`;
                    const eKey = `${Math.round(wl.end[0] * 10000000) / 10000000}_${Math.round(wl.end[1] * 10000000) / 10000000}`;
                    visibleBlueCoords.add(sKey);
                    visibleBlueCoords.add(eKey);
                }

                filteredBlueCircles = filteredBlueCircles.filter(bc => {
                    const key = `${Math.round(bc.lat * 10000000) / 10000000}_${Math.round(bc.lon * 10000000) / 10000000}`;
                    return visibleBlueCoords.has(key);
                });

                console.log(`${mode.toUpperCase()} MODE FILTER: ${polygons.length} -> ${filteredPolygons.length} polygons`);

                polygons = filteredPolygons;
                whiteLines = filteredWhiteLines;
                greenCircles = filteredGreenCircles;
            }
        }

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
            await saveToRedis(cacheKey, resultData, 86400);
            console.log(`💾 CACHE SAVED: Stored map data in ${cacheKey}`);
        }

        console.log(`PERF: Total generation took ${((Date.now() - tStart) / 1000).toFixed(4)}s`);

        return resultData;
    }

    return { error: 'UNKNOWN', message: 'Generation failed unexpectedly' };
}

module.exports = {
    generateMap,
    haversineDistance
};
