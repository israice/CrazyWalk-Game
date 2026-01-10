/**
 * MapControls.js
 * Centralized Map Logic for CrazyWalk.
 * - Initialization (Map & Tiles)
 * - Zoom Levels / Constraints
 * - Marker Positioning Rules
 * - Visibility Rules
 */

// Uses SnapLogic, NavigationGraph, KeyboardNavigation from global scope
// (loaded via separate script tags)

class MapControls {
    constructor(elementId, startCoords, options = {}) {
        this.config = {
            defaultZoom: 18,
            minZoom: 3,
            maxZoom: 21,
            zoomSnap: 0,
            ...options
        };

        this.elementId = elementId;
        this.startCoords = startCoords;

        this.map = null;
        this.lastPosition = null;
        this.visibilityRules = [];
        this.snapLines = [];
        this.keyboardEnabled = true;
        this.navNodes = [];

        // Initialize sub-modules
        this.navGraph = new window.NavigationGraph();
        this.keyboardNav = null; // Initialized after map

        this.init();
    }

    init() {
        if (typeof L === 'undefined') {
            console.error("MapControls: Leaflet (L) is not defined.");
            return;
        }

        console.log("MapControls: Initializing Map...");

        // Canvas renderer for performance
        this.canvasRenderer = L.canvas({ padding: 0.5 });

        this.map = L.map(this.elementId, {
            zoomControl: false,
            attributionControl: false,
            keyboard: false,
            zoomSnap: this.config.zoomSnap,
            minZoom: this.config.minZoom,
            maxZoom: this.config.maxZoom,
            preferCanvas: true,
            renderer: this.canvasRenderer
        }).setView(this.startCoords, this.config.defaultZoom);

        // Base Map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd',
            opacity: 1,
            zIndex: 10
        }).addTo(this.map);

        // Labels Layer (hidden at zoom 18+)
        const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd',
            opacity: 1,
            zIndex: 11
        });
        this.addVisibilityRule(labelsLayer, null, 17.99);

        // Zoom event handler
        this.map.on('zoomend', () => this.checkVisibility());

        // Initialize keyboard navigation
        this.keyboardNav = new window.KeyboardNavigation(this);
    }

    getMap() {
        return this.map;
    }

    /**
     * Store lines for snapping logic
     * @param {Array} lines - Array of {path: [[lat,lon], ...]}
     */
    setSnapLines(lines) {
        if (!lines) return;
        this.snapLines = lines.map(l => l.path);
        console.log(`Controls: Loaded ${this.snapLines.length} lines for snapping.`);
    }

    /**
     * Get snapped position (delegates to SnapLogic)
     */
    getSnappedPosition(lat, lon) {
        return window.SnapLogic.getSnappedPosition(lat, lon, this.snapLines);
    }

    /**
     * Add visibility rule for layer based on zoom
     */
    addVisibilityRule(layer, minZoomToShow = null, maxZoomToShow = null) {
        this.visibilityRules.push({ layer, minZoomToShow, maxZoomToShow });
        this.checkVisibility();
    }

    checkVisibility() {
        if (!this.map) return;
        const currentZoom = this.map.getZoom();

        this.visibilityRules.forEach(rule => {
            let shouldShow = true;

            if (rule.minZoomToShow !== null && currentZoom < rule.minZoomToShow) {
                shouldShow = false;
            }
            if (rule.maxZoomToShow !== null && currentZoom > rule.maxZoomToShow) {
                shouldShow = false;
            }

            if (shouldShow) {
                if (!this.map.hasLayer(rule.layer)) {
                    this.map.addLayer(rule.layer);
                }
            } else {
                if (this.map.hasLayer(rule.layer)) {
                    this.map.removeLayer(rule.layer);
                }
            }
        });
    }

    updateUserPosition(marker, lat, lon) {
        const snappedPos = this.getSnappedPosition(lat, lon);
        marker.setLatLng(snappedPos);
        this.lastPosition = snappedPos;
    }

    /**
     * Build navigation graph (delegates to NavigationGraph)
     */
    updateGraph(greenCircles, blueCircles, whiteLines) {
        this.navGraph.build(greenCircles, blueCircles, whiteLines);
        this.navNodes = this.navGraph.getNodes();

        // Bind keyboard if not already bound
        if (!this.keysBound) {
            this.keyboardNav.bind();
            this.keysBound = true;
        }
    }

    // Legacy method wrappers for compatibility
    moveSelection(direction) {
        this.keyboardNav.moveSelection(direction);
    }
}

window.MapControls = MapControls;
