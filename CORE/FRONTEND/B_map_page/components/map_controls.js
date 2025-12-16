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
            zoomSnap: this.config.zoomSnap,
            minZoom: this.config.minZoom,
            maxZoom: this.config.maxZoom
        }).setView(this.startCoords, this.config.defaultZoom);

        // 2. Add Dark Matter Tile Layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 18, // Tiles can go deeper regardless of map constraint
            subdomains: 'abcd',
            updateWhenIdle: false,
            keepBuffer: 10
        }).addTo(this.map);

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
     */
    getSnappedPosition(lat, lon) {
        if (!this.snapLines || this.snapLines.length === 0) {
            return [lat, lon];
        }

        let bestPoint = [lat, lon];
        let minDistSq = Infinity;

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

        return bestPoint;
    }

    /**
     * rule: Show layer ONLY if zoom >= minZoomToShow
     */
    addVisibilityRule(layer, minZoomToShow) {
        this.visibilityRules.push({ layer, minZoomToShow });
        this.checkVisibility(); // Check immediately
    }

    checkVisibility() {
        if (!this.map) return;
        const currentZoom = this.map.getZoom();
        this.visibilityRules.forEach(rule => {
            if (currentZoom >= rule.minZoomToShow) {
                if (!this.map.hasLayer(rule.layer)) {
                    this.map.addLayer(rule.layer);
                    console.log(`Controls: Showing layer (Zoom ${currentZoom} >= ${rule.minZoomToShow})`);
                }
            } else {
                if (this.map.hasLayer(rule.layer)) {
                    this.map.removeLayer(rule.layer);
                    console.log(`Controls: Hiding layer (Zoom ${currentZoom} < ${rule.minZoomToShow})`);
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
     * Build navigation graph from Green & Blue circles.
     * Logic: Connect any two nodes if d < threshold (approx 18m).
     */
    updateGraph(greenCircles, blueCircles) {
        if (!greenCircles && !blueCircles) return;

        const allNodes = [];
        if (greenCircles) allNodes.push(...greenCircles);
        if (blueCircles) allNodes.push(...blueCircles);

        // Deduplicate or just treat them as point cloud. 
        // Simple O(N^2) for N < 200 is fine. If N > 1000, we might need spatial index.
        // Assuming local area (~50 nodes), N^2 is trivial.

        this.navNodes = allNodes.map(n => ({ lat: n.lat, lon: n.lon, neighbors: [] }));

        const THRESHOLD_METERS = 20;
        const THRESHOLD_DEG = THRESHOLD_METERS / 111320; // Approx conversion

        for (let i = 0; i < this.navNodes.length; i++) {
            for (let j = i + 1; j < this.navNodes.length; j++) {
                const u = this.navNodes[i];
                const v = this.navNodes[j];

                const dLat = u.lat - v.lat;
                const dLon = u.lon - v.lon;
                const distSq = dLat * dLat + dLon * dLon;

                if (distSq < THRESHOLD_DEG * THRESHOLD_DEG) {
                    u.neighbors.push(v);
                    v.neighbors.push(u);
                }
            }
        }

        console.log(`Controls: Built Nav Graph with ${this.navNodes.length} nodes.`);

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
        // UP: lat > current.lat
        // DOWN: lat < current.lat
        // RIGHT: lon > current.lon
        // LEFT: lon < current.lon

        let bestNeighbor = null;
        let bestScore = Infinity; // We want shortest distance to the ideal vector or just shortest dist? 
        // Strategy: Smallest angle deviation + reasonably close?
        // Simple Strategy: Filter by quadrant, then pick closest.

        const validNeighbors = currentNode.neighbors.filter(n => {
            const dLat = n.lat - currentNode.lat;
            const dLon = n.lon - currentNode.lon;

            switch (direction) {
                case 'UP': return dLat > 0 && Math.abs(dLat) > Math.abs(dLon) * 0.5; // Mostly Up
                case 'DOWN': return dLat < 0 && Math.abs(dLat) > Math.abs(dLon) * 0.5;
                case 'RIGHT': return dLon > 0 && Math.abs(dLon) > Math.abs(dLat) * 0.5;
                case 'LEFT': return dLon < 0 && Math.abs(dLon) > Math.abs(dLat) * 0.5;
                default: return false;
            }
        });

        if (validNeighbors.length === 0) {
            console.log("Nav: Dead end or no node in that direction.");
            return;
        }

        // Pick closest valid neighbor
        validNeighbors.forEach(n => {
            const d = (n.lat - currentNode.lat) ** 2 + (n.lon - currentNode.lon) ** 2;
            if (d < bestScore) {
                bestScore = d;
                bestNeighbor = n;
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
