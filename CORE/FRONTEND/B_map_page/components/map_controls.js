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
