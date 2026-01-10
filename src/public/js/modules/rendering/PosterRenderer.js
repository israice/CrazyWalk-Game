/**
 * PosterRenderer.js
 * Manages poster grid rendering, SVG overlays, and reveal masks.
 */

import { PosterMaskController } from './posters/PosterMaskController.js';
import { PosterSVGRenderer } from './posters/PosterSVGRenderer.js';
import { PosterDebugController } from './posters/PosterDebugController.js';

export class PosterRenderer {
    constructor(map, postersLayer, gameState) {
        this.map = map;
        this.postersLayer = postersLayer;
        this.gameState = gameState;
        this.posters = [];
        this.posterSvgOverlay = null;
        this.currentPosterGrid = null;
        this.maskController = null;
        this.svgRenderer = new PosterSVGRenderer();
        this.debugController = new PosterDebugController();

        // Debug deps
        this._userMarker = this._circleLayerMap = this._polygonState = this._lineLayerMap = null;
    }

    initPosterGrid(data, mode = 'initial') {
        const isExpand = mode === 'expand';
        if (!isExpand) {
            this.posterSvgOverlay?.remove();
            this.posterSvgOverlay = this.maskController = null;
            this.postersLayer.clearLayers();
            this.posters = [];
        }

        if (!this.currentPosterGrid?.length) return;

        // Calculate bounds efficiently
        let bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
        const extend = (lat, lon) => {
            bounds.minLat = Math.min(bounds.minLat, lat);
            bounds.maxLat = Math.max(bounds.maxLat, lat);
            bounds.minLon = Math.min(bounds.minLon, lon);
            bounds.maxLon = Math.max(bounds.maxLon, lon);
        };

        this.currentPosterGrid.forEach(p => {
            extend(p.min_lat, p.min_lon);
            extend(p.max_lat, p.max_lon);
        });

        data.polygons?.forEach(p => p.coords.forEach(c => extend(c[0], c[1])));

        // Add 5% buffer
        const latBuf = (bounds.maxLat - bounds.minLat) * 0.05;
        const lonBuf = (bounds.maxLon - bounds.minLon) * 0.05;
        const southWest = [bounds.minLat - latBuf, bounds.minLon - lonBuf];
        const northEast = [bounds.maxLat + latBuf, bounds.maxLon + lonBuf];
        const newBounds = L.latLngBounds(southWest, northEast);

        if (isExpand && this.posterSvgOverlay) {
            const curr = this.posterSvgOverlay.getBounds();
            this.posterSvgOverlay.setBounds(curr.extend(newBounds));
            this.updatePosterSVG();
            return;
        }

        // Create new SVG
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute('xmlns', "http://www.w3.org/2000/svg");
        svg.setAttribute('viewBox', "0 0 1000 1000");
        svg.setAttribute('preserveAspectRatio', "none");
        Object.assign(svg.style, { position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' });
        svg.innerHTML = `
            <defs><mask id="poster-reveal-mask"><rect width="1000" height="1000" fill="black"/><g id="mask-paths-container" fill="white"></g></mask></defs>
            <g id="debug-poster-bg" style="display:none; opacity: 0.4;"></g>
            <g id="poster-images-container" mask="url(#poster-reveal-mask)"></g>
            <g id="debug-poster-overlay" style="display:none;"></g>`;

        this.posterSvgOverlay = L.svgOverlay(svg, newBounds, { interactive: false, pane: 'postersPane' }).addTo(this.map);
        this.maskController = new PosterMaskController(svg.querySelector('#mask-paths-container'));

        // Prepare posters
        this.posters = this.currentPosterGrid.map(p => ({
            bounds: [[p.min_lat, p.min_lon], [p.max_lat, p.max_lon]],
            id: p.id,
            imageUrl: p.image_url
        }));

        this.updatePosterSVG();
    }

    updatePosterSVG() {
        if (this.posterSvgOverlay) {
            this.svgRenderer.updatePosterSVG(this.posterSvgOverlay, this.posters, this.gameState.isPostersDebugActive);
        }
    }

    updatePostersVisibility() {
        if (!this.posterSvgOverlay) return;
        this.svgRenderer.updateVisibility(this.posterSvgOverlay, this.gameState.isPostersDebugActive);
        this.updatePosterSVG();
        this.toggleHiddenDebug(this.gameState.isPostersDebugActive);
    }

    toggleHiddenDebug(show) {
        if (this._circleLayerMap && this._polygonState && this._lineLayerMap) {
            this.debugController.toggleHiddenDebug(show, {
                circleLayerMap: this._circleLayerMap, lineLayerMap: this._lineLayerMap
            }, {
                collectedCircles: this.gameState.collectedCircles, polygonState: this._polygonState
            });
        }
    }

    revealPolygonPart(coords) {
        if (this.maskController && this.posterSvgOverlay) {
            this.maskController.revealPolygonPart(coords, this.posterSvgOverlay.getBounds());
        }
    }

    updateMaskPaths() {
        if (this.maskController && this.posterSvgOverlay && this._polygonState) {
            this.maskController.updateMaskPaths(this._polygonState, this.posterSvgOverlay.getBounds());
        }
    }

    setPosterGrid(grid) { this.currentPosterGrid = grid; }
    getPosterGrid() { return this.currentPosterGrid; }
}
