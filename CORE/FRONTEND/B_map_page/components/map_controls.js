/**
 * MapControls.js
 * Centralized Map Logic for CrazyWalk.
 * - Initialization (Map & Tiles)
 * - Zoom Levels / Constraints
 * - Drag Physics (including Rotation Patch)
 * - Marker Positioning Rules
 * - Event Listeners
 * - Snapping Logic (Marker -> White Lines)
 */

class MapControls {
    constructor(elementId, startCoords, options = {}) {
        // Configuration "Rules"
        this.config = {
            defaultZoom: 18, // Adjusted per user request
            minZoom: 3,      // Unrestricted Zoom Out
            maxZoom: 21,     // Keep Max Zoom In
            zoomSnap: 0,     // Smooth zoom
            ...options
        };

        this.elementId = elementId;
        this.startCoords = startCoords; // [lat, lon]

        this.map = null;
        this.lastPosition = null;
        this.visibilityRules = [];
        this.snapLines = []; // Array of arrays of [lat, lon]

        this.init();
    }

    init() {
        // 1. Initialize Leaflet Map
        if (typeof L === 'undefined') {
            console.error("MapControls: Leaflet (L) is not defined.");
            return;
        }

        console.log("MapControls: Initializing Map...");

        this.map = L.map(this.elementId, {
            zoomControl: false,
            attributionControl: false,
            keyboard: false, // Disable default Leaflet panning
            zoomSnap: this.config.zoomSnap,
            minZoom: this.config.minZoom,
            maxZoom: this.config.maxZoom
        }).setView(this.startCoords, this.config.defaultZoom);



        // 2c. CartoDB Dark Matter (No Labels) - Base Map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd',
            opacity: 1,
            zIndex: 10
        }).addTo(this.map);

        // 2d. CartoDB Dark Matter Labels - Overlay
        // Adds street names and city labels in the corresponding dark theme style.
        // 2d. CartoDB Dark Matter Labels - Overlay
        // Adds street names and city labels in the corresponding dark theme style.
        // VISIBILITY RULE: User wants names HIDDEN when Polygons are visible (Zoom 18+).
        // Names should appear when zooming OUT (Zoom < 18).
        const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd',
            opacity: 1,
            zIndex: 11 // Above the base map
        });

        // Add Rule: Show ONLY when Zoom <= 17.99 (Immediately when < 18)
        // This closes the gap between Polygon visibility (Min 18) and Label visibility.
        this.addVisibilityRule(labelsLayer, null, 17.99);

        // 3. Apply Mobile Rotation Drag Patch
        this.applyMobileRotationPatch();

        // 4. Listen for Zoom Events to enforce visibility rules
        this.map.on('zoomend', () => this.checkVisibility());
    }

    getMap() {
        return this.map;
    }

    /**
     * Store lines for snapping logic.
     * @param {Array} lines - Array of {path: [[lat,lon], ...]}
     */
    setSnapLines(lines) {
        if (!lines) return;
        this.snapLines = lines.map(l => l.path);
        console.log(`Controls: Loaded ${this.snapLines.length} lines for snapping.`);
    }

    /**
     * Calculates the closest point on the white lines.
     * Snaps ONLY if within ~50 meters.
     */
    getSnappedPosition(lat, lon) {
        if (!this.snapLines || this.snapLines.length === 0) {
            return [lat, lon];
        }

        let bestPoint = [lat, lon];
        let minDistSq = Infinity;

        // 50m ~ 0.00045 degrees. Squared ~ 2e-7
        const SNAP_THRESHOLD_SQ = 0.0000002;

        // Helper: Squared Distance
        const distSq = (p1, p2) => (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;

        this.snapLines.forEach(path => {
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

                const closestParams = [
                    A[0] + t * AB[0],
                    A[1] + t * AB[1]
                ];

                const d = distSq(P, closestParams);
                if (d < minDistSq) {
                    minDistSq = d;
                    bestPoint = closestParams;
                }
            }
        });

        // Only return best point if it implies a snap within threshold
        if (minDistSq < SNAP_THRESHOLD_SQ) {
            return bestPoint;
        } else {
            console.log(`Controls: Not snapping. Too far (${minDistSq.toFixed(8)} > ${SNAP_THRESHOLD_SQ})`);
            return [lat, lon];
        }
    }

    /**
     * rule: Show layer conditionally based on Zoom.
     * @param {Object} layer - The layer to toggle.
     * @param {Number|null} minZoomToShow - If set, show when currentZoom >= minZoomToShow.
     * @param {Number|null} maxZoomToShow - If set, show when currentZoom <= maxZoomToShow.
     */
    addVisibilityRule(layer, minZoomToShow = null, maxZoomToShow = null) {
        this.visibilityRules.push({ layer, minZoomToShow, maxZoomToShow });
        this.checkVisibility(); // Check immediately
    }

    checkVisibility() {
        if (!this.map) return;
        const currentZoom = this.map.getZoom();

        this.visibilityRules.forEach(rule => {
            let shouldShow = true;

            // Check Min Zoom Constraint
            if (rule.minZoomToShow !== null && currentZoom < rule.minZoomToShow) {
                shouldShow = false;
            }

            // Check Max Zoom Constraint
            if (rule.maxZoomToShow !== null && currentZoom > rule.maxZoomToShow) {
                shouldShow = false;
            }

            if (shouldShow) {
                if (!this.map.hasLayer(rule.layer)) {
                    this.map.addLayer(rule.layer);
                    console.log(`Controls: Showing layer (Zoom ${currentZoom})`);
                }
            } else {
                if (this.map.hasLayer(rule.layer)) {
                    this.map.removeLayer(rule.layer);
                    console.log(`Controls: Hiding layer (Zoom ${currentZoom})`);
                }
            }
        });
    }

    updateUserPosition(marker, lat, lon, isGpsActive) {
        const snappedPos = this.getSnappedPosition(lat, lon);
        marker.setLatLng(snappedPos);

        if (isGpsActive) {
            this.map.setView(snappedPos, this.config.defaultZoom);
        }

        this.lastPosition = snappedPos;
    }

    resetView(lat, lon) {
        this.map.setView([lat, lon], this.config.defaultZoom);
    }

    /**
     * Build navigation graph with STRICT topology.
     * Logic: 
     * 1. Create Nodes for Blue Circles (Intersections).
     * 2. For each White Line (Road):
     *    - Find all Green Circles belonging to this road.
     *    - Sort them from Start to End.
     *    - Link BlueStart -> Green1 -> Green2 -> ... -> BlueEnd.
     */
    updateGraph(greenCircles, blueCircles, whiteLines) {
        if (!greenCircles && !blueCircles && !whiteLines) return;

        console.log("Controls: Building Strict Navigation Graph...");

        // 1. Initialize Node Map
        // Key: "lat,lon" -> Node Object
        const nodeMap = new Map();

        const getNode = (lat, lon) => {
            const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
            if (!nodeMap.has(key)) {
                nodeMap.set(key, { lat, lon, neighbors: [] });
            }
            return nodeMap.get(key);
        };

        // 2. Register Blue Circles (Intersections)
        if (blueCircles) {
            blueCircles.forEach(b => getNode(b.lat, b.lon));
        }

        // 3. Register Green Circles
        // We'll process them per line, but ensure they exist in map
        // Actually, we can just ensure they are created on demand or pre-create.
        // Pre-create for efficiency? No, on demand is fine.

        // Helper to check if point P is on Segment AB
        const distToSegmentSq = (p, a, b) => {
            const x = p.lon, y = p.lat;
            const x1 = a[1], y1 = a[0];
            const x2 = b[1], y2 = b[0]; // Fixed typo: was a[0]

            // Vector math
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
            }
            else if (param > 1) {
                xx = x2; yy = y2;
            }
            else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = x - xx;
            const dy = y - yy;
            return dx * dx + dy * dy;
        };

        // 4. Process White Lines to build chains
        if (whiteLines && greenCircles) {
            // Pre-process Green Circles into a spatial structure or simple list?
            // Simple list is fine.

            whiteLines.forEach(line => {
                const startNode = getNode(line.start[0], line.start[1]);
                const endNode = getNode(line.end[0], line.end[1]);

                // Find Green Circles on this line
                // Logic: A green circle is 'on' this line if it's very close to any segment of the line path.
                // AND it's not the start/end node.

                const circlesOnLine = [];

                greenCircles.forEach(g => {
                    // Check distance to polyline
                    // Optimization: quick bounding box check?
                    // Skip for now.

                    let minDSq = Infinity;
                    for (let i = 0; i < line.path.length - 1; i++) {
                        const p1 = line.path[i];
                        const p2 = line.path[i + 1];
                        const d = distToSegmentSq({ lat: g.lat, lon: g.lon }, p1, p2);
                        if (d < minDSq) minDSq = d;
                    }

                    // Threshold: ~1 meter (approx 1e-10 deg squared)
                    if (minDSq < 0.000000002) {
                        circlesOnLine.push(getNode(g.lat, g.lon));
                    }
                });

                // Sort circles by distance from Start Node
                // Use simple Euclidean from Start Node (valid for non-looping simple roads)
                // For U-shapes, this might fail, but our segments are short.
                circlesOnLine.sort((a, b) => {
                    const dA = (a.lat - startNode.lat) ** 2 + (a.lon - startNode.lon) ** 2;
                    const dB = (b.lat - startNode.lat) ** 2 + (b.lon - startNode.lon) ** 2;
                    return dA - dB;
                });

                // Link Chain
                // Start -> C1 -> C2 ... -> End

                let prev = startNode;
                circlesOnLine.forEach(curr => {
                    // Avoid self-loops if green circle is exactly on start
                    if (curr === prev) return;

                    // Link
                    if (!prev.neighbors.includes(curr)) prev.neighbors.push(curr);
                    if (!curr.neighbors.includes(prev)) curr.neighbors.push(prev);

                    prev = curr;
                });

                // Link last to End
                if (prev !== endNode) {
                    if (!prev.neighbors.includes(endNode)) prev.neighbors.push(endNode);
                    if (!endNode.neighbors.includes(prev)) endNode.neighbors.push(prev);
                }
            });
        }

        this.navNodes = Array.from(nodeMap.values());
        console.log(`Controls: Built Strict Graph with ${this.navNodes.length} nodes.`);

        // Start listening to keys if not already
        if (!this.keysBound) {
            this.bindKeys();
            this.keysBound = true;
        }
    }

    bindKeys() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                    this.moveSelection('UP');
                    break;
                case 'ArrowDown':
                case 's':
                    this.moveSelection('DOWN');
                    break;
                case 'ArrowLeft':
                case 'a':
                    this.moveSelection('LEFT');
                    break;
                case 'ArrowRight':
                case 'd':
                    this.moveSelection('RIGHT');
                    break;
            }
        });
    }

    moveSelection(direction) {
        if (!this.map || !this.navNodes || this.navNodes.length === 0) return;

        // 1. Find node closest to current marker position (or last known position)
        let center = this.lastPosition || this.map.getCenter();
        // lastPosition is [lat, lon] array, navNodes are objects {lat, lon}
        // Normalize center to object
        if (Array.isArray(center)) center = { lat: center[0], lon: center[1] };
        else if (center.lat && center.lng) center = { lat: center.lat, lon: center.lng }; // Leaflet obj

        let currentNode = null;
        let minDistSq = Infinity;

        // Find the node we are currently "on"
        this.navNodes.forEach(node => {
            const d = (node.lat - center.lat) ** 2 + (node.lon - center.lon) ** 2;
            if (d < minDistSq) {
                minDistSq = d;
                currentNode = node;
            }
        });

        if (!currentNode) return;

        // 2. Filter neighbors by direction relative to currentNode
        // Direction Vectors (Normalized)
        const dirVectors = {
            'UP': { x: 0, y: 1 },
            'DOWN': { x: 0, y: -1 },
            'RIGHT': { x: 1, y: 0 },
            'LEFT': { x: -1, y: 0 }
        };

        const targetDir = dirVectors[direction];
        if (!targetDir) return;

        let bestNeighbor = null;
        let maxScore = -Infinity;

        // Strategy: Maximize Alignment (Cosine Similarity).
        // Score = DotProduct(TargetDir, NeighborVector)

        // We iterate ALL neighbors and pick the best alignment.
        // We ignore distance differences (since graph nodes are roughly distinct).

        currentNode.neighbors.forEach(n => {
            let dLat = n.lat - currentNode.lat;
            let dLon = n.lon - currentNode.lon;

            // Correction for Aspect Ratio (Lon degrees shrink as we go North)
            // Cos(32) ~ 0.85. 
            const dLonCorrected = dLon * Math.cos(currentNode.lat * Math.PI / 180);

            // Normalize Vector to Neighbor
            const len = Math.sqrt(dLat * dLat + dLonCorrected * dLonCorrected);
            if (len === 0) return;

            const nX = dLonCorrected / len; // X is East/West
            const nY = dLat / len;          // Y is North/South

            // Dot Product with Target Direction
            const dot = nX * targetDir.x + nY * targetDir.y;

            // Filter: Must be somewhat aligned (e.g. within 60 degrees -> dot > 0.5)
            // A strict intersection logic (UP vs RIGHT) implies dot products:
            // UP neighbor: dot ~ 1.0
            // RIGHT neighbor: dot ~ 0.0
            // 45deg neighbor: dot ~ 0.7
            if (dot > 0.5) {
                if (dot > maxScore) {
                    maxScore = dot;
                    bestNeighbor = n;
                }
            }
        });

        if (bestNeighbor) {
            const newPos = [bestNeighbor.lat, bestNeighbor.lon];

            // Move map center
            this.map.panTo(newPos);

            // Move Selection Marker (if we had a specific one, but we are moving the USER marker?)
            // The user implies: "переносит центр фиолетового круга" -> User Marker.
            // But we must respect the "snap" logic? 
            // Actually, we just update position directly.

            // Find the marker object? 
            // We don't store the marker reference in 'this'. 
            // We need to either store it or emit an event.
            // Let's assume we can access it or update via callback?
            // Easiest: emit event or just set 'lastPosition' and let caller update?
            // BETTER: pass marker to constructor or setters.
            // Current code passes marker to `updateUserPosition`.
            // Let's store the `userMarker` reference when `updateUserPosition` is called?
            // Or just search for it? 

            // Hack: We'll assume the marker is global or passed in. 
            // Actually `updateUserPosition` updates `this.lastPosition`.
            // We can emit a custom event on the map element?

            this.lastPosition = newPos;

            // Dispatch Event so index.html can update the marker visual
            const event = new CustomEvent('map-move-request', {
                detail: { lat: newPos[0], lon: newPos[1] }
            });
            document.dispatchEvent(event);
        }
    }

    applyMobileRotationPatch() {
        // [Existing Patch Code Omitted for brevity in logs, but included in file write]
        if (typeof L === 'undefined') { return; }
        const originalOnMove = L.Draggable.prototype._onMove;
        L.Draggable.prototype._onMove = function (e) {
            if (window.innerWidth <= 1024) {
                if (e.touches && e.touches.length > 1) { this._moved = true; return; }
                var first = (e.touches && e.touches.length === 1 ? e.touches[0] : e);
                var newPoint = new L.Point(first.clientX, first.clientY);
                var offset = newPoint.subtract(this._startPoint);
                var rotatedOffset = new L.Point(offset.y, -offset.x);
                if (!rotatedOffset.x && !rotatedOffset.y) { return; }
                if (Math.abs(rotatedOffset.x) + Math.abs(rotatedOffset.y) < this.options.clickTolerance) { return; }
                e.preventDefault();
                if (!this._moved) {
                    this.fire('dragstart');
                    this._moved = true;
                    this._startPos = L.DomUtil.getPosition(this._element).subtract(rotatedOffset);
                    L.DomUtil.addClass(document.body, 'leaflet-dragging');
                    this._lastTarget = e.target || e.srcElement;
                    if (window.SVGElementInstance && this._lastTarget instanceof SVGElementInstance) {
                        this._lastTarget = this._lastTarget.correspondingUseElement;
                    }
                    L.DomUtil.addClass(this._lastTarget, 'leaflet-drag-target');
                }
                this._newPos = this._startPos.add(rotatedOffset);
                this._animated = true;
                L.Util.cancelAnimFrame(this._animRequest);
                this._lastEvent = e;
                this._animRequest = L.Util.requestAnimFrame(this._updatePosition, this, true);
            } else {
                originalOnMove.call(this, e);
            }
        };
        console.log("MapControls: Mobile rotation patch applied.");
    }
}

window.MapControls = MapControls;
