/**
 * Planar Graph Builder
 * Builds node adjacency with angle information for planar face detection
 */

const { coordKey } = require('../../utils/geometry');

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

module.exports = { buildPlanarGraph };
