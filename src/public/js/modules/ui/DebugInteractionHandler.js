/**
 * DebugInteractionHandler.js
 * Handles debug interactions: selecting elements, highlighting connections,
 * and generating detailed HTML popups with statistics.
 * 
 * Refactored: Logic split into DebugHighlighter, DebugStatsBuilder, DebugPopupBuilder
 */

import { resetSelection } from './DebugMode.js';
import {
    highlightPolygon,
    highlightWhiteLine,
    highlightGeneric,
    highlightLabel
} from './DebugHighlighter.js';
import { getElementStatus, getStatsHtml } from './DebugStatsBuilder.js';
import { openDebugPopup } from './DebugPopupBuilder.js';

export class DebugInteractionHandler {
    constructor(map, gameState, posterRenderer) {
        this.map = map;
        this.gameState = gameState;
        this.posterRenderer = posterRenderer;

        // Lazy references to layer maps (set via setLayerMaps)
        this.lineLayerMap = null;
        this.circleLayerMap = null;
        this.blueCircleLayerMap = null;
        this.greenCirclesByLine = null;
        this.polygonState = null;
    }

    /**
     * Updates references to the vital data maps used for lookups
     */
    setLayerMaps({ lineMap, circleMap, blueMap, greenByLine, polyState }) {
        this.lineLayerMap = lineMap;
        this.circleLayerMap = circleMap;
        this.blueCircleLayerMap = blueMap;
        this.greenCirclesByLine = greenByLine;
        this.polygonState = polyState;
    }

    /**
     * Gets layer maps object for passing to highlighter functions
     */
    getLayerMaps() {
        return {
            lineLayerMap: this.lineLayerMap,
            circleLayerMap: this.circleLayerMap,
            blueCircleLayerMap: this.blueCircleLayerMap,
            greenCirclesByLine: this.greenCirclesByLine,
            polygonState: this.polygonState
        };
    }

    /**
     * Attaches click handler to a layer for Debug Mode
     * @param {Object} layer - Leaflet layer
     * @param {Object} data - Data object associated with the layer
     * @param {String} type - Human readable type (e.g. "Polygon", "Blue Circle")
     */
    attachDebugClick(layer, data, type) {
        layer.on('click', (e) => {
            if (!this.gameState.isDebugActive) return;
            L.DomEvent.stopPropagation(e);

            // Get visual proxy if available (for Hit Layers)
            const targetLayer = layer.visualSibling || layer;
            const layerMaps = this.getLayerMaps();

            // Handle highlighting based on element type
            this.handleHighlighting(type, data, layer, targetLayer, layerMaps);

            // Determine element status
            const status = getElementStatus(type, data, this.gameState, this.polygonState);

            // Get appropriate stats HTML
            const statsHtml = getStatsHtml(type, data, status, this.posterRenderer);

            // Open debug popup
            openDebugPopup(this.map, e.latlng, type, data, statsHtml);
        });
    }

    /**
     * Handles highlighting logic for different element types
     */
    handleHighlighting(type, data, layer, targetLayer, layerMaps) {
        if (type === 'Polygon Label' && data.boundary_white_lines) {
            // Polygon with boundary lines - highlight all related elements
            highlightPolygon(data, targetLayer, layerMaps);
            highlightLabel(layer);
        } else if (type === 'White Line' && data.uid) {
            // White line - highlight endpoints and green circles
            highlightWhiteLine(data, layerMaps);
        } else {
            // Generic element - simple highlight
            highlightGeneric(targetLayer, type);
        }
    }
}
