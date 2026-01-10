/**
 * PosterRenderer.js
 * 
 * Manages poster grid rendering, SVG overlays, and reveal masks.
 * Extracted from map-logic.js to improve code organization.
 * 
 * Refactored to act as a coordinator for:
 * - PosterMaskController (Mask logic)
 * - PosterSVGRenderer (DOM rendering)
 * - PosterDebugController (Debug visibility)
 */

import { PosterMaskController } from './posters/PosterMaskController.js';
import { PosterSVGRenderer } from './posters/PosterSVGRenderer.js';
import { PosterDebugController } from './posters/PosterDebugController.js';

export class PosterRenderer {
    constructor(map, postersLayer, gameState) {
        this.map = map;
        this.postersLayer = postersLayer;
        this.gameState = gameState;

        // Internal state
        this.posters = [];
        this.REVEAL_MASK_SVG_ID = 'poster-reveal-mask';

        // Sub-modules
        this.maskController = null;
        this.svgRenderer = new PosterSVGRenderer();
        this.debugController = new PosterDebugController();

        this.posterSvgOverlay = null;
        this.currentPosterGrid = null;

        // External references (needed for debug controller)
        this._userMarker = null;
        this._circleLayerMap = null;
        this._polygonState = null;
        this._lineLayerMap = null;
    }

    /**
     * Initialize poster grid from server data
     * @param {Object} data - Game data containing polygons
     * @param {string} mode - 'initial' or 'expand'
     */
    initPosterGrid(data, mode = 'initial') {
        const isExpanding = mode === 'expand';
        console.log(`DEBUG: Initializing Poster Grid (mode=${mode}, isExpanding=${isExpanding})...`);

        // During expansion, preserve existing overlay to prevent flicker
        if (!isExpanding) {
            if (this.posterSvgOverlay) {
                console.log("DEBUG: Removing existing poster SVG overlay");
                this.posterSvgOverlay.remove();
                this.posterSvgOverlay = null;
                this.maskController = null;
            }
            this.postersLayer.clearLayers();
            this.posters.length = 0;
        } else {
            console.log("DEBUG: Expansion mode - preserving existing poster overlay");
        }

        if (!this.currentPosterGrid || this.currentPosterGrid.length === 0) {
            console.log("DEBUG: No poster_grid from server");
            return;
        }

        console.log(`DEBUG: Using server poster grid with ${this.currentPosterGrid.length} posters`);

        // Find overall bounds for SVG overlay using both posters and polygons
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        this.currentPosterGrid.forEach(poster => {
            minLat = Math.min(minLat, poster.min_lat);
            maxLat = Math.max(maxLat, poster.max_lat);
            minLon = Math.min(minLon, poster.min_lon);
            maxLon = Math.max(maxLon, poster.max_lon);
        });

        // Crucial: Expand bounds to include all polygons to prevent clipping
        if (data && data.polygons) {
            data.polygons.forEach(poly => {
                poly.coords.forEach(coord => {
                    minLat = Math.min(minLat, coord[0]);
                    maxLat = Math.max(maxLat, coord[0]);
                    minLon = Math.min(minLon, coord[1]);
                    maxLon = Math.max(maxLon, coord[1]);
                });
            });
        }

        // Add 5% buffer to prevent edge artifacts
        const latBuffer = (maxLat - minLat) * 0.05;
        const lonBuffer = (maxLon - minLon) * 0.05;
        minLat -= latBuffer; maxLat += latBuffer;
        minLon -= lonBuffer; maxLon += lonBuffer;

        console.log(`DEBUG: SVG Expanded area (with buffer): lat(${minLat.toFixed(5)}, ${maxLat.toFixed(5)}), lon(${minLon.toFixed(5)}, ${maxLon.toFixed(5)})`);

        const svgBounds = L.latLngBounds(
            [minLat, minLon],  // Southwest corner
            [maxLat, maxLon]   // Northeast corner
        );

        // EXPANSION MODE: Update existing overlay bounds instead of recreating
        if (isExpanding && this.posterSvgOverlay) {
            console.log("DEBUG: Expanding existing poster overlay bounds...");

            // Get current bounds
            const currentBounds = this.posterSvgOverlay.getBounds();

            // Extend current bounds to include new bounds
            const extendedBounds = L.latLngBounds(
                [Math.min(currentBounds.getSouth(), minLat), Math.min(currentBounds.getWest(), minLon)],
                [Math.max(currentBounds.getNorth(), maxLat), Math.max(currentBounds.getEast(), maxLon)]
            );

            console.log(`DEBUG: Extended bounds: lat(${extendedBounds.getSouth().toFixed(5)}, ${extendedBounds.getNorth().toFixed(5)}), lon(${extendedBounds.getWest().toFixed(5)}, ${extendedBounds.getEast().toFixed(5)})`);

            // Update overlay bounds (this preserves the mask!)
            this.posterSvgOverlay.setBounds(extendedBounds);

            // Posters array is already populated - just update the SVG
            this.updatePosterSVG();
            return;
        }

        // INITIAL MODE: Create new SVG overlay
        const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svgElement.style.position = "absolute";
        svgElement.style.top = "0";
        svgElement.style.left = "0";
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.pointerEvents = "none";
        svgElement.setAttribute("viewBox", "0 0 1000 1000");
        svgElement.setAttribute("preserveAspectRatio", "none");
        svgElement.innerHTML = `
                <defs>
                    <mask id="poster-reveal-mask">
                        <rect width="1000" height="1000" fill="black"/>
                        <g id="mask-paths-container" fill="white"></g>
                    </mask>
                </defs>
                <g id="debug-poster-bg" style="display:none; opacity: 0.4; pointer-events: none;"></g>
                <g id="poster-images-container" mask="url(#poster-reveal-mask)"></g>
                <g id="debug-poster-overlay" style="display:none; pointer-events: none;"></g>
            `;

        // Add to map pane with correct bounds
        this.posterSvgOverlay = L.svgOverlay(svgElement, svgBounds, {
            interactive: false,
            pane: 'postersPane'
        }).addTo(this.map);

        const maskElement = svgElement.querySelector('#mask-paths-container');
        this.maskController = new PosterMaskController(maskElement);

        // Create posters from server data
        this.currentPosterGrid.forEach(poster => {
            const bounds = [
                [poster.min_lat, poster.min_lon],
                [poster.max_lat, poster.max_lon]
            ];

            this.posters.push({
                bounds,
                id: poster.id,
                imageUrl: poster.image_url
            });

            console.log(`DEBUG: Poster ${poster.id}: lat(${poster.min_lat.toFixed(5)}, ${poster.max_lat.toFixed(5)}), lon(${poster.min_lon.toFixed(5)}, ${poster.max_lon.toFixed(5)})`);

            if (poster.position === 5 && this._userMarker) {
                this.#debugPosterCenter(poster);
            }
        });

        console.log(`DEBUG: Created ${this.posters.length} poster overlays`);
        this.updatePosterSVG();
    }

    /**
     * Helper to debug specific poster centering
     * @private
     */
    #debugPosterCenter(poster) {
        const poster5CenterLat = (poster.min_lat + poster.max_lat) / 2;
        const poster5CenterLon = (poster.min_lon + poster.max_lon) / 2;
        const userPos = this._userMarker.getLatLng();
        console.log(`DEBUG: ========== POSTER #5 CENTER CHECK ==========`);
        console.log(`DEBUG: Poster #5 center: ${poster5CenterLat.toFixed(6)}, ${poster5CenterLon.toFixed(6)}`);
        console.log(`DEBUG: User marker pos:  ${userPos.lat.toFixed(6)}, ${userPos.lng.toFixed(6)}`);
        console.log(`DEBUG: Difference: lat=${Math.abs(poster5CenterLat - userPos.lat).toFixed(6)}, lon=${Math.abs(poster5CenterLon - userPos.lng).toFixed(6)}`);
        console.log(`DEBUG: =============================================`);
    }

    /**
     * Update poster SVG elements (DOM reconciliation)
     * Delegates to PosterSVGRenderer
     */
    updatePosterSVG() {
        if (!this.posterSvgOverlay) return;
        this.svgRenderer.updatePosterSVG(this.posterSvgOverlay, this.posters, this.gameState.isPostersDebugActive);
    }

    /**
     * Update poster visibility based on debug mode
     */
    updatePostersVisibility() {
        this.svgRenderer.updateVisibility(this.posterSvgOverlay, this.gameState.isPostersDebugActive);
        this.updatePosterSVG();
        this.toggleHiddenDebug(this.gameState.isPostersDebugActive);
    }

    /**
     * Toggle visibility of hidden/collected elements in debug mode
     * Delegates to PosterDebugController
     * @param {boolean} show - Whether to show hidden elements
     */
    toggleHiddenDebug(show) {
        if (!this._circleLayerMap || !this._polygonState || !this._lineLayerMap) return;

        const layers = {
            circleLayerMap: this._circleLayerMap,
            lineLayerMap: this._lineLayerMap
        };
        const state = {
            collectedCircles: this.gameState.collectedCircles,
            polygonState: this._polygonState
        };

        this.debugController.toggleHiddenDebug(show, layers, state);
    }

    /**
     * Reveal a polygon part by adding it to the SVG mask
     * @param {Array<Array<number>>} coords - Polygon coordinates [[lat, lon], ...]
     */
    revealPolygonPart(coords) {
        if (this.maskController && this.posterSvgOverlay) {
            this.maskController.revealPolygonPart(coords, this.posterSvgOverlay.getBounds());
        } else {
            console.warn("REVEAL: Skipping - no mask controller or overlay");
        }
    }

    /**
     * Rebuild all paths in the mask (used when restoring state)
     */
    updateMaskPaths() {
        if (this.maskController && this.posterSvgOverlay && this._polygonState) {
            this.maskController.updateMaskPaths(this._polygonState, this.posterSvgOverlay.getBounds());
        }
    }

    /**
     * Set current poster grid data from server
     * @param {Array} posterGrid - Poster grid data from server
     */
    setPosterGrid(posterGrid) {
        this.currentPosterGrid = posterGrid;
    }

    /**
     * Get current poster grid
     * @returns {Array} Current poster grid
     */
    getPosterGrid() {
        return this.currentPosterGrid;
    }
}
