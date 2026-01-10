/**
 * NavigationGraph.js
 * Builds navigation graph from circles and lines for keyboard movement
 */

/**
 * NavigationGraph - Manages node-based navigation for marker movement
 */
class NavigationGraph {
    constructor() {
        this.nodeList = [];
    }

    /**
     * Get or create a node at coordinates (with fuzzy matching)
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {Object} Node object with lat, lon, neighbors
     */
    getNode(lat, lon) {
        const EPSILON = 0.00001; // ~1 meter tolerance
        const existing = this.nodeList.find(n =>
            Math.abs(n.lat - lat) < EPSILON && Math.abs(n.lon - lon) < EPSILON
        );

        if (existing) return existing;

        const newNode = { lat, lon, neighbors: [] };
        this.nodeList.push(newNode);
        return newNode;
    }

    /**
     * Calculate squared distance from point to segment
     * @param {Object} p - Point {lat, lon}
     * @param {Array} a - Segment start [lat, lon]
     * @param {Array} b - Segment end [lat, lon]
     * @returns {number} Squared distance
     */
    distToSegmentSq(p, a, b) {
        const x = p.lon, y = p.lat;
        const x1 = a[1], y1 = a[0];
        const x2 = b[1], y2 = b[0];

        let A = x - x1;
        let B = y - y1;
        let C = x2 - x1;
        let D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = x1; yy = y1;
        } else if (param > 1) {
            xx = x2; yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        return dx * dx + dy * dy;
    }

    /**
     * Get projected distance along path
     * @param {Object} node - Node {lat, lon}
     * @param {Array} path - Array of [lat, lon]
     * @returns {number} Distance along path
     */
    getProjectedDist(node, path) {
        if (!path || path.length < 2) return 0;
        let totalDist = 0;
        let bestDist = 0;
        let minSegDistSq = Infinity;

        const p = [node.lat, node.lon];

        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];

            const segLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

            const ap = [p[0] - a[0], p[1] - a[1]];
            const ab = [b[0] - a[0], b[1] - a[1]];
            const abSq = ab[0] ** 2 + ab[1] ** 2;

            let t = (abSq === 0) ? 0 : (ap[0] * ab[0] + ap[1] * ab[1]) / abSq;
            t = Math.max(0, Math.min(1, t));

            const proj = [a[0] + t * ab[0], a[1] + t * ab[1]];
            const dSq = (p[0] - proj[0]) ** 2 + (p[1] - proj[1]) ** 2;

            if (dSq < minSegDistSq) {
                minSegDistSq = dSq;
                bestDist = totalDist + segLen * t;
            }

            totalDist += segLen;
        }
        return bestDist;
    }

    /**
     * Build navigation graph from game elements
     * @param {Array} greenCircles - Green circle data
     * @param {Array} blueCircles - Blue circle data (intersections)
     * @param {Array} whiteLines - White line data (roads)
     */
    /**
     * Build navigation graph from game elements
     * @param {Array} greenCircles - Green circle data
     * @param {Array} blueCircles - Blue circle data (intersections)
     * @param {Array} whiteLines - White line data (roads)
     */
    build(greenCircles, blueCircles, whiteLines) {
        if (!greenCircles && !blueCircles && !whiteLines) return;

        console.log("NavigationGraph: Building Strict Navigation Graph...");

        // Clear previous nodes
        this.nodeList = [];

        // 1. Register Blue Circles (Intersections)
        this.registerBlueCircles(blueCircles);

        // 2. Process White Lines to build chains
        this.processWhiteLines(whiteLines, greenCircles);

        console.log(`NavigationGraph: Built graph with ${this.nodeList.length} nodes.`);
    }

    /**
     * Register blue circles as nodes
     */
    registerBlueCircles(blueCircles) {
        if (blueCircles) {
            blueCircles.forEach(b => this.getNode(b.lat, b.lon));
        }
    }

    /**
     * Process white lines and link circles along them
     */
    processWhiteLines(whiteLines, greenCircles) {
        if (!whiteLines || !greenCircles) return;

        const greenCircleMap = new Map();
        greenCircles.forEach(g => greenCircleMap.set(g.uid, g));

        whiteLines.forEach(line => {
            const startNode = this.getNode(line.start[0], line.start[1]);
            const endNode = this.getNode(line.end[0], line.end[1]);

            let circlesOnLine = this.findCirclesOnLine(line, greenCircles, greenCircleMap);

            // Sort by distance along path
            const circlesWithDist = circlesOnLine.map(node => ({
                node,
                dist: this.getProjectedDist(node, line.path)
            }));
            circlesWithDist.sort((a, b) => a.dist - b.dist);
            circlesOnLine = circlesWithDist.map(o => o.node);

            // Link chain
            this.linkChain(startNode, endNode, circlesOnLine);
        });
    }

    /**
     * Find all circles that lie on a specific line
     */
    findCirclesOnLine(line, greenCircles, greenCircleMap) {
        let circlesOnLine = [];

        // Use backend UIDs if available
        if (line.green_circles_uids && line.green_circles_uids.length > 0) {
            line.green_circles_uids.forEach(uid => {
                const g = greenCircleMap.get(uid);
                if (g) {
                    circlesOnLine.push(this.getNode(g.lat, g.lon));
                }
            });
        } else {
            // Fallback to geometry-based detection
            greenCircles.forEach(g => {
                let minDSq = Infinity;
                for (let i = 0; i < line.path.length - 1; i++) {
                    const d = this.distToSegmentSq(
                        { lat: g.lat, lon: g.lon },
                        line.path[i],
                        line.path[i + 1]
                    );
                    if (d < minDSq) minDSq = d;
                }
                if (minDSq < 0.00000001) {
                    circlesOnLine.push(this.getNode(g.lat, g.lon));
                }
            });
        }
        return circlesOnLine;
    }

    /**
     * Link nodes in a chain: Start -> C1 -> C2 ... -> End
     */
    linkChain(startNode, endNode, circlesOnLine) {
        let prev = startNode;
        circlesOnLine.forEach(curr => {
            if (curr === prev) return;
            if (!prev.neighbors.includes(curr)) prev.neighbors.push(curr);
            if (!curr.neighbors.includes(prev)) curr.neighbors.push(prev);
            prev = curr;
        });

        // Link last to End
        if (prev !== endNode) {
            if (!prev.neighbors.includes(endNode)) prev.neighbors.push(endNode);
            if (!endNode.neighbors.includes(prev)) endNode.neighbors.push(prev);
        }
    }

    /**
     * Get all nodes
     * @returns {Array} Node list
     */
    getNodes() {
        return this.nodeList;
    }

}

// Export for browser global usage
if (typeof window !== 'undefined') {
    window.NavigationGraph = NavigationGraph;
}
